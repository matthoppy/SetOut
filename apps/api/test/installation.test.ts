/**
 * Installation sheets for a customer's own fitter: approved by staff only once
 * every shower is checked, sent only if nothing has changed since, frozen once
 * sent, and read by the customer with their own link on the public address.
 */
import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { addMember } from '../src/db/auth';
import { api, APP, company, DESIGNER, enquire, json, post, signIn, type Company } from './helpers';

interface Sheet {
  id: string;
  covers: { designId: string; revisionId: string; number: number }[];
  address: string | null;
  postcode: string | null;
  notes: string | null;
  approved_at: string;
  sent_at: string | null;
  link_token_hash?: string;
}
interface Status {
  sheet: Sheet | null;
  changed: { error: string } | null;
  blocker: { error: string } | null;
  customerEmail: string | null;
}
interface JobBody {
  designs: { id: string; revision: { number: number; document: { design: Record<string, unknown> } } }[];
  events: { type: string; data: Record<string, unknown> }[];
}

let shop: Company;
let owner: string;
let rival: string;
let jobId = '';
let designId = '';
let link = '';

const status = async (cookie = owner) => json<Status>(await api(`/jobs/${jobId}/installation-sheet`, { cookie }));
const approve = (cookie = owner) => post(`/jobs/${jobId}/installation-sheet/approve`, {}, { cookie });
const send = (sheetId: string, cookie = owner) => post(`/jobs/${jobId}/installation-sheet/${sheetId}/send`, {}, { cookie });
const job = async () => json<JobBody>(await api(`/jobs/${jobId}`, { cookie: owner }));
const customer = (token: string, host = DESIGNER) => exports.default.fetch(`${host}/api/installation/${token}`);
const tokenOf = (url: string) => url.slice(url.lastIndexOf('/') + 1);
const errorOf = async (response: Response) => (await json<{ error: string }>(response)).error;

beforeAll(async () => {
  shop = await company('Sheet Showers', 'SS');
  const other = await company('Other Glass', 'OX');
  await addMember(env, shop.id, 'owner@ss.example', 'owner');
  await addMember(env, other.id, 'owner@ox.example', 'owner');
  owner = await signIn('owner@ss.example');
  rival = await signIn('owner@ox.example');
  await enquire(shop, 'Sam Supply', 'sam@example.test', 'SS1 1AA');
  const { jobs } = await json<{ jobs: { id: string }[] }>(await api('/jobs', { cookie: owner }));
  jobId = jobs[0].id;
  designId = (await job()).designs[0].id;
});

describe('approving a sheet', () => {
  test('nothing is approved until the shower is checked', async () => {
    const before = await status();
    expect(before.sheet).toBeNull();
    expect(before.blocker?.error).toBe('not_checked');
    expect(before.customerEmail).toBe('sam@example.test');
    const refused = await approve();
    expect(refused.status).toBe(409);
    expect(await errorOf(refused)).toBe('not_checked');
  });

  test('once checked, approving records the revision and the details as they read', async () => {
    expect((await post(`/jobs/${jobId}/designs/${designId}/check`, { revision: 1 }, { cookie: owner })).status).toBe(200);
    const notes = 'Customer’s own fitter. Tray already in.';
    expect((await api(`/jobs/${jobId}/installation`, { cookie: owner, method: 'PATCH', body: JSON.stringify({ notes }) })).status).toBe(200);

    const made = await approve();
    expect(made.status).toBe(201);
    const { sheet } = await json<{ sheet: Sheet }>(made);
    expect(sheet.covers).toEqual([{ designId, revisionId: expect.any(String), number: 1 }]);
    expect(sheet).toMatchObject({ notes, postcode: 'SS1 1AA', sent_at: null });
    expect(sheet.link_token_hash).toBeUndefined();
    const now = await status();
    expect(now.sheet?.id).toBe(sheet.id);
    expect(now.changed).toBeNull();
    expect((await job()).events.some((e) => e.type === 'installation_sheet_approved')).toBe(true);
  });

  test('another company cannot see, approve or send it', async () => {
    expect((await api(`/jobs/${jobId}/installation-sheet`, { cookie: rival })).status).toBe(404);
    expect((await approve(rival)).status).toBe(404);
    const { sheet } = await status();
    expect((await send(sheet!.id, rival)).status).toBe(404);
  });
});

