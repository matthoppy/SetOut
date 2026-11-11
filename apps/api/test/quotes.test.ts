/**
 * Quotes: written from the showers, sent only once they are checked, frozen
 * once sent, and accepted by the customer with their own link on the public
 * address. Every step that can be tried from another company's side is.
 */
import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { addMember } from '../src/db/auth';
import { hashResumeToken } from '../src/db/platform';
import { api, APP, company, DESIGNER, enquire, json, post, signIn, type Company } from './helpers';

interface Line {
  key: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPricePence: number;
  totalPence?: number;
}
interface QuoteBody {
  quote: { id: string; number: number; status: string; lines: Line[]; subtotal_pence: number; vat_pence: number; total_pence: number; note: string | null; valid_days: number };
  blocker: { error: string; message: string } | null;
}
interface JobBody {
  job: { id: string; stage: string };
  designs: { id: string; revision: { number: number; document: { format: number; design: Record<string, unknown> } } }[];
  events: { type: string; data: Record<string, unknown> }[];
  quotes: { id: string; number: number; status: string; totalPence: number }[];
}

let shop: Company;
let owner: string;
let rival: string;
let jobId = '';
let designId = '';
let link = '';

const quoteUrl = (quoteId: string) => `/jobs/${jobId}/quotes/${quoteId}`;
const getQuote = async (quoteId: string, cookie = owner) => json<QuoteBody>(await api(quoteUrl(quoteId), { cookie }));
const job = async () => json<JobBody>(await api(`/jobs/${jobId}`, { cookie: owner }));
const priced = (lines: Line[]) =>
  lines.map((l) => ({ ...l, unitPricePence: l.unit === 'm2' ? 12_000 : l.unit === 'm' ? 2_500 : 4_000 }));
