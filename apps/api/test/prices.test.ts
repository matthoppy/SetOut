/**
 * The price book in Settings: seen by the whole team, changed by owners
 * alone, all of a change or none of it, every change in the record, and the
 * prices the next quote starts from. None of it reaches another company.
 *
 * The tests run in order, each building on the prices the last one left.
 */
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { addMember } from '../src/db/auth';
import { api, company, enquire, json, post, signIn, type Company } from './helpers';

interface Row {
  label: string;
  code?: string;
  unit: string;
  keys: string[];
}
interface PriceBody {
  groups: { id: string; title: string; columns?: { id: string; label: string }[]; sameAcross?: boolean; rows: Row[] }[];
  prices: Record<string, { pence: number; updatedAt: string }>;
}
interface SettingsBody {
  prices: PriceBody;
  changes?: { data: { changes: Record<string, unknown>[] } }[];
}
interface Line {
  key: string | null;
  unit: string;
  unitPricePence: number;
}

let shop: Company;
let other: Company;
let owner: string;
let staff: string;
let rival: string;
let jobId = '';

const read = async (cookie = owner) => json<SettingsBody>(await api('/settings', { cookie }));
const book = async (cookie = owner) => (await read(cookie)).prices;
const change = (changes: unknown, cookie = owner) => api('/settings/prices', { cookie, method: 'PATCH', body: JSON.stringify({ changes }) });
const errorOf = async (response: Response) => [response.status, (await json<{ error: string }>(response)).error];
/** A new quote for the job, as it is first drafted. */
const draft = async () => {
  const made = await post(`/jobs/${jobId}/quotes`, {}, { cookie: owner });
  expect(made.status).toBe(201);
  const { id } = await json<{ id: string }>(made);
  return (await json<{ quote: { lines: Line[] } }>(await api(`/jobs/${jobId}/quotes/${id}`, { cookie: owner }))).quote.lines;
};

beforeAll(async () => {
  shop = await company('Price Showers', 'PS');
  other = await company('Other Glass', 'OG');
  await addMember(env, shop.id, 'owner@ps.example', 'owner');
  await addMember(env, shop.id, 'staff@ps.example', 'staff');
  await addMember(env, other.id, 'owner@og.example', 'owner');
  await enquire(shop, 'Pat Prices', 'pat@example.test', 'PS1 1AA');
  owner = await signIn('owner@ps.example');
  staff = await signIn('staff@ps.example');
  rival = await signIn('owner@og.example');
  jobId = (await json<{ jobs: { id: string }[] }>(await api('/jobs', { cookie: owner }))).jobs[0].id;
});

