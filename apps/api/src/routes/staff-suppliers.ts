/**
 * A company's suppliers and their price lists, for owners to keep and for
 * staff to see: who they buy glass and hardware from, what each charges,
 * and the markup that turns a cost into a selling price on a new quote.
 *
 * Only an owner may change them. Importing a CSV of items is how a later
 * CRL catalogue, or a new list from a toughener, is loaded.
 */

import { Hono, type Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Session } from '../db/auth';
import { companyDb, DataError, type CompanyDb } from '../db/company-db';
import { savePricing } from '../db/settings';
import { RequestError } from '../lib/enquiry';
import {
  isPriceListStatus,
  isQuoteUnit,
  isSupplierKind,
  MAX_ACCOUNT_REF,
  MAX_ITEM_DESCRIPTION,
  MAX_ITEMS_PER_LIST,
  MAX_LIST_NAME,
  MAX_LISTS_PER_SUPPLIER,
  MAX_NOTES,
  MAX_SKU,
  MAX_SOURCE,
  MAX_SUPPLIER_NAME,
  MAX_SUPPLIERS,
  parseItemRules,
  pricingSettingsOf,
  readDay,
  readOptionalText,
  readPricingSettings,
  type SupplierKind,
} from '../lib/pricing';
import { readSupplierCsv } from '../lib/supplier-csv';
import type { QuoteUnit, Row } from '../db/tables';

type Bindings = { Bindings: Env; Variables: { session: Session } };

export const staffSuppliers = new Hono<Bindings>();

const PRIVATE = { 'Cache-Control': 'no-store' };
const MAX_BODY_BYTES = 64 * 1024;
const MAX_CSV_BYTES = 1024 * 1024;
const KEY = /^[a-z0-9][a-z0-9:._-]{0,99}$/;

const ownersOnly = createMiddleware<Bindings>(async (c, next) => {
  if (c.get('session').role !== 'owner') {
    return c.json({ error: 'owners_only', message: 'Only an owner can change the company’s suppliers and prices.' }, 403, PRIVATE);
  }
  await next();
});

const caught = (handler: (c: Context<Bindings>) => Promise<Response>) => async (c: Context<Bindings>) => {
  try {
    return await handler(c);
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status, PRIVATE);
    throw error;
  }
};

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

function param(c: Context<Bindings>, name: string): string {
  const value = c.req.param(name);
  if (!value) throw new RequestError(404, 'not_found', 'There is no such thing.');
  return value;
}

const presentItem = (item: Row<'supplier_price_items'>) => ({
  id: item.id,
  key: item.key,
  sku: item.sku,
  description: item.description,
  unit: item.unit,
  costPence: item.cost_pence,
  sellPence: item.sell_pence,
  rules: item.rules,
  notes: item.notes,
  updatedAt: item.updated_at,
});

const presentList = (list: Row<'supplier_price_lists'>, itemCount: number, items?: Row<'supplier_price_items'>[]) => ({
  id: list.id,
  supplierId: list.supplier_id,
  name: list.name,
  status: list.status,
  effectiveFrom: list.effective_from,
  effectiveTo: list.effective_to,
  currency: list.currency,
  vatIncluded: list.vat_included === 1,
  source: list.source,
  notes: list.notes,
  itemCount,
  updatedAt: list.updated_at,
  ...(items ? { items: items.map(presentItem) } : {}),
});

const presentSupplier = (
  supplier: Row<'suppliers'>,
  lists: { list: Row<'supplier_price_lists'>; itemCount: number }[]
) => ({
  id: supplier.id,
  name: supplier.name,
  kind: supplier.kind,
  accountRef: supplier.account_ref,
  notes: supplier.notes,
  isDefault: supplier.is_default === 1,
  active: supplier.active === 1,
  lists: lists.map(({ list, itemCount }) => presentList(list, itemCount)),
  updatedAt: supplier.updated_at,
});

async function listsOf(db: CompanyDb, supplierId: string) {
  const lists = await db.find('supplier_price_lists', { where: { supplier_id: supplierId }, orderBy: { column: 'created_at', direction: 'desc' } });
  const withCount: { list: Row<'supplier_price_lists'>; itemCount: number }[] = [];
  for (const list of lists) {
    withCount.push({ list, itemCount: await db.count('supplier_price_items', { list_id: list.id }) });
  }
  return withCount;
}

