/**
 * Suppliers in the price book: who the company buys from and what each
 * charges, seen and changed by owners alone, all of a change or none of it,
 * every change in the record, and never on a quote unless an owner puts it
 * in the price book. None of it reaches another company.
 *
 * The tests run in order, each building on what the last one left.
 */
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { addMember } from '../src/db/auth';
import { api, company, enquire, json, post, signIn, type Company } from './helpers';

interface Row {
  label: string;
  unit: string;
  keys: string[];
}
interface Supplier {
  id: string;
  name: string;
  prices: Record<string, { pence: number; updatedAt: string }>;
  others: Row[];
}
interface PriceBody {
  groups: { id: string; rows: Row[] }[];
  prices: Record<string, { pence: number }>;
  suppliers?: Supplier[];
}
interface SettingsBody {
  prices: PriceBody;
  changes?: { data: { changes: Record<string, unknown>[] } }[];
}

let shop: Company;
let owner: string;
let staff: string;
let rival: string;
let glazier = '';
let crl = '';

const read = async (cookie = owner) => json<SettingsBody>(await api('/settings', { cookie }));
const suppliers = async (cookie = owner) => (await read(cookie)).prices.suppliers;
const supplier = async (id: string) => (await suppliers())?.find((s) => s.id === id);
const send = (method: string, path: string, body: unknown, cookie = owner) => api(path, { cookie, method, body: JSON.stringify(body) });
const add = (name: unknown, cookie = owner) => post('/settings/suppliers', { name }, { cookie });
const costs = (id: string, changes: unknown, cookie = owner) => send('PATCH', `/settings/suppliers/${id}/prices`, { changes }, cookie);
const errorOf = async (response: Response) => [response.status, (await json<{ error: string }>(response)).error];
const latest = async () => (await read()).changes?.[0].data.changes;

beforeAll(async () => {
  shop = await company('Supplier Showers', 'SU');
  const other = await company('Other Glass', 'OG');
  await addMember(env, shop.id, 'owner@su.example', 'owner');
  await addMember(env, shop.id, 'staff@su.example', 'staff');
  await addMember(env, other.id, 'owner@og.example', 'owner');
  await enquire(shop, 'Sam Supplies', 'sam@example.test', 'SU1 1AA');
  owner = await signIn('owner@su.example');
  staff = await signIn('staff@su.example');
  rival = await signIn('owner@og.example');
});

describe('adding suppliers', () => {
  test('a company starts with none, and only owners are told about them', async () => {
    expect(await suppliers()).toEqual([]);
    expect(await suppliers(staff)).toBeUndefined();
  });

  test('an owner adds the toughener and CRL, in that order, and the record says so', async () => {
    const first = await add('  Smart   Glazier ');
    expect(first.status).toBe(201);
    glazier = (await json<{ id: string }>(first)).id;
    expect(glazier).toMatch(/^sup_/);
    expect(await latest()).toEqual([{ field: 'supplier', change: 'added', id: glazier, label: 'Smart Glazier' }]);
    crl = (await json<{ id: string }>(await add('CRL'))).id;
    expect((await suppliers())?.map((s) => s.name)).toEqual(['Smart Glazier', 'CRL']);
  });

  test.each([
    ['a name already used, whatever its capitals', 'smart glazier', [409, 'name_taken']],
    ['no name', '   ', [400, 'invalid_supplier']],
    ['a name too long', 'x'.repeat(61), [400, 'invalid_supplier']],
    ['a name that is not words', 7, [400, 'invalid_supplier']],
  ])('%s is refused', async (_, name, error) => {
    expect(await errorOf(await add(name))).toEqual(error);
    expect(await suppliers()).toHaveLength(2);
  });

  test('a staff member cannot add one', async () => {
    expect((await add('Cheap Glass', staff)).status).toBe(403);
  });
});

