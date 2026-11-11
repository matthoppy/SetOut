/**
 * Unfinished designs: started on one device, opened on another from a link.
 */
import { createDocument, designFromTemplate, DOCUMENT_FORMAT, type DesignDocument } from '@setout/engine';
import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { companyDb, type CompanyDb } from '../src/db/company-db';
import { createCompany, hashResumeToken, newResumeToken, newSiteKey, resolveDraft } from '../src/db/platform';
import { DRAFT_DAYS, MAX_DRAFT_BYTES, MAX_DRAFTS_HELD, readProgress } from '../src/routes/drafts';

const ORIGIN = 'https://setout.test';
const URL_ = `${ORIGIN}/api/designer/drafts`;

interface Company {
  id: string;
  db: CompanyDb;
  siteKey: string;
  designerId: string;
}

async function company(name: string, prefix: string): Promise<Company> {
  const record = await createCompany(env, { name, referencePrefix: prefix });
  const db = companyDb(env, record.id);
  const siteKey = newSiteKey('test');
  const designer = await db.insert('designers', { name: `${name} website`, site_key: siteKey, allowed_origins: [] });
  return { id: record.id, db, siteKey, designerId: designer.id };
}

const design = (template = 'corner-door-return'): DesignDocument => createDocument(designFromTemplate(template));
const progress = { stepId: 'measure', measureCard: 4, templateId: 'corner-door-return' };

const json = (method: string, url: string, body: unknown) =>
  exports.default.fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const start = (body: unknown) => json('POST', URL_, body);
const save = (token: string, body: unknown) => json('PUT', `${URL_}/${token}`, body);
const open = (token: string, key: string) => exports.default.fetch(`${URL_}/${token}?key=${encodeURIComponent(key)}`);

interface Started {
  token: string;
  updatedAt: string;
  expiresAt: string;
}
interface Opened {
  document: DesignDocument;
  progress: typeof progress;
  updatedAt: string;
  expiresAt: string;
}

async function started(c: Company, document = design()): Promise<Started> {
  const response = await start({ siteKey: c.siteKey, document, progress });
  expect(response.status).toBe(201);
  return response.json<Started>();
}

let ours: Company;
let theirs: Company;

beforeAll(async () => {
  ours = await company('Custom Showers', 'CS');
  theirs = await company('Brennan Glass', 'BG');
});