async function allSuppliers(db: CompanyDb) {
  const suppliers = await db.find('suppliers', { orderBy: { column: 'created_at' } });
  return Promise.all(suppliers.map(async (s) => presentSupplier(s, await listsOf(db, s.id))));
}

async function mustSupplier(db: CompanyDb, id: string) {
  const supplier = await db.get('suppliers', id);
  if (!supplier) throw new RequestError(404, 'not_found', 'There is no such supplier.');
  return supplier;
}

async function mustList(db: CompanyDb, supplierId: string, listId: string) {
  const list = await db.get('supplier_price_lists', listId);
  if (!list || list.supplier_id !== supplierId) throw new RequestError(404, 'not_found', 'There is no such price list.');
  return list;
}

async function clearDefault(db: CompanyDb, kind: SupplierKind, exceptId?: string) {
  const current = await db.find('suppliers', { where: { kind, is_default: 1 } });
  for (const row of current) {
    if (row.id === exceptId) continue;
    await db.update('suppliers', row.id, { is_default: 0 });
  }
}

async function supersedeActive(db: CompanyDb, supplierId: string, exceptId?: string) {
  const current = await db.find('supplier_price_lists', { where: { supplier_id: supplierId, status: 'active' } });
  for (const row of current) {
    if (row.id === exceptId) continue;
    await db.update('supplier_price_lists', row.id, { status: 'superseded' });
  }
}

/** The company's suppliers, their lists, and the markup a new quote uses. */
staffSuppliers.get(
  '/settings/suppliers',
  caught(async (c) => {
    const db = companyDb(c.env, c.get('session').companyId);
    const company = await db.company();
    if (!company) return c.json({ error: 'not_found', message: 'This company could not be found.' }, 404, PRIVATE);
    return c.json(
      { suppliers: await allSuppliers(db), pricing: pricingSettingsOf(company.settings) },
      200,
      PRIVATE
    );
  })
);

staffSuppliers.patch(
  '/settings/pricing',
  ownersOnly,
  caught(async (c) => {
    const session = c.get('session');
    const db = companyDb(c.env, session.companyId);
    const company = await db.company();
    if (!company) return c.json({ error: 'not_found', message: 'This company could not be found.' }, 404, PRIVATE);
    const before = pricingSettingsOf(company.settings);
    const after = readPricingSettings(await bodyOf(c), before);
    if (after.markupBp === before.markupBp && JSON.stringify(after.categoryMarkupBp) === JSON.stringify(before.categoryMarkupBp)) {
      return c.json({ ok: true, changed: false, pricing: before }, 200, PRIVATE);
    }
    await savePricing(c.env, session.companyId, session.userId, after, {
      changes: [
        { field: 'markupBp', from: before.markupBp, to: after.markupBp },
        { field: 'categoryMarkupBp', from: before.categoryMarkupBp, to: after.categoryMarkupBp },
      ],
    });
    return c.json({ ok: true, changed: true, pricing: after }, 200, PRIVATE);
  })
);

staffSuppliers.post(
  '/settings/suppliers',
  ownersOnly,
  caught(async (c) => {
    const session = c.get('session');
    const db = companyDb(c.env, session.companyId);
    const body = await bodyOf(c);
    const name = readOptionalText(body.name, 'A name', MAX_SUPPLIER_NAME, true);
    if (!isSupplierKind(body.kind)) throw new RequestError(400, 'invalid_request', 'A supplier is of glass, hardware, or other.');
    const kind = body.kind;
    if ((await db.count('suppliers')) >= MAX_SUPPLIERS) {
      throw new RequestError(400, 'invalid_request', `A company can have at most ${MAX_SUPPLIERS} suppliers.`);
    }
    const existing = await db.find('suppliers', { where: { kind, active: 1 } });
    const isDefault = body.isDefault === true || body.isDefault === 1 || existing.length === 0;
    if (isDefault) await clearDefault(db, kind);
    const supplier = await db.insert('suppliers', {
      name: name!,
      kind,
      account_ref: readOptionalText(body.accountRef, 'The account number', MAX_ACCOUNT_REF),
      notes: readOptionalText(body.notes, 'Notes', MAX_NOTES),
      is_default: isDefault ? 1 : 0,
      active: body.active === false || body.active === 0 ? 0 : 1,
    });
    return c.json({ ok: true, supplier: presentSupplier(supplier, []) }, 201, PRIVATE);
  })
);

