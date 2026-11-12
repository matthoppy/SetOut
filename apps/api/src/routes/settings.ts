/**
 * A company's settings, for its staff to see and its owners to change: the
 * company's name, its colours and logo, how a new quote starts, and for each
 * designer the finishes, handles, glass and hinges it offers and who hears
 * about each design.
 *
 * Everything sent is checked before anything is saved, and a request with one
 * thing wrong changes nothing. Each change says which version of a setting it
 * was made from, so one made from an older copy is refused rather than saved
 * over someone else's. Every change goes in the company's audit log, with who
 * made it and what changed.
 *
 * Which websites may show a designer, and the making rules, are not changed
 * here.
 */

import { Hono, type Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Session } from '../db/auth';
import { optionsInUse, readSettings, saveSettings, settingsChanges } from '../db/settings';
import { RequestError } from '../lib/enquiry';
import {
  companyChanges,
  companyVersions,
  companyView,
  designerVersions,
  designerView,
  emailChanges,
  glassChanges,
  hingeChanges,
  LIMITS,
  optionChanges,
  readBranding,
  readCompanyName,
  readFinishes,
  readGlass,
  readHandles,
  readHinges,
  readNotifyEmails,
  readQuoteSettings,
  storedBranding,
  storedConfig,
  storedSettings,
  type CompanyView,
  type DesignerView,
} from '../lib/settings';

type Bindings = { Bindings: Env; Variables: { session: Session } };

export const staffSettings = new Hono<Bindings>();

const PRIVATE = { 'Cache-Control': 'no-store' };
/** Thirty finishes and thirty handles, with room to spare. */
const MAX_BODY_BYTES = 64 * 1024;

const STALE = {
  error: 'stale',
  message: 'Someone else changed this since you opened it. Open the settings again to see their change.',
} as const;
const NO_DESIGNER = { error: 'not_found', message: 'There is no such designer.' } as const;
const HINGE_FIELDS: string[] = ['wallHingesOffered', 'wallHingeStandard', 'inLineHingesOffered', 'inLineHingeStandard'];
const NO_COMPANY = { error: 'not_found', message: 'This company could not be found.' } as const;

/** Only an owner may change the settings. The role is read from the membership on every request. */
const ownersOnly = createMiddleware<Bindings>(async (c, next) => {
  if (c.get('session').role !== 'owner') {
    return c.json({ error: 'owners_only', message: 'Only an owner can change the company’s settings.' }, 403, PRIVATE);
  }
  await next();
});

/** The request's body, if it is a JSON object of a sensible size. */
async function bodyOf(c: Context<Bindings>): Promise<Record<string, unknown>> {
  if (Number(c.req.header('content-length') ?? 0) > MAX_BODY_BYTES) {
    throw new RequestError(413, 'too_large', 'That is too much to save at once.');
  }
  const body: unknown = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError(400, 'invalid_request', 'The request must be a JSON object.');
  }
  return body as Record<string, unknown>;
}

const basedOnOf = (body: Record<string, unknown>) =>
  body.basedOn && typeof body.basedOn === 'object' && !Array.isArray(body.basedOn) ? (body.basedOn as Record<string, unknown>) : {};

/** A designer as the settings page shows it, with how many showers use each option. */
async function presentDesigner(env: Env, companyId: string, designer: DesignerView, first: boolean) {
  const [inUse, versions] = await Promise.all([optionsInUse(env, companyId, designer.id, first), designerVersions(designer)]);
  return { ...designer, inUse, versions };
}

const presentCompany = async (company: CompanyView) => ({ ...company, versions: await companyVersions(company) });

/** The settings as they stand. Everyone on the team may see them; owners also see the latest changes. */
staffSettings.get('/settings', async (c) => {
  const session = c.get('session');
  const stored = await readSettings(c.env, session.companyId);
  if (!stored) return c.json(NO_COMPANY, 404, PRIVATE);
  const owner = session.role === 'owner';
  const [company, designers, changes] = await Promise.all([
    presentCompany(companyView(stored.company)),
    Promise.all(stored.designers.map((d, i) => presentDesigner(c.env, session.companyId, designerView(d), i === 0))),
    owner ? settingsChanges(c.env, session.companyId) : null,
  ]);
  return c.json({ canChange: owner, company, designers, limits: LIMITS, ...(changes ? { changes } : {}) }, 200, PRIVATE);
});

/**
 * Another part saved at the same moment is no reason to refuse this one. A
 * save that loses that race reads the settings again and is tried once more,
 * and is refused only if its own part has changed.
 */
async function withRetry(attempt: () => Promise<Response | null>): Promise<Response | null> {
  return (await attempt()) ?? (await attempt());
}

/**
 * Change the company's name, its colours and logo, or how a new quote starts.
 * Anything left out stays as it is.
 */