const customer = (path: string, init: RequestInit = {}, host = DESIGNER) =>
  exports.default.fetch(`${host}/api/quote/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.method === 'POST' ? { Origin: host } : {}) },
  });
const tokenOf = (url: string) => url.slice(url.lastIndexOf('/') + 1);

beforeAll(async () => {
  shop = await company('Quote Showers', 'QS');
  const other = await company('Other Glass', 'OG');
  await addMember(env, shop.id, 'owner@qs.example', 'owner');
  await addMember(env, other.id, 'owner@og.example', 'owner');
  owner = await signIn('owner@qs.example');
  rival = await signIn('owner@og.example');
  await enquire(shop, 'Quinn Customer', 'quinn@example.test', 'QS1 1AA');
  const { jobs } = await json<{ jobs: { id: string }[] }>(await api('/jobs', { cookie: owner }));
  jobId = jobs[0].id;
  designId = (await job()).designs[0].id;
});

describe('writing a quote', () => {
  let draftId = '';

  test('a new quote is filled in from the shower, with nothing priced yet', async () => {
    const made = await post(`/jobs/${jobId}/quotes`, {}, { cookie: owner });
    expect(made.status).toBe(201);
    const { id, number } = await json<{ id: string; number: number }>(made);
    draftId = id;
    expect(number).toBe(1);

    const { quote, blocker } = await getQuote(id);
    expect(quote.status).toBe('draft');
    const units = quote.lines.map((l) => l.unit);
    expect(units.filter((u) => u === 'm2')).toHaveLength(2);
    expect(quote.lines.find((l) => l.key?.startsWith('hinge:'))?.quantity).toBeGreaterThanOrEqual(2);
    expect(quote.lines.some((l) => l.key?.startsWith('handle:'))).toBe(true);
    expect(quote.lines.some((l) => l.key?.startsWith('channel:') || l.key?.startsWith('clamps:'))).toBe(true);
    expect(quote.lines.find((l) => l.unit === 'm2')?.key).toBe('glass:10:clear');
    expect(quote.lines.every((l) => l.unitPricePence === 0)).toBe(true);
    // Nobody here has priced fitting before, so it is not assumed.
    expect(quote.lines.some((l) => l.key === 'fitting')).toBe(false);
    expect(blocker?.error).toBe('not_checked');
    expect((await job()).quotes.map((q) => [q.number, q.status])).toEqual([[1, 'draft']]);
  });

  test('a draft can be changed, and what it comes to is worked out here', async () => {
    const { quote } = await getQuote(draftId);
    const lines = [
      ...priced(quote.lines).map((l) => ({ ...l, totalPence: 1 })),
      { key: 'fitting', description: 'Survey and fitting', quantity: 1, unit: 'job', unitPricePence: 35_000 },
    ];
    const changed = await api(quoteUrl(draftId), {
      cookie: owner,
      method: 'PATCH',
      body: JSON.stringify({ lines, note: ' Includes removal of the old screen. ', validDays: 14, subtotal_pence: 1 }),
    });
    expect(changed.status).toBe(200);
    const after = (await getQuote(draftId)).quote;
    const subtotal = after.lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unitPricePence), 0);
    expect(after.subtotal_pence).toBe(subtotal);
    expect(after.vat_pence).toBe(Math.round(subtotal * 0.2));
    expect(after.total_pence).toBe(subtotal + Math.round(subtotal * 0.2));
    expect(after.lines.every((l) => l.totalPence === Math.round(l.quantity * l.unitPricePence))).toBe(true);
    expect(after).toMatchObject({ note: 'Includes removal of the old screen.', valid_days: 14 });

    const refused = async (body: unknown) => (await api(quoteUrl(draftId), { cookie: owner, method: 'PATCH', body: JSON.stringify(body) })).status;
    expect(await refused({ lines: [{ description: '', quantity: 1, unit: 'each', unitPricePence: 1 }] })).toBe(400);
    expect(await refused({ lines: [{ description: 'Thing', quantity: 0, unit: 'each', unitPricePence: 1 }] })).toBe(400);
    expect(await refused({ lines: [{ description: 'Thing', quantity: 1, unit: 'tonne', unitPricePence: 1 }] })).toBe(400);
    expect(await refused({ lines: [{ description: 'Thing', quantity: 1, unit: 'each', unitPricePence: 1.5 }] })).toBe(400);
    expect(await refused({ vatRateBp: 20.5 })).toBe(400);
    expect(await refused({ validDays: 0 })).toBe(400);
  });

  test('a quote is sent only once its shower is checked, and then it is frozen', async () => {
    const early = await post(`${quoteUrl(draftId)}/send`, {}, { cookie: owner });
    expect(early.status).toBe(409);
    expect((await json<{ error: string }>(early)).error).toBe('not_checked');

    expect((await post(`/jobs/${jobId}/designs/${designId}/check`, { revision: 1 }, { cookie: owner })).status).toBe(200);
    const sent = await post(`${quoteUrl(draftId)}/send`, {}, { cookie: owner });
    expect(sent.status).toBe(200);
    const body = await json<{ link: string; emailed: boolean; quote: { status: string; valid_until: string } }>(sent);
    expect(body.link).toMatch(/\/q\/qt_[a-z0-9]{32}$/);
    expect(body.link.startsWith(DESIGNER)).toBe(true);
    expect(body.emailed).toBe(false);
    expect(body.quote.status).toBe('sent');
    link = body.link;

    const after = await job();
    expect(after.job.stage).toBe('quoted');
    expect(after.events.map((e) => e.type)).toEqual(expect.arrayContaining(['quote_sent', 'email_not_sent']));
    // The prices sent are the ones the next quote starts from.
    expect((await shop.db.prices.all()).get('glass:10:clear')).toBe(12_000);
    expect((await shop.db.prices.all()).get('fitting')).toBe(35_000);

    expect((await api(quoteUrl(draftId), { cookie: owner, method: 'PATCH', body: JSON.stringify({ note: 'Later' }) })).status).toBe(409);
    expect((await api(quoteUrl(draftId), { cookie: owner, method: 'DELETE' })).status).toBe(409);
    expect((await post(`${quoteUrl(draftId)}/send`, {}, { cookie: owner })).status).toBe(409);
    // Whatever the code above it does, the database will not change a sent quote.
    await expect(shop.db.update('quotes', draftId, { note: 'Changed afterwards' })).rejects.toThrow(/never edited/);
  });

  test('the next quote starts from the prices sent before', async () => {
    const made = await json<{ id: string; number: number }>(await post(`/jobs/${jobId}/quotes`, {}, { cookie: owner }));
    expect(made.number).toBe(2);
    const { quote, blocker } = await getQuote(made.id);
    expect(quote.lines.find((l) => l.key === 'glass:10:clear')?.unitPricePence).toBe(12_000);
    expect(quote.lines.find((l) => l.key === 'fitting')?.unitPricePence).toBe(35_000);
    expect(blocker).toBeNull();
    expect((await api(quoteUrl(made.id), { cookie: owner, method: 'DELETE' })).status).toBe(200);
    expect((await job()).quotes.map((q) => q.number)).toEqual([1]);
  });

  test('another company can neither see nor change our quotes', async () => {
    expect((await api(quoteUrl(draftId), { cookie: rival })).status).toBe(404);
    expect((await api(quoteUrl(draftId), { cookie: rival, method: 'PATCH', body: JSON.stringify({ note: 'x' }) })).status).toBe(404);
    expect((await post(`/jobs/${jobId}/quotes`, {}, { cookie: rival })).status).toBe(404);
    expect((await post(`${quoteUrl(draftId)}/withdraw`, {}, { cookie: rival })).status).toBe(404);
  });
});

describe('the customer’s quote', () => {
  test('is read with its link, on the public address only', async () => {
    const response = await customer(tokenOf(link));
    expect(response.status).toBe(200);
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await json<{ company: { name: string }; reference: string; status: string; totalPence: number; lines: Line[]; note: string }>(response);
    expect(body).toMatchObject({ company: { name: 'Quote Showers' }, status: 'sent', note: 'Includes removal of the old screen.' });
    expect(body.reference).toMatch(/^QS-/);
    expect(body.lines.length).toBeGreaterThan(3);
    expect(JSON.stringify(body)).not.toContain('link_token_hash');

    expect((await customer(tokenOf(link), {}, APP)).status).toBe(404);
    expect((await customer('qt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).status).toBe(404);
    expect((await customer('not-a-token')).status).toBe(404);
  });

  test('is accepted with a name and a tick, and the job moves to Ordered', async () => {
    const accept = (body: unknown, init: RequestInit = {}) =>
      customer(`${tokenOf(link)}/accept`, { method: 'POST', body: JSON.stringify(body), ...init });
    expect((await accept({ name: '', agreed: true })).status).toBe(400);
    expect((await accept({ name: 'Quinn Customer', agreed: false })).status).toBe(400);
    const foreign = await exports.default.fetch(`${DESIGNER}/api/quote/${tokenOf(link)}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ name: 'Quinn Customer', agreed: true }),
    });
    expect(foreign.status).toBe(403);

    expect((await accept({ name: '  Quinn   Customer ', agreed: true })).status).toBe(200);
    const after = await job();
    expect(after.job.stage).toBe('ordered');
    expect(after.events.find((e) => e.type === 'quote_accepted')?.data).toMatchObject({ number: 1, name: 'Quinn Customer' });
    expect(after.quotes[0]).toMatchObject({ status: 'accepted' });
    // Accepting again changes nothing.
    expect((await accept({ name: 'Quinn Customer', agreed: true })).status).toBe(200);
    expect((await job()).events.filter((e) => e.type === 'quote_accepted')).toHaveLength(1);
    // Nor can staff withdraw it once it is accepted.
    const quoteId = after.quotes[0].id;
    expect((await post(`${quoteUrl(quoteId)}/withdraw`, {}, { cookie: owner })).status).toBe(409);
  });

  test('a withdrawn quote cannot be accepted', async () => {
    const made = await json<{ id: string }>(await post(`/jobs/${jobId}/quotes`, {}, { cookie: owner }));
    const sent = await json<{ link: string }>(await post(`${quoteUrl(made.id)}/send`, {}, { cookie: owner }));
    expect((await post(`${quoteUrl(made.id)}/withdraw`, {}, { cookie: owner })).status).toBe(200);
    const read = await json<{ status: string }>(await customer(tokenOf(sent.link)));
    expect(read.status).toBe('withdrawn');
    const refused = await customer(`${tokenOf(sent.link)}/accept`, { method: 'POST', body: JSON.stringify({ name: 'Quinn Customer', agreed: true }) });
    expect(refused.status).toBe(409);
    expect((await json<{ error: string }>(refused)).error).toBe('withdrawn');
  });

  test('a quote that has run out cannot be accepted', async () => {
    const token = 'qt_expiredexpiredexpiredexpired2222';
    await shop.db.insert('quotes', {
      job_id: jobId,
      number: 90,
      status: 'sent',
      lines: [{ key: null, description: 'Old price', quantity: 1, unit: 'job', unitPricePence: 100 }],
      subtotal_pence: 100,
      total_pence: 100,
      valid_until: '2020-01-01T00:00:00.000Z',
      link_token_hash: await hashResumeToken(token),
    });
    expect((await json<{ expired: boolean }>(await customer(token))).expired).toBe(true);
    const refused = await customer(`${token}/accept`, { method: 'POST', body: JSON.stringify({ name: 'Quinn Customer', agreed: true }) });
    expect(refused.status).toBe(409);
    expect((await json<{ error: string }>(refused)).error).toBe('expired');
  });

  test('a shower changed after a quote was written stops that quote being sent', async () => {
    const made = await json<{ id: string }>(await post(`/jobs/${jobId}/quotes`, {}, { cookie: owner }));
    const { designs } = await job();
    const document = { ...designs[0].revision.document, design: { ...designs[0].revision.document.design, heightMm: 1950 } };
    expect((await post(`/jobs/${jobId}/designs/${designId}/revisions`, { basedOn: 1, document, reason: 'Lower tray' }, { cookie: owner })).status).toBe(201);
    expect((await post(`/jobs/${jobId}/designs/${designId}/check`, { revision: 2 }, { cookie: owner })).status).toBe(200);
    expect((await getQuote(made.id)).blocker?.error).toBe('stale');
    const refused = await post(`${quoteUrl(made.id)}/send`, {}, { cookie: owner });
    expect(refused.status).toBe(409);
    expect((await json<{ error: string }>(refused)).error).toBe('stale');
  });
});