describe('starting a draft', () => {
  test('answers with a token that opens it, and keeps it for thirty days', async () => {
    const before = Date.now();
    const draft = await started(ours);
    expect(draft.token).toMatch(/^rt_[a-z0-9]{32}$/);
    const days = (new Date(draft.expiresAt).getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(DRAFT_DAYS - 0.01);
    expect(days).toBeLessThan(DRAFT_DAYS + 0.01);
  });

  test('the token is never stored, only its hash', async () => {
    const draft = await started(ours);
    const rows = await ours.db.find('drafts');
    expect(rows.some((r) => JSON.stringify(r).includes(draft.token))).toBe(false);
    expect(rows.map((r) => r.resume_token_hash)).toContain(await hashResumeToken(draft.token));
  });

  test('it lands in the company the site key belongs to, and in no other', async () => {
    const [mine, others] = [await ours.db.count('drafts'), await theirs.db.count('drafts')];
    const draft = await started(ours);
    expect(await ours.db.count('drafts')).toBe(mine + 1);
    expect(await theirs.db.count('drafts')).toBe(others);
    expect((await resolveDraft(env, draft.token))?.companyId).toBe(ours.id);
  });

  test('nothing but the design and where they had got to is kept', async () => {
    const response = await start({
      siteKey: ours.siteKey,
      document: { ...design(), customer: { name: 'Asha Patel', email: 'asha@example.test' } },
      progress: { ...progress, email: 'asha@example.test' },
      customer: { name: 'Asha Patel', email: 'asha@example.test', phone: '020 7946 0000' },
      attachments: [{ filename: 'wall.jpg', content: 'AAAA' }],
    });
    const { token } = await response.json<Started>();
    const found = await resolveDraft(env, token);
    const row = await ours.db.get('drafts', found!.draftId);
    expect(JSON.stringify(row)).not.toMatch(/Asha|asha@|7946|wall\.jpg/);
    expect(Object.keys(row!.document as object).sort()).toEqual(['design', 'format']);
    expect(row!.progress).toEqual(progress);
    expect(row!.format_version).toBe(DOCUMENT_FORMAT);
  });

  test.each([
    ['an unknown site key', () => ({ siteKey: newSiteKey('test'), document: design(), progress }), 404, 'unknown_designer'],
    ['no site key', () => ({ document: design(), progress }), 404, 'unknown_designer'],
    ['a design that cannot be read', () => ({ siteKey: ours.siteKey, document: { format: 1, design: { panels: [] } }, progress }), 422, 'invalid_design'],
    ['a design from a newer engine', () => ({ siteKey: ours.siteKey, document: { ...design(), format: 99 }, progress }), 422, 'invalid_design'],
    ['no design', () => ({ siteKey: ours.siteKey, progress }), 422, 'invalid_design'],
    ['something that is not an object', () => '[1, 2, 3]', 400, 'invalid_request'],
    ['something that is not JSON', () => 'siteKey=abc', 400, 'invalid_request'],
  ])('%s is refused and nothing is kept', async (_, body, status, code) => {
    const before = await ours.db.count('drafts');
    const response = await start(body());
    expect(response.status).toBe(status);
    expect((await response.json<{ error: string }>()).error).toBe(code);
    expect(await ours.db.count('drafts')).toBe(before);
  });

  test('more than a design could ever be is refused', async () => {
    const before = await ours.db.count('drafts');
    const response = await start({ siteKey: ours.siteKey, document: design(), progress, padding: 'x'.repeat(MAX_DRAFT_BYTES) });
    expect(response.status).toBe(413);
    expect(await ours.db.count('drafts')).toBe(before);
  });
});

describe('opening a draft on another device', () => {
  test('gives back the design and where they had got to', async () => {
    const document = design('three-sided');
    const draft = await started(ours, document);
    const response = await open(draft.token, ours.siteKey);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const opened = await response.json<Opened>();
    expect(opened.document).toEqual(document);
    expect(opened.progress).toEqual(progress);
    expect(opened.updatedAt).toBe(draft.updatedAt);
  });

  test.each([
    ['a token nobody was given', () => newResumeToken()],
    ['something that is not a token', () => 'rt_short'],
    ['a site key in place of a token', () => ours.siteKey],
  ])('%s opens nothing', async (_, token) => {
    const response = await open(token(), ours.siteKey);
    expect(response.status).toBe(404);
    expect((await response.json<{ error: string }>()).error).toBe('unknown_draft');
  });

  test('a draft opens only in the designer it was made in', async () => {
    const draft = await started(ours);
    for (const key of [theirs.siteKey, newSiteKey('test'), '']) {
      const response = await open(draft.token, key);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('panels');
    }
  });

  test('a draft whose time has run out is said to have, and is not given', async () => {
    const draft = await started(ours);
    const found = await resolveDraft(env, draft.token);
    await ours.db.update('drafts', found!.draftId, { expires_at: '2020-01-01T00:00:00.000Z' });
    const response = await open(draft.token, ours.siteKey);
    expect(response.status).toBe(410);
    expect((await response.json<{ error: string }>()).error).toBe('draft_expired');
    expect((await save(draft.token, { document: design(), progress })).status).toBe(410);
  });

  test('a draft of a designer that has been switched off opens nothing', async () => {
    const closed = await company('Closed Glass', 'CG');
    const draft = await started(closed);
    await closed.db.update('designers', closed.designerId, { status: 'disabled' });
    expect(await resolveDraft(env, draft.token)).toBeNull();
    expect((await open(draft.token, closed.siteKey)).status).toBe(404);
  });
});

describe('saving a draft as it changes', () => {
  test('the next device to open it gets the latest design and place', async () => {
    const draft = await started(ours, design('walk-in'));
    const later = design('walk-in');
    later.design.heightMm = 1950;
    later.design.opening.runs[0].widthAtFloorMm = 912;
    const response = await save(draft.token, { document: later, progress: { ...progress, stepId: 'sizes', measureCard: 9 } });
    expect(response.status).toBe(200);
    const saved = await response.json<{ updatedAt: string; expiresAt: string }>();
    expect(saved.updatedAt >= draft.updatedAt).toBe(true);
    expect(saved.expiresAt >= draft.expiresAt).toBe(true);

    const opened = await (await open(draft.token, ours.siteKey)).json<Opened>();
    expect(opened.document.design.heightMm).toBe(1950);
    expect(opened.document.design.opening.runs[0].widthAtFloorMm).toBe(912);
    expect(opened.progress).toMatchObject({ stepId: 'sizes', measureCard: 9 });
    expect(opened.updatedAt).toBe(saved.updatedAt);
  });

  test('saving never makes another draft', async () => {
    const draft = await started(ours);
    const before = await ours.db.count('drafts');
    await save(draft.token, { document: design(), progress });
    await save(draft.token, { document: design(), progress });
    expect(await ours.db.count('drafts')).toBe(before);
  });

  test('a design that cannot be read is refused and the draft is left as it was', async () => {
    const draft = await started(ours);
    const response = await save(draft.token, { document: { format: 1, design: { panels: 'none' } }, progress });
    expect(response.status).toBe(422);
    const opened = await (await open(draft.token, ours.siteKey)).json<Opened>();
    expect(opened.document).toEqual(design());
    expect(opened.updatedAt).toBe(draft.updatedAt);
  });

  test('a token nobody was given saves nothing', async () => {
    const before = await ours.db.count('drafts');
    expect((await save(newResumeToken(), { document: design(), progress })).status).toBe(404);
    expect(await ours.db.count('drafts')).toBe(before);
  });
});

describe('where they had got to', () => {
  test('is rebuilt from only what is known', () => {
    expect(readProgress({ stepId: 'hardware', measureCard: 3, templateId: 'walk-in', extra: 'x' })).toEqual({
      stepId: 'hardware',
      measureCard: 3,
      templateId: 'walk-in',
    });
  });

  test.each([
    [undefined],
    [null],
    ['measure'],
    [{ stepId: 'admin', measureCard: -4, templateId: '<script>' }],
    [{ stepId: 7, measureCard: 2.5, templateId: 42 }],
  ])('%j falls back to the start', (raw) => {
    expect(readProgress(raw)).toEqual({ stepId: 'shape', measureCard: 0, templateId: null });
  });

  test('a card number is kept within reason', () => {
    expect(readProgress({ stepId: 'measure', measureCard: 1_000_000 }).measureCard).toBe(200);
  });
});

describe('keeping the number of drafts in hand', () => {
  test('drafts whose time has run out are cleared when the next one is started', async () => {
    const tidy = await company('Tidy Glass', 'TG');
    const old = await started(tidy);
    const kept = await started(tidy);
    const found = await resolveDraft(env, old.token);
    await tidy.db.update('drafts', found!.draftId, { expires_at: '2020-01-01T00:00:00.000Z' });
    expect(await tidy.db.count('drafts')).toBe(2);

    await started(tidy);
    expect(await tidy.db.count('drafts')).toBe(2);
    expect(await resolveDraft(env, old.token)).toBeNull();
    expect(await resolveDraft(env, kept.token)).not.toBeNull();
  });

  test('one company clearing its drafts leaves another company\'s alone', async () => {
    const draft = await started(theirs);
    const found = await resolveDraft(env, draft.token);
    await theirs.db.update('drafts', found!.draftId, { expires_at: '2020-01-01T00:00:00.000Z' });
    expect(await ours.db.drafts.clearExpired()).toBeGreaterThanOrEqual(0);
    expect(await theirs.db.get('drafts', found!.draftId)).not.toBeNull();
  });

  test('a company already holding as many as it may is refused another', async () => {
    const full = await company('Full Glass', 'FG');
    const document = JSON.stringify(design());
    await env.DB.prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO drafts (company_id, id, designer_id, resume_token_hash, document, format_version, expires_at, created_at, updated_at)
       SELECT ?, 'drf_filler_' || i, ?, 'filler-' || ? || '-' || i, ?, 1, '2099-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z' FROM n`
    )
      .bind(MAX_DRAFTS_HELD, full.id, full.designerId, full.id, document)
      .run();
    expect(await full.db.count('drafts')).toBe(MAX_DRAFTS_HELD);

    const response = await start({ siteKey: full.siteKey, document: design(), progress });
    expect(response.status).toBe(429);
    expect(await full.db.count('drafts')).toBe(MAX_DRAFTS_HELD);
    // It is their own limit. Another company can still save.
    await started(ours);
  });
});

describe('which address drafts answer on', () => {
  test('the designer\'s address, and never the workspace\'s', async () => {
    const body = JSON.stringify({ siteKey: ours.siteKey, document: design(), progress });
    const at = (host: string) =>
      exports.default.fetch(`https://${host}/api/designer/drafts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    expect((await at('designer.test')).status).toBe(201);
    expect((await at('app.test')).status).toBe(404);
  });
});