staffSettings.patch('/settings/company', ownersOnly, async (c) => {
  const session = c.get('session');
  try {
    const body = await bodyOf(c);
    const sent = (['name', 'branding', 'quotes'] as const).filter((part) => body[part] !== undefined);
    if (sent.length === 0) {
      return c.json({ error: 'invalid_request', message: 'Send the name, the colours and logo, or how quotes start.' }, 400, PRIVATE);
    }
    const basedOn = basedOnOf(body);
    const answer = await withRetry(async () => {
      const stored = await readSettings(c.env, session.companyId);
      if (!stored) return c.json(NO_COMPANY, 404, PRIVATE);
      const before = companyView(stored.company);
      const versions = await companyVersions(before);
      if (sent.some((part) => basedOn[part] !== versions[part])) return c.json(STALE, 409, PRIVATE);

      const after: CompanyView = {
        name: body.name === undefined ? before.name : readCompanyName(body.name),
        branding: body.branding === undefined ? before.branding : readBranding(body.branding, before.branding),
        quotes: body.quotes === undefined ? before.quotes : readQuoteSettings(body.quotes, before.quotes),
      };
      const changes = companyChanges(before, after);
      if (changes.length === 0) return c.json({ ok: true, changed: false, company: await presentCompany(before) }, 200, PRIVATE);

      const { company } = stored;
      const columns = {
        ...(after.name !== before.name ? { name: { was: company.name, now: after.name } } : {}),
        ...(changes.some((ch) => ch.field === 'primary' || ch.field === 'primaryForeground' || ch.field === 'logoUrl')
          ? { branding: { was: company.branding, now: storedBranding(company.branding, before.branding, after.branding) } }
          : {}),
        ...(changes.some((ch) => ch.field === 'vatRateBp' || ch.field === 'quoteValidDays')
          ? { settings: { was: company.settings, now: storedSettings(company.settings, before.quotes, after.quotes) } }
          : {}),
      };
      const saved = await saveSettings(c.env, session.companyId, session.userId, { table: 'companies', columns }, { changes });
      return saved ? c.json({ ok: true, changed: true, company: await presentCompany(after) }, 200, PRIVATE) : null;
    });
    return answer ?? c.json(STALE, 409, PRIVATE);
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status, PRIVATE);
    throw error;
  }
});

/**
 * Change the finishes, handles, glass and hinges a designer offers, or who
 * it emails when a design arrives. A list is sent whole, in the order the
 * designer shows it. Anything left out stays as it is.
 */
staffSettings.patch('/settings/designers/:id', ownersOnly, async (c) => {
  const session = c.get('session');
  try {
    const body = await bodyOf(c);
    const sent = (['finishes', 'handles', 'glass', 'hinges', 'notifyEmails'] as const).filter((part) => body[part] !== undefined);
    const basedOn = basedOnOf(body);
    const answer = await withRetry(async () => {
      const stored = await readSettings(c.env, session.companyId);
      const index = stored?.designers.findIndex((d) => d.id === c.req.param('id')) ?? -1;
      if (!stored || index < 0) return c.json(NO_DESIGNER, 404, PRIVATE);
      if (sent.length === 0) {
        return c.json({ error: 'invalid_request', message: 'Send the finishes, the handles, the glass, the hinges or the addresses to email.' }, 400, PRIVATE);
      }
      const row = stored.designers[index];
      const first = index === 0;
      const before = designerView(row);
      const versions = await designerVersions(before);
      if (sent.some((part) => basedOn[part] !== versions[part])) return c.json(STALE, 409, PRIVATE);

      const after: DesignerView = {
        ...before,
        finishes: body.finishes === undefined ? before.finishes : readFinishes(body.finishes, before.finishes),
        handles: body.handles === undefined ? before.handles : readHandles(body.handles, before.handles),
        glass: body.glass === undefined ? before.glass : readGlass(body.glass),
        hinges: body.hinges === undefined ? before.hinges : readHinges(body.hinges),
        notifyEmails: body.notifyEmails === undefined ? before.notifyEmails : readNotifyEmails(body.notifyEmails),
      };
      const changes = [
        ...optionChanges('finish', before.finishes, after.finishes),
        ...optionChanges('handle', before.handles, after.handles),
        ...glassChanges(before.glass, after.glass),
        ...hingeChanges(before.hinges, after.hinges),
        ...emailChanges(before.notifyEmails, after.notifyEmails),
      ];
      if (changes.length === 0) {
        return c.json({ ok: true, changed: false, designer: await presentDesigner(c.env, session.companyId, before, first) }, 200, PRIVATE);
      }

      const options = {
        ...(changes.some((ch) => ch.field === 'finish') ? { finishes: after.finishes } : {}),
        ...(changes.some((ch) => ch.field === 'handle') ? { handles: after.handles } : {}),
        ...(changes.some((ch) => ch.field === 'glassOffered' || ch.field === 'glassStandard') ? { glass: after.glass } : {}),
        ...(changes.some((ch) => HINGE_FIELDS.includes(ch.field)) ? { hinges: after.hinges } : {}),
      };
      const columns = {
        ...(options.finishes || options.handles || options.glass || options.hinges
          ? { config: { was: row.config, now: storedConfig(row.config, options) } }
          : {}),
        ...(changes.some((ch) => ch.field === 'notifyEmails')
          ? { notify_emails: { was: row.notify_emails, now: JSON.stringify(after.notifyEmails) } }
          : {}),
      };
      const saved = await saveSettings(
        c.env,
        session.companyId,
        session.userId,
        { table: 'designers', id: row.id, columns },
        { designer: { id: row.id, name: row.name }, changes }
      );
      return saved
        ? c.json({ ok: true, changed: true, designer: await presentDesigner(c.env, session.companyId, after, first) }, 200, PRIVATE)
        : null;
    });
    return answer ?? c.json(STALE, 409, PRIVATE);
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status, PRIVATE);
    throw error;
  }
});