describe('what a supplier charges', () => {
  test('is laid out as the price book is, without fitting and delivery, which are the company’s own', async () => {
    expect(await errorOf(await costs(glazier, [{ key: 'fitting', from: null, to: 100 }]))).toEqual([400, 'invalid_prices']);
    expect(await errorOf(await costs(glazier, [{ key: 'delivery', from: null, to: 100 }]))).toEqual([400, 'invalid_prices']);
  });

  test('an owner sets each supplier’s prices, and the record names the supplier', async () => {
    const response = await costs(glazier, [
      { key: 'glass:10:clear', from: null, to: 8_000 },
      { key: 'cutout:notch', from: null, to: 900 },
    ]);
    expect(response.status).toBe(200);
    expect((await costs(crl, [{ key: 'hinge:gen044:chrome', from: null, to: 3_100 }])).status).toBe(200);
    const theirs = await supplier(glazier);
    expect(Object.fromEntries(Object.entries(theirs?.prices ?? {}).map(([k, v]) => [k, v.pence]))).toEqual({ 'glass:10:clear': 8_000, 'cutout:notch': 900 });
    expect((await supplier(crl))?.prices['hinge:gen044:chrome'].pence).toBe(3_100);
    expect(await latest()).toEqual([
      {
        field: 'cost',
        supplier: { id: crl, name: 'CRL' },
        key: 'hinge:gen044:chrome',
        label: 'Geneva, to the wall, offset back plate, Polished chrome',
        unit: 'each',
        from: null,
        to: 3_100,
      },
    ]);
  });

  test('two suppliers can price the same thing, each its own', async () => {
    expect((await costs(crl, [{ key: 'glass:10:clear', from: null, to: 7_600 }])).status).toBe(200);
    expect((await supplier(glazier))?.prices['glass:10:clear'].pence).toBe(8_000);
    expect((await supplier(crl))?.prices['glass:10:clear'].pence).toBe(7_600);
  });

  test('a change made from an older copy is refused whole', async () => {
    const response = await costs(glazier, [
      { key: 'cutout:hole', from: null, to: 450 },
      { key: 'glass:10:clear', from: null, to: 8_400 },
    ]);
    expect(await errorOf(response)).toEqual([409, 'stale']);
    const theirs = await supplier(glazier);
    expect(theirs?.prices['cutout:hole']).toBeUndefined();
    expect(theirs?.prices['glass:10:clear'].pence).toBe(8_000);
  });

  test('a price taken away is gone', async () => {
    expect((await costs(crl, [{ key: 'glass:10:clear', from: 7_600, to: null }])).status).toBe(200);
    expect((await supplier(crl))?.prices['glass:10:clear']).toBeUndefined();
  });

  test('a supplier’s price for something no longer offered is listed under its other prices, and can be taken away', async () => {
    await shop.db.insert('supplier_prices', { supplier_id: crl, key: 'hinge:gen044:polished-gold', unit: 'each', cost_pence: 5_000 });
    expect((await supplier(crl))?.others).toEqual([{ label: 'Hinge GEN044, polished gold', unit: 'each', keys: ['hinge:gen044:polished-gold'] }]);
    expect((await costs(crl, [{ key: 'hinge:gen044:polished-gold', from: 5_000, to: null }])).status).toBe(200);
    expect((await supplier(crl))?.others).toEqual([]);
  });

  test('a staff member cannot see or change them', async () => {
    expect((await costs(glazier, [{ key: 'cutout:hole', from: null, to: 450 }], staff)).status).toBe(403);
    expect(JSON.stringify(await read(staff))).not.toContain('8000');
  });

  test('never reach a quote: a new quote starts from the price book alone', async () => {
    const { jobs } = await json<{ jobs: { id: string }[] }>(await api('/jobs', { cookie: owner }));
    const made = await json<{ id: string }>(await post(`/jobs/${jobs[0].id}/quotes`, {}, { cookie: owner }));
    const { quote } = await json<{ quote: { lines: { key: string | null; unitPricePence: number }[] } }>(
      await api(`/jobs/${jobs[0].id}/quotes/${made.id}`, { cookie: owner })
    );
    expect(quote.lines.find((l) => l.key === 'glass:10:clear')?.unitPricePence).toBe(0);
  });
});

describe('renaming and removing a supplier', () => {
  const rename = (id: string, name: string, seen: string) => send('PATCH', `/settings/suppliers/${id}`, { name, basedOn: { name: seen } });

  test('an owner renames one from the name they saw', async () => {
    expect((await rename(glazier, 'Smart Glazier Ltd', 'Smart Glazier')).status).toBe(200);
    expect((await supplier(glazier))?.name).toBe('Smart Glazier Ltd');
    expect(await latest()).toEqual([{ field: 'supplier', change: 'renamed', id: glazier, label: 'Smart Glazier Ltd', from: 'Smart Glazier', to: 'Smart Glazier Ltd' }]);
  });

  test('a rename from an older name, or to another supplier’s, is refused', async () => {
    expect(await errorOf(await rename(glazier, 'Glazier', 'Smart Glazier'))).toEqual([409, 'stale']);
    expect(await errorOf(await rename(glazier, 'crl', 'Smart Glazier Ltd'))).toEqual([409, 'name_taken']);
    expect((await supplier(glazier))?.name).toBe('Smart Glazier Ltd');
  });

  test('removing one takes its prices with it, and leaves the price book and the other suppliers as they were', async () => {
    expect((await send('PATCH', '/settings/prices', { changes: [{ key: 'glass:10:clear', from: null, to: 12_000 }] })).status).toBe(200);
    expect((await send('DELETE', `/settings/suppliers/${glazier}`, {})).status).toBe(200);
    expect((await suppliers())?.map((s) => s.name)).toEqual(['CRL']);
    expect((await read()).prices.prices['glass:10:clear'].pence).toBe(12_000);
    expect((await supplier(crl))?.prices['hinge:gen044:chrome'].pence).toBe(3_100);
    expect(await shop.db.count('supplier_prices', { supplier_id: glazier } as never)).toBe(0);
    expect(await latest()).toEqual([{ field: 'supplier', change: 'removed', id: glazier, label: 'Smart Glazier Ltd' }]);
    expect(await errorOf(await costs(glazier, [{ key: 'cutout:hole', from: null, to: 450 }]))).toEqual([404, 'not_found']);
  });
});

describe('another company', () => {
  test('sees only its own suppliers, and cannot reach ours', async () => {
    expect(await suppliers(rival)).toEqual([]);
    expect(await errorOf(await costs(crl, [{ key: 'cutout:hole', from: null, to: 1 }], rival))).toEqual([404, 'not_found']);
    expect(await errorOf(await send('PATCH', `/settings/suppliers/${crl}`, { name: 'Taken', basedOn: { name: 'CRL' } }, rival))).toEqual([404, 'not_found']);
    expect(await errorOf(await send('DELETE', `/settings/suppliers/${crl}`, {}, rival))).toEqual([404, 'not_found']);
    expect((await supplier(crl))?.name).toBe('CRL');
  });

  test('can add a supplier of the same name as ours', async () => {
    expect((await add('CRL', rival)).status).toBe(201);
    expect((await suppliers(rival))?.map((s) => s.name)).toEqual(['CRL']);
  });
});