staffSuppliers.patch(
  '/settings/suppliers/:id',
  ownersOnly,
  caught(async (c) => {
    const db = companyDb(c.env, c.get('session').companyId);
    const supplier = await mustSupplier(db, param(c, 'id'));
    const body = await bodyOf(c);
    const changes: Partial<Row<'suppliers'>> = {};
    if (body.name !== undefined) {
      const name = readOptionalText(body.name, 'A name', MAX_SUPPLIER_NAME, true);
      if (!name) throw new RequestError(400, 'invalid_request', 'A name is needed.');
      changes.name = name;
    }
    if (body.accountRef !== undefined) changes.account_ref = readOptionalText(body.accountRef, 'The account number', MAX_ACCOUNT_REF);
    if (body.notes !== undefined) changes.notes = readOptionalText(body.notes, 'Notes', MAX_NOTES);
    if (body.active !== undefined) changes.active = body.active === false || body.active === 0 ? 0 : 1;
    if (body.isDefault === true || body.isDefault === 1) {
      await clearDefault(db, supplier.kind, supplier.id);
      changes.is_default = 1;
    } else if (body.isDefault === false || body.isDefault === 0) {
      changes.is_default = 0;
    }
    if (Object.keys(changes).length === 0) {
      return c.json({ ok: true, changed: false, supplier: presentSupplier(supplier, await listsOf(db, supplier.id)) }, 200, PRIVATE);
    }
    const saved = await db.update('suppliers', supplier.id, changes);
    return c.json({ ok: true, changed: true, supplier: presentSupplier(saved!, await listsOf(db, supplier.id)) }, 200, PRIVATE);
  })
);

staffSuppliers.delete(
  '/settings/suppliers/:id',
  ownersOnly,
  caught(async (c) => {
    const db = companyDb(c.env, c.get('session').companyId);
    const supplier = await mustSupplier(db, param(c, 'id'));
    if ((await db.count('supplier_price_lists', { supplier_id: supplier.id })) > 0) {
      throw new RequestError(409, 'in_use', 'Take the price lists off this supplier before removing it.');
    }
    const jobs = (await db.find('jobs')).filter((j) => j.glass_supplier_id === supplier.id || j.hardware_supplier_id === supplier.id);
    const quotes = (await db.find('quotes')).filter((q) => q.glass_supplier_id === supplier.id || q.hardware_supplier_id === supplier.id);
    if (jobs.length || quotes.length) {
      throw new RequestError(409, 'in_use', 'A job or a quote still uses this supplier, so it cannot be removed. Switch it off instead.');
    }
    await db.remove('suppliers', supplier.id);
    return c.json({ ok: true }, 200, PRIVATE);
  })
);

staffSuppliers.post(
  '/settings/suppliers/:id/lists',
  ownersOnly,
  caught(async (c) => {
    const db = companyDb(c.env, c.get('session').companyId);
    const supplier = await mustSupplier(db, param(c, 'id'));
    const body = await bodyOf(c);
    const name = readOptionalText(body.name, 'A name', MAX_LIST_NAME, true);
    if ((await db.count('supplier_price_lists', { supplier_id: supplier.id })) >= MAX_LISTS_PER_SUPPLIER) {
      throw new RequestError(400, 'invalid_request', `A supplier can have at most ${MAX_LISTS_PER_SUPPLIER} price lists.`);
    }
    let status = body.status === undefined || body.status === '' ? 'draft' : body.status;
    if (!isPriceListStatus(status)) throw new RequestError(400, 'invalid_request', 'A list is a draft, active, or superseded.');
    if (status === 'active') await supersedeActive(db, supplier.id);
    const list = await db.insert('supplier_price_lists', {
      supplier_id: supplier.id,
      name: name!,
      status,
      effective_from: readDay(body.effectiveFrom, 'The day it starts'),
      effective_to: readDay(body.effectiveTo, 'The day it ends'),
      currency: typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim().toUpperCase() : 'GBP',
      vat_included: body.vatIncluded === true || body.vatIncluded === 1 ? 1 : 0,
      source: readOptionalText(body.source, 'The source', MAX_SOURCE),
      notes: readOptionalText(body.notes, 'Notes', MAX_NOTES),
    });
    return c.json({ ok: true, list: presentList(list, 0, []) }, 201, PRIVATE);
  })
);

