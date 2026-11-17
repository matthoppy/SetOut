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
 * The company's measurements, what comes off each pane and its other making
 * rules, are kept as versions of its ruleset: each change is a new version,
 * and a design keeps the version it was made with. The price book holds what
 * each new quote starts from. Setting up, at the foot, is where an owner's
 * place in the set-up wizard is kept.
 */

import { Hono, type Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Session } from '../db/auth';
import { companyDb } from '../db/company-db';
import { saveSetUp, setUpOf } from '../db/onboarding';
import {
  addSupplier,
  importSupplierPrices,
  optionsInUse,
  readRules,
  readSettings,
  readSuppliers,
  removeSupplier,
  renameSupplier,
  savePrices,
  savePricing,
  saveRules,
  saveSettings,
  saveSupplierPrices,
  settingsChanges,
  updateSupplier,
} from '../db/settings';
import { RequestError } from '../lib/enquiry';
import { MAX_SUPPLIERS, priceBook, readPriceChanges, readSupplierName, supplierBook, type PriceBook } from '../lib/price-book';
import { isSupplierKind, pricingSettingsOf, readPricingSettings, storedPricing } from '../lib/pricing';
import { parseSupplierCsv } from '../lib/supplier-csv';
import {
  companyChanges,
  companyVersions,
  companyView,
  designerVersions,
  designerView,
  choiceChanges,
  emailChanges,
  glassChanges,
  hingeChanges,
  slidingChanges,
  LIMITS,
  optionChanges,
  readBranding,
  readCoatings,
  readCompanyName,
  readFinishes,
  readFixing,
  readGlassTypes,
  readGlass,
  readHandles,
  readHinges,
  readSliding,
  readNotifyEmails,
  readQuoteSettings,
  readRuleOverrides,
  readWebsites,
  ruleChanges,
  storedBranding,
  storedConfig,
  storedSettings,
  websiteChanges,
  type CompanyView,
  type DesignerView,
} from '../lib/settings';

type Bindings = { Bindings: Env; Variables: { session: Session } };

export const staffSettings = new Hono<Bindings>();

const PRIVATE = { 'Cache-Control': 'no-store' };
/** Thirty finishes and thirty handles, with room to spare. */
const MAX_BODY_BYTES = 64 * 1024;
/** Every price in the largest price book, with room to spare. */
const MAX_PRICES_BYTES = 256 * 1024;

const STALE = {
  error: 'stale',
  message: 'Someone else changed this since you opened it. Open the settings again to see their change.',
} as const;
const NO_DESIGNER = { error: 'not_found', message: 'There is no such designer.' } as const;
const HINGE_FIELDS: string[] = ['wallHingesOffered', 'wallHingeStandard', 'inLineHingesOffered', 'inLineHingeStandard', 'viennaCutout', 'bellagioFit'];
const NO_COMPANY = { error: 'not_found', message: 'This company could not be found.' } as const;
const NO_SUPPLIER = { error: 'not_found', message: 'There is no such supplier.' } as const;

/** Only an owner may change the settings. The role is read from the membership on every request. */
const ownersOnly = createMiddleware<Bindings>(async (c, next) => {
  if (c.get('session').role !== 'owner') {
    return c.json({ error: 'owners_only', message: 'Only an owner can change the company’s settings.' }, 403, PRIVATE);
  }
  await next();
});

