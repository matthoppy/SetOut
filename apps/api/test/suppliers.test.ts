/**
 * Suppliers in the price book: who the company buys from and what each
 * charges, seen and changed by owners alone, all of a change or none of it,
 * and every change in the record. A new quote takes its cost from the default
 * supplier of that kind, plus the company's markup. None of it reaches another
 * company.
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
  kind: 'glass' | 'hardware' | 'other';
  isDefault: boolean;
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
let firstQuote: { jobId: string; id: string; lines: { key: string | null; unitPricePence: number; costPence?: number }[] } | null = null;

const read = async (cookie = owner) => json<SettingsBody>(await api('/settings', { cookie }));
const suppliers = async (cookie = owner) => (await read(cookie)).prices.suppliers;
const supplier = async (id: string) => (await suppliers())?.find((s) => s.id === id);
const send = (method: string, path: string, body: unknown, cookie = owner) => api(path, { cookie, method, body: JSON.stringify(body) });
const add = (name: unknown, cookie: string | { kind?: string } = owner, fields: Record<string, unknown> = {}) => {
  const opts = typeof cookie === 'string' ? { cookie, fields } : { cookie: owner, fields: cookie };
  return post('/settings/suppliers', { name, ...opts.fields }, { cookie: opts.cookie });
};
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
    const first = await add('  Smart   Glazier ', { kind: 'glass' });
    expect(first.status).toBe(201);
    glazier = (await json<{ id: string }>(first)).id;
    expect(glazier).toMatch(/^sup_/);
    expect(await latest()).toEqual([{ field: 'supplier', change: 'added', id: glazier, label: 'Smart Glazier', kind: 'glass' }]);
    crl = (await json<{ id: string }>(await add('CRL', { kind: 'hardware' }))).id;
    const listed = await suppliers();
    expect(listed?.map((s) => ({ name: s.name, kind: s.kind, isDefault: s.isDefault }))).toEqual([
      { name: 'Smart Glazier', kind: 'glass', isDefault: true },
      { name: 'CRL', kind: 'hardware', isDefault: true },
    ]);
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

  test('a new quote starts from the default supplier’s cost plus 100% markup, and keeps a cost snapshot', async () => {
    const { jobs } = await json<{ jobs: { id: string }[] }>(await api('/jobs', { cookie: owner }));
    const made = await json<{ id: string }>(await post(`/jobs/${jobs[0].id}/quotes`, {}, { cookie: owner }));
    const { quote } = await json<{
      quote: { id: string; lines: { key: string | null; unitPricePence: number; costPence?: number; supplierId?: string }[] };
    }>(await api(`/jobs/${jobs[0].id}/quotes/${made.id}`, { cookie: owner }));
    const glass = quote.lines.find((l) => l.key === 'glass:10:clear');
    expect(glass).toMatchObject({ unitPricePence: 16_000, costPence: 8_000, supplierId: glazier });
    expect(quote.lines.some((l) => l.key === 'polish:edge')).toBe(true);
    expect(quote.lines.some((l) => l.key === 'delivery')).toBe(false);
    expect(quote.lines.some((l) => l.key === 'coating:enduroshield')).toBe(false);
    // Remember this quote: later cost changes must not rewrite it.
    firstQuote = { jobId: jobs[0].id, id: quote.id, lines: quote.lines };
  });
});



describe('kinds, markup, import, and how a quote is priced', () => {
  test('the first supplier of a kind is the default, and an owner can name another', async () => {
    const second = await json<{ id: string }>(await add('Second Toughener', { kind: 'glass' }));
    expect((await supplier(glazier))?.isDefault).toBe(true);
    expect((await supplier(second.id))?.isDefault).toBe(false);
    expect((await supplier(second.id))?.kind).toBe('glass');
    expect((await send('PATCH', `/settings/suppliers/${second.id}`, { isDefault: true, basedOn: { name: 'Second Toughener', kind: 'glass' } })).status).toBe(200);
    expect((await supplier(second.id))?.isDefault).toBe(true);
    expect((await supplier(glazier))?.isDefault).toBe(false);
    expect((await send('PATCH', `/settings/suppliers/${glazier}`, { isDefault: true, basedOn: { name: 'Smart Glazier', kind: 'glass' } })).status).toBe(200);
    expect((await send('DELETE', `/settings/suppliers/${second.id}`, {})).status).toBe(200);
    expect((await supplier(glazier))?.isDefault).toBe(true);
  });

  test('a new quote falls back to the price book when the default supplier has no cost', async () => {
    expect((await send('PATCH', '/settings/prices', { changes: [{ key: 'polish:edge', from: null, to: 321 }] })).status).toBe(200);
    const { jobs } = await json<{ jobs: { id: string }[] }>(await api('/jobs', { cookie: owner }));
    const made = await json<{ id: string }>(await post(`/jobs/${jobs[0].id}/quotes`, {}, { cookie: owner }));
    const { quote } = await json<{ quote: { lines: { key: string | null; unitPricePence: number; costPence?: number }[] } }>(
      await api(`/jobs/${jobs[0].id}/quotes/${made.id}`, { cookie: owner })
    );
    const polish = quote.lines.find((l) => l.key === 'polish:edge');
    expect(polish).toMatchObject({ unitPricePence: 321 });
    expect(polish?.costPence).toBeUndefined();
  });

  test('a quote already written is not changed when a cost or markup later is', async () => {
    expect(firstQuote).not.toBeNull();
    expect((await costs(glazier, [{ key: 'glass:10:clear', from: 8_000, to: 9_000 }])).status).toBe(200);
    const { quote: again } = await json<{ quote: { lines: { key: string | null; unitPricePence: number }[] } }>(
      await api(`/jobs/${firstQuote!.jobId}/quotes/${firstQuote!.id}`, { cookie: owner })
    );
    expect(again.lines.find((l) => l.key === 'glass:10:clear')?.unitPricePence).toBe(16_000);
    const made = await json<{ id: string }>(await post(`/jobs/${firstQuote!.jobId}/quotes`, {}, { cookie: owner }));
    const { quote: next } = await json<{ quote: { lines: { key: string | null; unitPricePence: number; costPence?: number }[] } }>(
      await api(`/jobs/${firstQuote!.jobId}/quotes/${made.id}`, { cookie: owner })
    );
    expect(next.lines.find((l) => l.key === 'glass:10:clear')).toMatchObject({ unitPricePence: 18_000, costPence: 9_000 });
    expect((await costs(glazier, [{ key: 'glass:10:clear', from: 9_000, to: 8_000 }])).status).toBe(200);
  });

  test('an owner can set the markup, and staff are not told it', async () => {
    const settings = await json<{ pricing?: { markupBp: number } }>(await api('/settings', { cookie: owner }));
    expect(settings.pricing?.markupBp).toBe(10_000);
    expect((await json<{ pricing?: unknown }>(await api('/settings', { cookie: staff }))).pricing).toBeUndefined();
    expect((await send('PATCH', '/settings/pricing', { markupBp: 5_000 })).status).toBe(200);
    const made = await json<{ id: string }>(await post(`/jobs/${firstQuote!.jobId}/quotes`, {}, { cookie: owner }));
    const { quote } = await json<{ quote: { lines: { key: string | null; unitPricePence: number }[] } }>(
      await api(`/jobs/${firstQuote!.jobId}/quotes/${made.id}`, { cookie: owner })
    );
    expect(quote.lines.find((l) => l.key === 'glass:10:clear')?.unitPricePence).toBe(12_000);
    expect((await send('PATCH', '/settings/pricing', { markupBp: 10_000 })).status).toBe(200);
  });

  test('an owner can import a CSV of a supplier’s prices, including a SKU-only row', async () => {
    const csv =
      'key,sku,description,unit,cost\n' +
      'hinge:gen044:matte-black,GEN044MB,Geneva matte black,each,15.00\n' +
      ',SER78,Serenity kit,each,80.00\n';
    const response = await send('POST', `/settings/suppliers/${crl}/import`, { csv, replace: false });
    expect(response.status).toBe(200);
    const body = await json<{ imported: number }>(response);
    expect(body.imported).toBe(2);
    const theirs = await supplier(crl);
    expect(theirs?.prices['hinge:gen044:matte-black'].pence).toBe(1_500);
    expect(theirs?.others.some((row) => row.keys[0] === 'sku:SER78')).toBe(true);
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