describe('sending a sheet', () => {
  test('a change to the comments after approving stops it being sent until it is approved again', async () => {
    const { sheet: first } = await status();
    expect(
      (await api(`/jobs/${jobId}/installation`, { cookie: owner, method: 'PATCH', body: JSON.stringify({ notes: 'Changed after approving.' }) })).status
    ).toBe(200);
    expect((await status()).changed?.error).toBe('stale');
    const refused = await send(first!.id);
    expect(refused.status).toBe(409);
    expect(await errorOf(refused)).toBe('stale');

    // Approving again replaces the approval that was never sent.
    const { sheet: second } = await json<{ sheet: Sheet }>(await approve());
    expect(second.notes).toBe('Changed after approving.');
    const rows = await env.DB.prepare('SELECT id FROM installation_sheets WHERE company_id = ?').bind(shop.id).all();
    expect(rows.results.map((r) => r.id)).toEqual([second.id]);
    expect((await send(first!.id)).status).toBe(404);
  });

  test('a shower changed after approving stops it being sent', async () => {
    const { designs } = await job();
    const document = { ...designs[0].revision, design: { ...designs[0].revision.document.design, heightMm: 1950 } };
    const revised = await post(
      `/jobs/${jobId}/designs/${designId}/revisions`,
      { basedOn: 1, document: { ...designs[0].revision.document, design: document.design }, reason: 'Lower tray' },
      { cookie: owner }
    );
    expect(revised.status).toBe(201);
    const { sheet } = await status();
    // Not checked yet at its new revision: stale, and cannot be approved either.
    expect((await status()).changed?.error).toBe('stale');
    expect((await status()).blocker?.error).toBe('not_checked');
    expect(await errorOf(await send(sheet!.id))).toBe('stale');
    expect((await post(`/jobs/${jobId}/designs/${designId}/check`, { revision: 2 }, { cookie: owner })).status).toBe(200);
    expect(await errorOf(await send(sheet!.id))).toBe('stale');
  });

  test('sent: the customer gets a link on the public address, and it cannot be sent twice', async () => {
    const { sheet } = await json<{ sheet: Sheet }>(await approve());
    expect(sheet.covers[0].number).toBe(2);
    const sent = await send(sheet.id);
    expect(sent.status).toBe(200);
    const body = await json<{ link: string; sheet: Sheet }>(sent);
    link = body.link;
    expect(link).toMatch(/^https:\/\/designer\.test\/i\/is_[a-z0-9]{32}$/);
    expect(body.sheet.sent_at).toEqual(expect.any(String));
    expect(await errorOf(await send(sheet.id))).toBe('already_sent');
    const { events } = await job();
    expect(events.find((e) => e.type === 'installation_sheet_sent')?.data).toMatchObject({ sheetId: sheet.id, to: 'sam@example.test' });
  });

  test('the database refuses to change a sent sheet, or what any sheet approved', async () => {
    const { sheet } = await status();
    const refused = async (sql: string) => {
      try {
        await env.DB.prepare(sql).bind(shop.id, sheet!.id).run();
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };
    expect(await refused(`UPDATE installation_sheets SET notes = 'tampered' WHERE company_id = ? AND id = ?`)).toMatch(/never (edited|changed)/);
    expect(await refused(`UPDATE installation_sheets SET sent_by = 'someone' WHERE company_id = ? AND id = ?`)).toMatch(/never changed/);
  });

  test('approving again after sending keeps the sent one on record', async () => {
    const { sheet } = await json<{ sheet: Sheet }>(await approve());
    const rows = await env.DB.prepare('SELECT id, sent_at FROM installation_sheets WHERE company_id = ? ORDER BY created_at').bind(shop.id).all();
    expect(rows.results).toHaveLength(2);
    expect(rows.results[1].id).toBe(sheet.id);
    expect(rows.results[0].sent_at).not.toBeNull();
    // Not sent yet, but what it approved is still never edited.
    const edit = env.DB.prepare(`UPDATE installation_sheets SET notes = 'tampered' WHERE company_id = ? AND id = ?`).bind(shop.id, sheet.id).run();
    await expect(edit).rejects.toThrow(/never edited/);
  });
});

describe('the customer’s link', () => {
  test('opens the sheet as it was approved, with the shower at that revision', async () => {
    const response = await customer(tokenOf(link));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    const body = await json<{
      company: { name: string };
      customerName: string;
      notes: string;
      showers: { title: string; revision: number; spec: { panels: unknown[] }; design: { heightMm: number } }[];
    }>(response);
    expect(body).toMatchObject({ company: { name: 'Sheet Showers' }, customerName: 'Sam Supply', notes: 'Changed after approving.' });
    expect(body.showers).toHaveLength(1);
    expect(body.showers[0]).toMatchObject({ title: 'Panel and door', revision: 2, design: { heightMm: 1950 } });
    expect(body.showers[0].spec.panels.length).toBeGreaterThan(0);
  });

  test('answers only on the public address, and only to a real link', async () => {
    expect((await customer(tokenOf(link), APP)).status).toBe(404);
    expect((await customer('is_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).status).toBe(404);
    expect((await customer('not-a-link')).status).toBe(404);
  });

  test('an approval never sent has no link that opens it', async () => {
    const unsent = await env.DB.prepare(
      'SELECT link_token_hash FROM installation_sheets WHERE company_id = ? AND sent_at IS NULL'
    )
      .bind(shop.id)
      .first<{ link_token_hash: string | null }>();
    expect(unsent?.link_token_hash).toBeNull();
  });
});