/** The request's body, if it is a JSON object of a sensible size. */
async function bodyOf(c: Context<Bindings>, limit = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  if (Number(c.req.header('content-length') ?? 0) > limit) {
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

/**
 * Where the embed script is served from. On the designer's own address where
 * there is one; where one address serves both apps, under /designer/.
 */
function embedScriptFor(c: Context<Bindings>): string {
  return c.env.DESIGNER_HOST ? `https://${c.env.DESIGNER_HOST}/embed.js` : `${new URL(c.req.url).origin}/designer/embed.js`;
}

const presentCompany = async (company: CompanyView) => ({ ...company, versions: await companyVersions(company) });

/**
 * The price book as the company's settings show it. Owners also get its
 * suppliers and what each charges; the rest of the team never sees what the
 * company pays.
 */
async function priceBookFor(env: Env, companyId: string, designers: readonly DesignerView[], owner: boolean): Promise<PriceBook> {
  const [stored, suppliers] = await Promise.all([companyDb(env, companyId).prices.list(), owner ? readSuppliers(env, companyId) : Promise.resolve([])]);
  const book = priceBook(designers, stored, suppliers);
  return owner ? book : { groups: book.groups, prices: book.prices };
}

/** The settings as they stand. Everyone on the team may see them; owners also see the latest changes. */
staffSettings.get('/settings', async (c) => {
  const session = c.get('session');
  const stored = await readSettings(c.env, session.companyId);
  if (!stored) return c.json(NO_COMPANY, 404, PRIVATE);
  const owner = session.role === 'owner';
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(stored.company.settings) as Record<string, unknown>;
  } catch {
    // Unreadable settings are treated as none.
  }
  const [company, designers, rules, prices, changes] = await Promise.all([
    presentCompany(companyView(stored.company)),
    Promise.all(stored.designers.map((d, i) => presentDesigner(c.env, session.companyId, designerView(d), i === 0))),
    readRules(c.env, session.companyId),
    priceBookFor(c.env, session.companyId, stored.designers.map(designerView), owner),
    owner ? settingsChanges(c.env, session.companyId) : null,
  ]);
  return c.json(
    {
      canChange: owner,
      company,
      designers,
      rules,
      prices,
      limits: LIMITS,
      embedScript: embedScriptFor(c),
      ...(owner ? { pricing: pricingSettingsOf(settings) } : {}),
      ...(changes ? { changes } : {}),
    },
    200,
    PRIVATE
  );
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
 * Change the finishes, handles, glass, hinges, fixing methods, glass types and
 * coatings a designer offers, who it emails when a design arrives, or the
 * websites that may show it. A list is sent whole, in the order the
 * designer shows it. Anything left out stays as it is.
 */
staffSettings.patch('/settings/designers/:id', ownersOnly, async (c) => {
  const session = c.get('session');
  try {
    const body = await bodyOf(c);
    const sent = (['finishes', 'handles', 'glass', 'hinges', 'fixing', 'glassTypes', 'coatings', 'sliding', 'notifyEmails', 'websites'] as const).filter(
      (part) => body[part] !== undefined
    );
    const basedOn = basedOnOf(body);
    const answer = await withRetry(async () => {
      const stored = await readSettings(c.env, session.companyId);
      const index = stored?.designers.findIndex((d) => d.id === c.req.param('id')) ?? -1;
      if (!stored || index < 0) return c.json(NO_DESIGNER, 404, PRIVATE);
      if (sent.length === 0) {
        return c.json(
          {
            error: 'invalid_request',
            message:
              'Send the finishes, the handles, the glass, the hinges, the fixing methods, the glass types, the coatings, sliding doors on or off, the addresses to email or the websites.',
          },
          400,
          PRIVATE
        );
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
        hinges: body.hinges === undefined ? before.hinges : readHinges(body.hinges, before.hinges),
        fixing: body.fixing === undefined ? before.fixing : readFixing(body.fixing),
        glassTypes: body.glassTypes === undefined ? before.glassTypes : readGlassTypes(body.glassTypes),
        coatings: body.coatings === undefined ? before.coatings : readCoatings(body.coatings),
        sliding: body.sliding === undefined ? before.sliding : readSliding(body.sliding),
        notifyEmails: body.notifyEmails === undefined ? before.notifyEmails : readNotifyEmails(body.notifyEmails),
        websites: body.websites === undefined ? before.websites : readWebsites(body.websites),
      };
      const changes = [
        ...optionChanges('finish', before.finishes, after.finishes),
        ...optionChanges('handle', before.handles, after.handles),
        ...glassChanges(before.glass, after.glass),
        ...hingeChanges(before.hinges, after.hinges),
        ...choiceChanges('fixing', before.fixing, after.fixing),
        ...choiceChanges('glassTypes', before.glassTypes, after.glassTypes),
        ...choiceChanges('coatings', before.coatings, after.coatings),
        ...slidingChanges(before.sliding, after.sliding),
        ...emailChanges(before.notifyEmails, after.notifyEmails),
        ...websiteChanges(before.websites, after.websites),
      ];
      if (changes.length === 0) {
        return c.json({ ok: true, changed: false, designer: await presentDesigner(c.env, session.companyId, before, first) }, 200, PRIVATE);
      }

      const options = {
        ...(changes.some((ch) => ch.field === 'finish') ? { finishes: after.finishes } : {}),
        ...(changes.some((ch) => ch.field === 'handle') ? { handles: after.handles } : {}),
        ...(changes.some((ch) => ch.field === 'glassOffered' || ch.field === 'glassStandard') ? { glass: after.glass } : {}),
        ...(changes.some((ch) => HINGE_FIELDS.includes(ch.field)) ? { hinges: after.hinges } : {}),
        ...(changes.some((ch) => ch.field === 'fixingOffered' || ch.field === 'fixingStandard') ? { fixing: after.fixing } : {}),
        ...(changes.some((ch) => ch.field === 'glassTypesOffered' || ch.field === 'glassTypeStandard') ? { glassTypes: after.glassTypes } : {}),
        ...(changes.some((ch) => ch.field === 'coatingsOffered' || ch.field === 'coatingStandard') ? { coatings: after.coatings } : {}),
        ...(changes.some((ch) => ch.field === 'slidingDoors') ? { sliding: after.sliding } : {}),
      };
      const columns = {
        ...(options.finishes || options.handles || options.glass || options.hinges || options.fixing || options.glassTypes || options.coatings || options.sliding !== undefined
          ? { config: { was: row.config, now: storedConfig(row.config, options) } }
          : {}),
        ...(changes.some((ch) => ch.field === 'notifyEmails')
          ? { notify_emails: { was: row.notify_emails, now: JSON.stringify(after.notifyEmails) } }
          : {}),
        ...(changes.some((ch) => ch.field === 'websites')
          ? { allowed_origins: { was: row.allowed_origins, now: JSON.stringify(after.websites) } }
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

/**
 * Change the company's measurements: what comes off each pane, a door's
 * gaps, the channel's depth, and its own limits. Sent whole, as every rule
 * that differs from SetOut's standard, from the version read. Saved as the
 * next version of the company's rules: new designs and changes from then on
 * are made to it, and designs already sent keep the sizes they were made to.
 */
staffSettings.patch('/settings/rules', ownersOnly, async (c) => {
  const session = c.get('session');
  try {
    const body = await bodyOf(c);
    if (body.overrides === undefined) {
      return c.json({ error: 'invalid_request', message: 'Send the measurements.' }, 400, PRIVATE);
    }
    const overrides = readRuleOverrides(body.overrides);
    const before = await readRules(c.env, session.companyId);
    if (basedOnOf(body).rules !== before.version) return c.json(STALE, 409, PRIVATE);
    const changes = ruleChanges(before.overrides, overrides);
    if (changes.length === 0) return c.json({ ok: true, changed: false, rules: before }, 200, PRIVATE);
    const saved = await saveRules(c.env, session.companyId, session.userId, before.version, overrides, { changes });
    if (!saved) return c.json(STALE, 409, PRIVATE);
    return c.json({ ok: true, changed: true, rules: { version: before.version + 1, overrides } }, 200, PRIVATE);
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status, PRIVATE);
    throw error;
  }
});

/**
 * Change prices in the price book. Each is sent with the price the owner saw
 * and the one they chose, or null to take a price away, and only prices the
 * book lists are taken. Nothing is saved if any of them has moved meanwhile,
 * by another owner or by a quote sent with it on.
 */
staffSettings.patch('/settings/prices', ownersOnly, async (c) => {
  const session = c.get('session');
  try {
    const body = await bodyOf(c, MAX_PRICES_BYTES);
    const stored = await readSettings(c.env, session.companyId);
    if (!stored) return c.json(NO_COMPANY, 404, PRIVATE);
    const db = companyDb(c.env, session.companyId);
    const designers = stored.designers.map(designerView);
    const book = priceBook(designers, await db.prices.list());
    const changes = readPriceChanges(body.changes, book);
    if (changes.length === 0) return c.json({ ok: true, changed: false, prices: book }, 200, PRIVATE);
    const saved = await savePrices(c.env, session.companyId, session.userId, changes, { changes: changes.map((ch) => ({ field: 'price', ...ch })) });
    if (!saved) return c.json(STALE, 409, PRIVATE);
    return c.json({ ok: true, changed: true, prices: priceBook(designers, await db.prices.list()) }, 200, PRIVATE);
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status, PRIVATE);
    throw error;
  }
});

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

/** Add a supplier the company buys from, by name. */
staffSettings.post('/settings/suppliers', ownersOnly, async (c) => {
  const session = c.get('session');
  try {
    const body = await bodyOf(c);
    const name = readSupplierName(body.name);
    const kind = body.kind === undefined ? 'other' : body.kind;
    if (!isSupplierKind(kind)) {
      throw new RequestError(400, 'invalid_supplier', 'A supplier is for glass, hardware, or something else.');
    }
    const preferDefault = body.isDefault === true;
    const stored = await readSettings(c.env, session.companyId);
    if (!stored) return c.json(NO_COMPANY, 404, PRIVATE);
    const suppliers = await readSuppliers(c.env, session.companyId);
    if (suppliers.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      return c.json({ error: 'name_taken', message: `You already have a supplier called ${name}.` }, 409, PRIVATE);
    }
    if (suppliers.length >= MAX_SUPPLIERS) {
      return c.json({ error: 'too_many', message: `A company can have up to ${MAX_SUPPLIERS} suppliers.` }, 409, PRIVATE);
    }
    const id = await addSupplier(c.env, session.companyId, session.userId, name, kind, MAX_SUPPLIERS, preferDefault);
    if (!id) return c.json(STALE, 409, PRIVATE);
    return c.json({ ok: true, id, prices: await priceBookFor(c.env, session.companyId, stored.designers.map(designerView), true) }, 201, PRIVATE);
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status, PRIVATE);
    throw error;
  }
});

/** Rename a supplier, or change its kind and whether it is the default of that kind, from what the owner saw. */
staffSettings.patch('/settings/suppliers/:id', ownersOnly, async (c) => {
  const session = c.get('session');
  try {
    const body = await bodyOf(c);
    const suppliers = await readSuppliers(c.env, session.companyId);
    const supplier = suppliers.find((s) => s.id === c.req.param('id'));
    if (!supplier) return c.json(NO_SUPPLIER, 404, PRIVATE);
    const meta = body.kind !== undefined || body.isDefault !== undefined;
    if (!meta) {
      const name = readSupplierName(body.name);
      if (supplier.name === name) return c.json({ ok: true, changed: false }, 200, PRIVATE);
      if (basedOnOf(body).name !== supplier.name) return c.json(STALE, 409, PRIVATE);
      if (suppliers.some((s) => s.id !== supplier.id && s.name.toLowerCase() === name.toLowerCase())) {
        return c.json({ error: 'name_taken', message: `You already have a supplier called ${name}.` }, 409, PRIVATE);
      }
      const renamed = await renameSupplier(c.env, session.companyId, session.userId, supplier.id, supplier.name, name);
      return renamed ? c.json({ ok: true, changed: true }, 200, PRIVATE) : c.json(STALE, 409, PRIVATE);
    }
    const name = body.name === undefined ? supplier.name : readSupplierName(body.name);
    const kind = body.kind === undefined ? supplier.kind : body.kind;
    if (!isSupplierKind(kind)) throw new RequestError(400, 'invalid_supplier', 'A supplier is for glass, hardware, or something else.');
    const isDefault = body.isDefault === undefined ? supplier.isDefault : body.isDefault === true;
    const seen = basedOnOf(body);
    if (seen.name !== undefined && seen.name !== supplier.name) return c.json(STALE, 409, PRIVATE);
    if (seen.kind !== undefined && seen.kind !== supplier.kind) return c.json(STALE, 409, PRIVATE);
    if (supplier.name === name && supplier.kind === kind && supplier.isDefault === isDefault) {
      return c.json({ ok: true, changed: false }, 200, PRIVATE);
    }
    if (suppliers.some((s) => s.id !== supplier.id && s.name.toLowerCase() === name.toLowerCase())) {
      return c.json({ error: 'name_taken', message: `You already have a supplier called ${name}.` }, 409, PRIVATE);
    }
    const saved = await updateSupplier(
      c.env,
      session.companyId,
      session.userId,
      supplier.id,
      { name: supplier.name, kind: supplier.kind, isDefault: supplier.isDefault },
      { name, kind, isDefault }
    );
    if (!saved) return c.json(STALE, 409, PRIVATE);
    const stored = await readSettings(c.env, session.companyId);
    if (!stored) return c.json(NO_COMPANY, 404, PRIVATE);
    return c.json({ ok: true, changed: true, prices: await priceBookFor(c.env, session.companyId, stored.designers.map(designerView), true) }, 200, PRIVATE);
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status, PRIVATE);
    throw error;
  }
});

/** Remove a supplier, and every price it has. The price book's own prices stay as they are. */
staffSettings.delete('/settings/suppliers/:id', ownersOnly, async (c) => {
  const session = c.get('session');
  const supplier = (await readSuppliers(c.env, session.companyId)).find((s) => s.id === c.req.param('id'));
  if (!supplier) return c.json(NO_SUPPLIER, 404, PRIVATE);
  const removed = await removeSupplier(c.env, session.companyId, session.userId, supplier.id, supplier.name);
  return removed ? c.json({ ok: true }, 200, PRIVATE) : c.json(NO_SUPPLIER, 404, PRIVATE);
});

/**
 * Change what a supplier charges, as the price book's prices are changed:
 * each from the price the owner saw, or null to take it away, only for what
 * a supplier sells, and all or none.
 */
staffSettings.patch('/settings/suppliers/:id/prices', ownersOnly, async (c) => {
  const session = c.get('session');
  try {
    const body = await bodyOf(c, MAX_PRICES_BYTES);
    const stored = await readSettings(c.env, session.companyId);
    if (!stored) return c.json(NO_COMPANY, 404, PRIVATE);
    const designers = stored.designers.map(designerView);
    const book = await priceBookFor(c.env, session.companyId, designers, true);
    const theirs = supplierBook(book, c.req.param('id'));
    const supplier = book.suppliers?.find((s) => s.id === c.req.param('id'));
    if (!theirs || !supplier) return c.json(NO_SUPPLIER, 404, PRIVATE);
    const changes = readPriceChanges(body.changes, theirs);
    if (changes.length === 0) return c.json({ ok: true, changed: false, prices: book }, 200, PRIVATE);
    const saved = await saveSupplierPrices(c.env, session.companyId, session.userId, supplier.id, changes, {
      changes: changes.map((ch) => ({ field: 'cost', supplier: { id: supplier.id, name: supplier.name }, ...ch })),
    });
    if (!saved) return c.json(STALE, 409, PRIVATE);
    return c.json({ ok: true, changed: true, prices: await priceBookFor(c.env, session.companyId, designers, true) }, 200, PRIVATE);
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status, PRIVATE);
    throw error;
  }
});


/** Import a supplier's price list from a CSV of keys, SKUs and costs. */
staffSettings.post('/settings/suppliers/:id/import', ownersOnly, async (c) => {
  const session = c.get('session');
  try {
    const body = await bodyOf(c, 1024 * 1024);
    const csv = typeof body.csv === 'string' ? body.csv : '';
    if (!csv.trim()) throw new RequestError(400, 'invalid_csv', 'Send the CSV to import.');
    const items = parseSupplierCsv(csv);
    const stored = await readSettings(c.env, session.companyId);
    if (!stored) return c.json(NO_COMPANY, 404, PRIVATE);
    const suppliers = await readSuppliers(c.env, session.companyId);
    const supplier = suppliers.find((s) => s.id === c.req.param('id'));
    if (!supplier) return c.json(NO_SUPPLIER, 404, PRIVATE);
    const replace = body.replace === true;
    const rows = items.map((item) => ({
      key: item.key ?? `sku:${item.sku}`,
      unit: item.unit,
      costPence: item.costPence,
      sku: item.sku,
    }));
    const saved = await importSupplierPrices(
      c.env,
      session.companyId,
      session.userId,
      supplier.id,
      rows,
      replace,
      { changes: [{ field: 'cost', change: 'imported', supplier: { id: supplier.id, name: supplier.name }, count: rows.length, replace }] }
    );
    if (!saved) return c.json(STALE, 409, PRIVATE);
    return c.json(
      { ok: true, imported: rows.length, prices: await priceBookFor(c.env, session.companyId, stored.designers.map(designerView), true) },
      200,
      PRIVATE
    );
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status, PRIVATE);
    throw error;
  }
});

/** Change the company's default markup, or a markup for one kind of line. */
staffSettings.patch('/settings/pricing', ownersOnly, async (c) => {
  const session = c.get('session');
  try {
    const body = await bodyOf(c);
    const answer = await withRetry(async () => {
      const stored = await readSettings(c.env, session.companyId);
      if (!stored) return c.json(NO_COMPANY, 404, PRIVATE);
      let settings: Record<string, unknown> = {};
      try {
        settings = JSON.parse(stored.company.settings) as Record<string, unknown>;
      } catch {
        // Unreadable settings are treated as none.
      }
      const before = pricingSettingsOf(settings);
      const after = readPricingSettings(body, before);
      if (before.markupBp === after.markupBp && JSON.stringify(before.categoryMarkupBp) === JSON.stringify(after.categoryMarkupBp)) {
        return c.json({ ok: true, changed: false, pricing: before }, 200, PRIVATE);
      }
      const saved = await savePricing(
        c.env,
        session.companyId,
        session.userId,
        stored.company.settings,
        JSON.stringify(storedPricing(settings, after)),
        { changes: [{ field: 'pricing', from: before, to: after }] }
      );
      return saved ? c.json({ ok: true, changed: true, pricing: after }, 200, PRIVATE) : null;
    });
    return answer ?? c.json(STALE, 409, PRIVATE);
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status, PRIVATE);
    throw error;
  }
});

// ---------------------------------------------------------------------------
// Setting up
// ---------------------------------------------------------------------------

/**
 * Where an owner is with the set-up wizard: the step they reached, or that
 * they have finished. It changes nothing a customer sees, so it is not in the
 * audit log. A company that was never sent to the wizard can still finish it.
 */
staffSettings.post('/set-up', ownersOnly, async (c) => {
  const session = c.get('session');
  try {
    const body = await bodyOf(c);
    const step = body.step;
    if (step !== undefined && !(typeof step === 'number' && Number.isInteger(step) && step >= 0 && step < 50)) {
      return c.json({ error: 'invalid_request', message: 'That is not a step of setting up.' }, 400, PRIVATE);
    }
    if (body.done !== undefined && typeof body.done !== 'boolean') {
      return c.json({ error: 'invalid_request', message: 'Setting up is finished or it is not.' }, 400, PRIVATE);
    }
    const stored = await readSettings(c.env, session.companyId);
    if (!stored) return c.json(NO_COMPANY, 404, PRIVATE);
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(stored.company.settings) as Record<string, unknown>;
    } catch {
      // Unreadable settings are treated as none.
    }
    const before = setUpOf(settings);
    const setUp = {
      done: typeof body.done === 'boolean' ? body.done : (before?.done ?? false),
      ...(typeof step === 'number' ? { step } : before?.step !== undefined ? { step: before.step } : {}),
    };
    await saveSetUp(c.env, session.companyId, setUp);
    return c.json({ ok: true, setUp }, 200, PRIVATE);
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status, PRIVATE);
    throw error;
  }
});