staffSuppliers.get(
  '/settings/suppliers/:id/lists/:listId',
  caught(async (c) => {
    const db = companyDb(c.env, c.get('session').companyId);
    const supplier = await mustSupplier(db, param(c, 'id'));
    const list = await mustList(db, supplier.id, param(c, 'listId'));
    const items = await db.find('supplier_price_items', { where: { list_id: list.id }, orderBy: { column: 'created_at' }, limit: MAX_ITEMS_PER_LIST });
    return c.json({ list: presentList(list, items.length, items) }, 200, PRIVATE);
  })
);

staffSuppliers.patch(
  '/settings/suppliers/:id/lists/:listId',
  ownersOnly,
  caught(async (c) => {
    const db = companyDb(c.env, c.get('session').companyId);
    const supplier = await mustSupplier(db, param(c, 'id'));
    const list = await mustList(db, supplier.id, param(c, 'listId'));
    const body = await bodyOf(c);
    const changes: Partial<Row<'supplier_price_lists'>> = {};
    if (body.name !== undefined) {
      const name = readOptionalText(body.name, 'A name', MAX_LIST_NAME, true);
      if (!name) throw new RequestError(400, 'invalid_request', 'A name is needed.');
      changes.name = name;
    }
    if (body.effectiveFrom !== undefined) changes.effective_from = readDay(body.effectiveFrom, 'The day it starts');
    if (body.effectiveTo !== undefined) changes.effective_to = readDay(body.effectiveTo, 'The day it ends');
    if (body.currency !== undefined) {
      if (typeof body.currency !== 'string' || !body.currency.trim()) throw new RequestError(400, 'invalid_request', 'A currency is needed.');
      changes.currency = body.currency.trim().toUpperCase();
    }
    if (body.vatIncluded !== undefined) changes.vat_included = body.vatIncluded === true || body.vatIncluded === 1 ? 1 : 0;
    if (body.source !== undefined) changes.source = readOptionalText(body.source, 'The source', MAX_SOURCE);
    if (body.notes !== undefined) changes.notes = readOptionalText(body.notes, 'Notes', MAX_NOTES);
    if (body.status !== undefined) {
      if (!isPriceListStatus(body.status)) throw new RequestError(400, 'invalid_request', 'A list is a draft, active, or superseded.');
      if (body.status === 'active') await supersedeActive(db, supplier.id, list.id);
      changes.status = body.status;
    }
    if (Object.keys(changes).length === 0) {
      const count = await db.count('supplier_price_items', { list_id: list.id });
      return c.json({ ok: true, changed: false, list: presentList(list, count) }, 200, PRIVATE);
    }
    const saved = await db.update('supplier_price_lists', list.id, changes);
    const count = await db.count('supplier_price_items', { list_id: list.id });
    return c.json({ ok: true, changed: true, list: presentList(saved!, count) }, 200, PRIVATE);
  })
);

staffSuppliers.delete(
  '/settings/suppliers/:id/lists/:listId',
  ownersOnly,
  caught(async (c) => {
    const db = companyDb(c.env, c.get('session').companyId);
    const supplier = await mustSupplier(db, param(c, 'id'));
    const list = await mustList(db, supplier.id, param(c, 'listId'));
    const items = await db.find('supplier_price_items', { where: { list_id: list.id }, limit: MAX_ITEMS_PER_LIST });
    await db.batch((batch) => {
      for (const item of items) batch.remove('supplier_price_items', item.id);
      batch.remove('supplier_price_lists', list.id);
    });
    return c.json({ ok: true }, 200, PRIVATE);
  })
);

