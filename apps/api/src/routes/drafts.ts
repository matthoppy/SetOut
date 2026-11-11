/**
 * Unfinished designs.
 *
 * A customer often chooses a layout at a computer and measures in the
 * bathroom with a phone. A draft is the design as it stands, kept here so it
 * can be opened on the other device from a link.
 *
 * Like the rest of the designer's routes these are public. Making a draft
 * needs a site key, which decides the company. After that the resume token in
 * the link is all that opens it: a long random secret of which only the hash
 * is stored. A draft holds the design and where the customer had got to. It
 * never holds their name, their contact details or their photos.
 */

import { DOCUMENT_FORMAT, DocumentError, upgradeDocument, type DesignDocument } from '@setout/engine';
import { Hono, type Context } from 'hono';
import { companyDb } from '../db/company-db';
import { hashResumeToken, newResumeToken, resolveDesigner, resolveDraft } from '../db/platform';
import { nowIso } from '../lib/ids';

export const drafts = new Hono<{ Bindings: Env }>();

/** A design with no photos in it is a few kilobytes. Anything much bigger is not a draft. */
export const MAX_DRAFT_BYTES = 64 * 1024;
/** How long a draft is kept after it was last saved. */
export const DRAFT_DAYS = 30;
/**
 * The most unfinished designs one company may hold. Nothing stops a script
 * calling a public route, so this stops one filling the database.
 */
export const MAX_DRAFTS_HELD = 5000;

const STEPS = ['shape', 'measure', 'sizes', 'hardware', 'review'] as const;

/** Where the customer had got to. */
export interface DraftProgress {
  stepId: (typeof STEPS)[number];
  measureCard: number;
  templateId: string | null;
}

type Loose = Record<string, unknown>;
const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Progress rebuilt from only what is known, so nothing else a browser sends
 * is kept. Anything unusable falls back to the start: it only decides which
 * screen opens, and the design itself is checked separately.
 */
export function readProgress(raw: unknown): DraftProgress {
  const p = isObject(raw) ? raw : {};
  const stepId = STEPS.find((s) => s === p.stepId) ?? 'shape';
  const card = typeof p.measureCard === 'number' && Number.isInteger(p.measureCard) ? p.measureCard : 0;
  const templateId = typeof p.templateId === 'string' && /^[a-z0-9-]{1,60}$/.test(p.templateId) ? p.templateId : null;
  return { stepId, measureCard: Math.min(Math.max(card, 0), 200), templateId };
}

const expiry = (from: string) => new Date(new Date(from).getTime() + DRAFT_DAYS * 86_400_000).toISOString();
const PRIVATE = { 'Cache-Control': 'no-store' };

type Ctx = Context<{ Bindings: Env }>;

/** The design and progress in a request, or the answer to send back instead. */
async function readBody(c: Ctx): Promise<{ body: Loose; document: DesignDocument; progress: DraftProgress } | Response> {
  if (Number(c.req.header('content-length') ?? 0) > MAX_DRAFT_BYTES) {
    return c.json({ error: 'too_large', message: 'That is too much for a saved design.' }, 413);
  }
  const text = await c.req.text();
  if (text.length > MAX_DRAFT_BYTES) {
    return c.json({ error: 'too_large', message: 'That is too much for a saved design.' }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!isObject(body)) return c.json({ error: 'invalid_request', message: 'A saved design must be sent as an object.' }, 400);
  try {
    return { body, document: upgradeDocument(body.document), progress: readProgress(body.progress) };
  } catch (error) {
    if (error instanceof DocumentError) {
      return c.json({ error: 'invalid_design', message: `We could not read that design: ${error.message}` }, 422);
    }
    throw error;
  }
}

/** Start a draft. Answers with the token that opens it. */
drafts.post('/', async (c) => {
  const read = await readBody(c);
  if (read instanceof Response) return read;

  // The site key decides the company. Nothing else in the request can.
  const found = await resolveDesigner(c.env, read.body.siteKey);
  if (!found) return c.json({ error: 'unknown_designer', message: 'This designer is not set up.' }, 404);
  const db = companyDb(c.env, found.companyId);

  const now = nowIso();
  await db.drafts.clearExpired(now);
  if ((await db.count('drafts')) >= MAX_DRAFTS_HELD) {
    return c.json({ error: 'too_many_drafts', message: 'Designs cannot be saved for another device just now.' }, 429);
  }

  const token = newResumeToken();
  const row = await db.insert('drafts', {
    designer_id: found.designerId,
    resume_token_hash: await hashResumeToken(token),
    document: read.document,
    format_version: DOCUMENT_FORMAT,
    progress: { ...read.progress },
    expires_at: expiry(now),
  });
  return c.json({ token, updatedAt: row.updated_at, expiresAt: row.expires_at }, 201, PRIVATE);
});

/** The draft behind a token, or the answer to send back when there is none to give. */
async function open(c: Ctx) {
  const found = await resolveDraft(c.env, c.req.param('token'));
  if (!found) return c.json({ error: 'unknown_draft', message: 'That saved design could not be found.' }, 404);
  if (found.expiresAt < nowIso()) {
    return c.json({ error: 'draft_expired', message: 'That saved design has run out. Please start again.' }, 410);
  }
  return found;
}

/** Open a draft on another device. */
drafts.get('/:token', async (c) => {
  const found = await open(c);
  if (found instanceof Response) return found;

  // A draft opens only in the designer it was made in.
  const designer = await resolveDesigner(c.env, c.req.query('key'));
  if (!designer || designer.companyId !== found.companyId || designer.designerId !== found.designerId) {
    return c.json({ error: 'unknown_draft', message: 'That saved design could not be found.' }, 404);
  }

  const row = await companyDb(c.env, found.companyId).get('drafts', found.draftId);
  if (!row) return c.json({ error: 'unknown_draft', message: 'That saved design could not be found.' }, 404);
  let document: DesignDocument;
  try {
    // Saved by an older designer, it is brought up to today's format as it is read.
    document = upgradeDocument(row.document);
  } catch (error) {
    if (error instanceof DocumentError) {
      return c.json({ error: 'invalid_design', message: 'That saved design can no longer be read. Please start again.' }, 422);
    }
    throw error;
  }
  return c.json(
    { document, progress: readProgress(row.progress), updatedAt: row.updated_at, expiresAt: row.expires_at },
    200,
    PRIVATE
  );
});

/** Save a draft as it now stands. Each save keeps it for another thirty days. */
drafts.put('/:token', async (c) => {
  const found = await open(c);
  if (found instanceof Response) return found;
  const read = await readBody(c);
  if (read instanceof Response) return read;

  const row = await companyDb(c.env, found.companyId).update('drafts', found.draftId, {
    document: read.document,
    format_version: DOCUMENT_FORMAT,
    progress: { ...read.progress },
    expires_at: expiry(nowIso()),
  });
  if (!row) return c.json({ error: 'unknown_draft', message: 'That saved design could not be found.' }, 404);
  return c.json({ updatedAt: row.updated_at, expiresAt: row.expires_at }, 200, PRIVATE);
});