describe('the price book', () => {
  test('lists what the company’s quotes price, with no prices yet', async () => {
    const prices = await book();
    expect(prices.groups.map((g) => g.id)).toEqual(['glass', 'cutouts', 'hinges', 'handles', 'fixing', 'job']);
    expect(prices.prices).toEqual({});
    expect(prices.groups.find((g) => g.id === 'hinges')?.columns?.map((f) => f.id)).toEqual(['chrome', 'brushed-nickel', 'matte-black', 'satin-brass']);
  });

  test('the whole team sees it', async () => {
    expect((await book(staff)).groups).toEqual((await book()).groups);
  });

  test('an owner sets prices, and the record says what each was and became', async () => {
    const response = await change([
      { key: 'glass:10:clear', from: null, to: 12_000 },
      { key: 'cutout:notch', from: null, to: 1_500 },
      { key: 'hinge:gen044:chrome', from: null, to: 4_500 },
      { key: 'fitting', from: null, to: 35_000 },
      { key: 'delivery', from: null, to: null },
    ]);
    expect(response.status).toBe(200);
    const body = await json<{ ok: true; changed: boolean; prices: PriceBody }>(response);
    expect(body.changed).toBe(true);
    const pence = Object.fromEntries(Object.entries(body.prices.prices).map(([k, v]) => [k, v.pence]));
    expect(pence).toEqual({ 'glass:10:clear': 12_000, 'cutout:notch': 1_500, 'hinge:gen044:chrome': 4_500, fitting: 35_000 });

    const { changes } = await read();
    expect(changes?.[0].data.changes).toEqual([
      { field: 'price', key: 'glass:10:clear', label: '10mm clear', unit: 'm2', from: null, to: 12_000 },
      { field: 'price', key: 'cutout:notch', label: 'A notch cut in the glass', unit: 'each', from: null, to: 1_500 },
      { field: 'price', key: 'hinge:gen044:chrome', label: 'Geneva, to the wall, offset back plate, Polished chrome', unit: 'each', from: null, to: 4_500 },
      { field: 'price', key: 'fitting', label: 'Survey and fitting', unit: 'job', from: null, to: 35_000 },
    ]);
  });

  test('the next quote starts from them, with fitting on it now it has a price', async () => {
    const lines = await draft();
    expect(lines.find((l) => l.key === 'glass:10:clear')?.unitPricePence).toBe(12_000);
    expect(lines.find((l) => l.key === 'fitting')?.unitPricePence).toBe(35_000);
  });

  test('fitting and delivery added to a draft by hand start at their prices too', async () => {
    const made = await json<{ id: string }>(await post(`/jobs/${jobId}/quotes`, {}, { cookie: owner }));
    const detail = await json<{ prices?: { fitting: number; delivery: number } }>(await api(`/jobs/${jobId}/quotes/${made.id}`, { cookie: owner }));
    expect(detail.prices).toEqual({ fitting: 35_000, delivery: 0 });
  });

  test('a change made from an older copy is refused whole: no price in it changes', async () => {
    const response = await change([
      { key: 'cutout:hole', from: null, to: 800 },
      { key: 'glass:10:clear', from: null, to: 13_000 },
    ]);
    expect(await errorOf(response)).toEqual([409, 'stale']);
    const after = (await book()).prices;
    expect(after['cutout:hole']).toBeUndefined();
    expect(after['glass:10:clear'].pence).toBe(12_000);
  });

  test('a price taken away is gone, and quotes leave fitting off again', async () => {
    expect((await change([{ key: 'fitting', from: 35_000, to: null }])).status).toBe(200);
    expect((await book()).prices.fitting).toBeUndefined();
    expect((await draft()).some((l) => l.key === 'fitting')).toBe(false);
    expect((await read()).changes?.[0].data.changes).toEqual([{ field: 'price', key: 'fitting', label: 'Survey and fitting', unit: 'job', from: 35_000, to: null }]);
  });

  test('nothing that changed is nothing saved', async () => {
    const before = (await read()).changes?.length;
    const response = await change([{ key: 'glass:10:clear', from: 12_000, to: 12_000 }]);
    expect(await json(response)).toMatchObject({ ok: true, changed: false });
    expect((await read()).changes?.length).toBe(before);
  });

  test.each([
    ['for something the book does not list', [{ key: 'glass:10:ruby', from: null, to: 100 }]],
    ['part of a penny', [{ key: 'cutout:hole', from: null, to: 99.5 }]],
    ['a price of nothing', [{ key: 'cutout:hole', from: null, to: 0 }]],
    ['not a list of prices', 'cheap'],
  ])('a change %s is refused, and nothing changes', async (_, changes) => {
    const before = (await book()).prices;
    expect(await errorOf(await change(changes))).toEqual([400, 'invalid_prices']);
    expect((await book()).prices).toEqual(before);
  });

  test('a staff member cannot change it', async () => {
    expect((await change([{ key: 'cutout:hole', from: null, to: 800 }], staff)).status).toBe(403);
    expect((await book()).prices['cutout:hole']).toBeUndefined();
  });

  test('a quote sent with a price on it keeps that price here, as before', async () => {
    const made = await post(`/jobs/${jobId}/quotes`, {}, { cookie: owner });
    const { id } = await json<{ id: string }>(made);
    const url = `/jobs/${jobId}/quotes/${id}`;
    const { quote } = await json<{ quote: { lines: Line[] } }>(await api(url, { cookie: owner }));
    const lines = quote.lines.map((l) => (l.key === 'cutout:notch' ? { ...l, unitPricePence: 1_750 } : l));
    expect((await api(url, { cookie: owner, method: 'PATCH', body: JSON.stringify({ lines }) })).status).toBe(200);
    const { designs } = await json<{ designs: { id: string }[] }>(await api(`/jobs/${jobId}`, { cookie: owner }));
    expect((await post(`/jobs/${jobId}/designs/${designs[0].id}/check`, { revision: 1 }, { cookie: owner })).status).toBe(200);
    expect((await post(`${url}/send`, {}, { cookie: owner })).status).toBe(200);
    expect((await book()).prices['cutout:notch'].pence).toBe(1_750);
  });
});

describe('another company', () => {
  test('has its own price book, and its owner’s changes stay in it', async () => {
    expect((await book(rival)).prices).toEqual({});
    expect((await change([{ key: 'glass:10:clear', from: null, to: 9_000 }], rival)).status).toBe(200);
    expect((await book(rival)).prices['glass:10:clear'].pence).toBe(9_000);
    expect((await book()).prices['glass:10:clear'].pence).toBe(12_000);
    expect((await shop.db.prices.all()).get('glass:10:clear')).toBe(12_000);
    expect((await other.db.prices.all()).get('glass:10:clear')).toBe(9_000);
  });

  test('cannot change ours from its side', async () => {
    // Its owner's change is to its own book, whatever was seen of ours.
    expect(await errorOf(await change([{ key: 'glass:10:clear', from: 12_000, to: 1 }], rival))).toEqual([409, 'stale']);
    expect((await book()).prices['glass:10:clear'].pence).toBe(12_000);
  });
});