function readItemBody(body: Record<string, unknown>, partial = false): Partial<Row<'supplier_price_items'>> & { description?: string; unit?: QuoteUnit; cost_pence?: number } {
  const changes: Partial<Row<'supplier_price_items'>> = {};
  if (body.description !== undefined || !partial) {
    const description = readOptionalText(body.description, 'A description', MAX_ITEM_DESCRIPTION, !partial);
    if (description) changes.description = description;
  }
  if (body.unit !== undefined || !partial) {
    if (!isQuoteUnit(body.unit)) throw new RequestError(400, 'invalid_request', 'A unit is each, m2, m, set or job.');
    changes.unit = body.unit;
  }
  if (body.costPence !== undefined || body.cost_pence !== undefined || !partial) {
    const cost = body.costPence ?? body.cost_pence;
    if (typeof cost !== 'number' || !Number.isInteger(cost) || cost < 0 || cost > 100_000_000) {
      throw new RequestError(400, 'invalid_request', 'A cost is a whole number of pence.');
    }
    changes.cost_pence = cost;
  }
  if (body.key !== undefined) {
    const key = readOptionalText(body.key, 'The key', 100);
    if (key && !KEY.test(key)) throw new RequestError(400, 'invalid_request', 'That is not a SetOut key.');
    changes.key = key ? key.toLowerCase() : null;
  }
  if (body.sku !== undefined) changes.sku = readOptionalText(body.sku, 'The SKU', MAX_SKU);
  if (body.sellPence !== undefined || body.sell_pence !== undefined) {
    const sell = body.sellPence ?? body.sell_pence;
    if (sell === null) changes.sell_pence = null;
    else if (typeof sell !== 'number' || !Number.isInteger(sell) || sell < 0 || sell > 100_000_000) {
      throw new RequestError(400, 'invalid_request', 'A selling price is a whole number of pence.');
    } else changes.sell_pence = sell;
  }
  if (body.notes !== undefined) changes.notes = readOptionalText(body.notes, 'Notes', MAX_NOTES);
  if (body.rules !== undefined) changes.rules = { ...parseItemRules(body.rules) };
  return changes;
}

staffSuppliers.post(
  '/settings/suppliers/:id/lists/:listId/items',
  ownersOnly,
  caught(async (c) => {
    const db = companyDb(c.env, c.get('session').companyId);
    const supplier = await mustSupplier(db, param(c, 'id'));
    const list = await mustList(db, supplier.id, param(c, 'listId'));
    if ((await db.count('supplier_price_items', { list_id: list.id })) >= MAX_ITEMS_PER_LIST) {
      throw new RequestError(400, 'invalid_request', `A list can have at most ${MAX_ITEMS_PER_LIST} items.`);
    }
    const body = readItemBody(await bodyOf(c));
    if (!body.description || !body.unit || body.cost_pence === undefined) {
      throw new RequestError(400, 'invalid_request', 'An item needs a description, a unit and a cost.');
    }
    try {
      const item = await db.insert('supplier_price_items', {
        list_id: list.id,
        key: body.key ?? null,
        sku: body.sku ?? null,
        description: body.description,
        unit: body.unit,
        cost_pence: body.cost_pence,
        sell_pence: body.sell_pence ?? null,
        rules: body.rules ?? {},
        notes: body.notes ?? null,
      });
      return c.json({ ok: true, item: presentItem(item) }, 201, PRIVATE);
    } catch (error) {
      if (/UNIQUE/i.test(error instanceof Error ? error.message : String(error))) {
        throw new RequestError(409, 'duplicate', 'This list already has an item with that key or SKU.');
      }
      throw error;
    }
  })
);

staffSuppliers.patch(
  '/settings/suppliers/:id/lists/:listId/items/:itemId',
  ownersOnly,
  caught(async (c) => {
    const db = companyDb(c.env, c.get('session').companyId);
    const supplier = await mustSupplier(db, param(c, 'id'));
    const list = await mustList(db, supplier.id, param(c, 'listId'));
    const item = await db.get('supplier_price_items', param(c, 'itemId'));
    if (!item || item.list_id !== list.id) throw new RequestError(404, 'not_found', 'There is no such item.');
    const changes = readItemBody(await bodyOf(c), true);
    if (Object.keys(changes).length === 0) return c.json({ ok: true, changed: false, item: presentItem(item) }, 200, PRIVATE);
    try {
      const saved = await db.update('supplier_price_items', item.id, changes);
      return c.json({ ok: true, changed: true, item: presentItem(saved!) }, 200, PRIVATE);
    } catch (error) {
      if (/UNIQUE/i.test(error instanceof Error ? error.message : String(error))) {
        throw new RequestError(409, 'duplicate', 'This list already has an item with that key or SKU.');
      }
      throw error;
    }
  })
);

staffSuppliers.delete(
  '/settings/suppliers/:id/lists/:listId/items/:itemId',
  ownersOnly,
  caught(async (c) => {
    const db = companyDb(c.env, c.get('session').companyId);
    const supplier = await mustSupplier(db, param(c, 'id'));
    const list = await mustList(db, supplier.id, param(c, 'listId'));
    const item = await db.get('supplier_price_items', param(c, 'itemId'));
    if (!item || item.list_id !== list.id) throw new RequestError(404, 'not_found', 'There is no such item.');
    await db.remove('supplier_price_items', item.id);
    return c.json({ ok: true }, 200, PRIVATE);
  })
);

staffSuppliers.post(
  '/settings/suppliers/:id/lists/:listId/import',
  ownersOnly,
  caught(async (c) => {
    const db = companyDb(c.env, c.get('session').companyId);
    const supplier = await mustSupplier(db, param(c, 'id'));
    const list = await mustList(db, supplier.id, param(c, 'listId'));
    const contentType = c.req.header('content-type') ?? '';
    let csv = '';
    let replace = false;
    if (contentType.includes('text/csv') || contentType.includes('application/csv')) {
      if (Number(c.req.header('content-length') ?? 0) > MAX_CSV_BYTES) {
        throw new RequestError(413, 'too_large', 'That is too much to import at once.');
      }
      csv = await c.req.text();
      replace = c.req.query('replace') === '1' || c.req.query('replace') === 'true';
    } else {
      const body = await bodyOf(c, MAX_CSV_BYTES);
      if (typeof body.csv !== 'string') throw new RequestError(400, 'invalid_request', 'Send the CSV as { csv } or as a text/csv body.');
      csv = body.csv;
      replace = body.replace === true;
    }
    const imported = readSupplierCsv(csv);
    const existing = await db.find('supplier_price_items', { where: { list_id: list.id }, limit: MAX_ITEMS_PER_LIST });
    if (!replace && existing.length + imported.length > MAX_ITEMS_PER_LIST) {
      throw new RequestError(400, 'invalid_request', `A list can have at most ${MAX_ITEMS_PER_LIST} items.`);
    }
    try {
      await db.batch((batch) => {
        if (replace) for (const item of existing) batch.remove('supplier_price_items', item.id);
        for (const item of imported) {
          batch.insert('supplier_price_items', {
            list_id: list.id,
            key: item.key,
            sku: item.sku,
            description: item.description,
            unit: item.unit,
            cost_pence: item.costPence,
            sell_pence: item.sellPence,
            rules: { ...item.rules },
            notes: item.notes,
          });
        }
      });
    } catch (error) {
      const message = error instanceof DataError ? error.message : error instanceof Error ? error.message : String(error);
      if (/UNIQUE/i.test(message)) throw new RequestError(409, 'duplicate', 'This list already has an item with that key or SKU.');
      throw error;
    }
    const items = await db.find('supplier_price_items', { where: { list_id: list.id }, orderBy: { column: 'created_at' }, limit: MAX_ITEMS_PER_LIST });
    return c.json({ ok: true, imported: imported.length, list: presentList(list, items.length, items) }, 200, PRIVATE);
  })
);

staffSuppliers.patch(
  '/jobs/:id/suppliers',
  caught(async (c) => {
    const db = companyDb(c.env, c.get('session').companyId);
    const job = await db.get('jobs', param(c, 'id'));
    if (!job) return c.json({ error: 'not_found', message: 'There is no such job.' }, 404, PRIVATE);
    const body = await bodyOf(c);
    const readId = async (value: unknown, kind: SupplierKind): Promise<string | null | undefined> => {
      if (value === undefined) return undefined;
      if (value === null || value === '') return null;
      if (typeof value !== 'string') throw new RequestError(400, 'invalid_request', 'Send a supplier, or none.');
      const supplier = await db.get('suppliers', value);
      if (!supplier || !supplier.active) throw new RequestError(400, 'invalid_request', 'There is no such supplier.');
      if (supplier.kind !== kind) throw new RequestError(400, 'invalid_request', `That supplier is not a ${kind} supplier.`);
      return supplier.id;
    };
    const glass = await readId(body.glassSupplierId, 'glass');
    const hardware = await readId(body.hardwareSupplierId, 'hardware');
    const changes: Partial<Row<'jobs'>> = {};
    if (glass !== undefined) changes.glass_supplier_id = glass;
    if (hardware !== undefined) changes.hardware_supplier_id = hardware;
    if (Object.keys(changes).length === 0) {
      return c.json({ ok: true, changed: false, glassSupplierId: job.glass_supplier_id, hardwareSupplierId: job.hardware_supplier_id }, 200, PRIVATE);
    }
    const saved = await db.update('jobs', job.id, changes);
    return c.json(
      { ok: true, changed: true, glassSupplierId: saved!.glass_supplier_id, hardwareSupplierId: saved!.hardware_supplier_id },
      200,
      PRIVATE
    );
  })
);
