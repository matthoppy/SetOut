/**
 * Cut size overrides: staff set one pane of one job to be cut with its own
 * deductions, with a reason, in place of the company's rule. The job shows
 * both. Clearing it goes back to the rule. Only the company's own signed-in
 * staff can do either, and the customer never sees any of it.
 */
import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { addMember } from '../src/db/auth';
import { hashResumeToken, newConfirmationToken } from '../src/db/platform';
import type { CutOverrideView } from '../src/lib/cut-overrides';
import { api, company, DESIGNER, json, signIn, type Company } from './helpers';
import { walkInJob } from './walk-in';

interface Detail {
  designs: { id: string; revision: { computed: { panels: { id: string; cutWidthMm: number; cutHeightMm: number; weightKg: number; deductions: { horizontal: { left: number; right: number; total: number }; vertical: { top: number; bottom: number; total: number } } }[]; totalGlassWeightKg: number }; cutOverrides: CutOverrideView[] } }[];
  events: { type: string; data: Record<string, unknown> }[];
}

const REASON = 'No rake measurement supplied by customer';

let shop: Company;
let owner: string;
let rival: string;
let jobId = '';
let designId = '';

const path = (job = jobId, design = designId, pane = 'p1') => `/jobs/${job}/designs/${design}/panes/${pane}/cut-override`;
const put = (body: unknown, cookie: string = owner, at = path()) => api(at, { method: 'PUT', body: JSON.stringify(body), cookie });
const clear = (cookie: string = owner, at = path()) => api(at, { method: 'DELETE', cookie });
const detail = async (job = jobId) => json<Detail>(await api(`/jobs/${job}`, { cookie: owner }));
const said = (html: string) => html.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, '').replace(/nonce="[^"]*"/g, '').replace(/\/confirm\/oc_[a-z0-9]+/g, '');

async function customerPage(c: Company, job: string): Promise<string> {
  const token = newConfirmationToken();
  await c.db.insert('order_confirmations', { job_id: job, link_token_hash: await hashResumeToken(token) });
  const response = await exports.default.fetch(`${DESIGNER}/confirm/${token}`);
  expect(response.status).toBe(200);
  return response.text();
}

beforeAll(async () => {
  shop = await company('Custom Showers', 'CS');
  const other = await company('Rival Glass', 'RG');
  await addMember(env, shop.id, 'owner@cs-cut.example', 'owner');
  await addMember(env, other.id, 'owner@rg-cut.example', 'owner');
  owner = await signIn('owner@cs-cut.example');
  rival = await signIn('owner@rg-cut.example');
  const made = await walkInJob(shop);
  jobId = made.job.id;
  designId = made.designId;
});

describe('the standard rule', () => {
  test('takes 10mm off the width at the wall and 5mm off the height: 390 × 1795 from 400 × 1800', async () => {
    const [panel] = (await detail()).designs[0].revision.computed.panels;
    expect([panel.cutWidthMm, panel.cutHeightMm]).toEqual([390, 1795]);
    expect(panel.deductions.horizontal).toMatchObject({ left: 10, right: 0, total: 10 });
  });
});

describe('an override', () => {
  test('replaces the rule: 8 off the width and 5 off the height gives 392 × 1795, and the job says so', async () => {
    const set = await put({ widthDeductionMm: 8, heightDeductionMm: 5, reason: `  ${REASON} ` });
    expect(set.status).toBe(200);
    expect(await json(set)).toEqual({ ok: true, cutWidthMm: 392, cutHeightMm: 1795 });

    const d = await detail();
    const [panel] = d.designs[0].revision.computed.panels;
    expect([panel.cutWidthMm, panel.cutHeightMm]).toEqual([392, 1795]);
    // On the wall side, where the rule took it.
    expect(panel.deductions.horizontal).toMatchObject({ left: 8, right: 0, total: 8 });
    expect(panel.deductions.vertical).toMatchObject({ top: 0, bottom: 5, total: 5 });
    expect(panel.weightKg).toBe(17.59);
    expect(d.designs[0].revision.computed.totalGlassWeightKg).toBe(17.59);

    const [o] = d.designs[0].revision.cutOverrides;
    expect(o).toMatchObject({
      paneId: 'p1',
      widthDeductionMm: 8,
      heightDeductionMm: 5,
      defaultWidthDeductionMm: 10,
      defaultHeightDeductionMm: 5,
      reason: REASON,
      revisionNumber: 1,
      setBy: { email: 'owner@cs-cut.example' },
    });
    expect(typeof o.setAt).toBe('string');
    expect(d.events.find((e) => e.type === 'cut_override_set')?.data).toMatchObject({ widthDeductionMm: 8, standardWidthDeductionMm: 10, cut: '392 × 1795', reason: REASON });
  });

  test('the stored revision is never changed', async () => {
    const [revision] = await shop.db.find('design_revisions', { where: { design_id: designId } });
    expect(revision.computed.panels[0].cutWidthMm).toBe(390);
  });

  test('setting it again changes the one override', async () => {
    expect((await put({ widthDeductionMm: 7, heightDeductionMm: 4, reason: REASON })).status).toBe(200);
    expect((await detail()).designs[0].revision.cutOverrides).toHaveLength(1);
    expect((await detail()).designs[0].revision.computed.panels[0].cutWidthMm).toBe(393);
    await put({ widthDeductionMm: 8, heightDeductionMm: 5, reason: REASON });
  });

  test('needs a reason', async () => {
    for (const reason of [undefined, '', '   ', 'ab', 42]) {
      const response = await put({ widthDeductionMm: 8, heightDeductionMm: 5, reason });
      expect(response.status).toBe(400);
      expect(await json(response)).toMatchObject({ error: 'reason_needed' });
    }
    expect((await put({ widthDeductionMm: 8, heightDeductionMm: 5, reason: 'x'.repeat(301) })).status).toBe(400);
  });

  test('needs whole millimetres within reason', async () => {
    for (const bad of [-1, 2.5, 201, '8', null]) {
      const response = await put({ widthDeductionMm: bad, heightDeductionMm: 5, reason: REASON });
      expect(response.status).toBe(400);
      expect(await json(response)).toMatchObject({ error: 'invalid_deduction' });
    }
  });

  test('is only for a pane that exists on this job', async () => {
    expect((await put({ widthDeductionMm: 8, heightDeductionMm: 5, reason: REASON }, owner, path(jobId, designId, 'p9'))).status).toBe(404);
    expect((await put({ widthDeductionMm: 8, heightDeductionMm: 5, reason: REASON }, owner, path(jobId, 'dsg_nope'))).status).toBe(404);
  });

  test('only the company’s own signed-in staff can set or clear it', async () => {
    expect((await put({ widthDeductionMm: 1, heightDeductionMm: 1, reason: 'Taken over' }, '')).status).toBe(401);
    expect((await clear('')).status).toBe(401);
    expect((await put({ widthDeductionMm: 1, heightDeductionMm: 1, reason: 'Taken over' }, rival)).status).toBe(404);
    expect((await clear(rival)).status).toBe(404);
    // Not from the public address either.
    const fromDesigner = await api(path(), { method: 'PUT', body: JSON.stringify({ widthDeductionMm: 1, heightDeductionMm: 1, reason: 'Taken over' }), cookie: owner }, DESIGNER);
    expect(fromDesigner.status).toBe(404);
    // Nor from another website.
    const elsewhere = await api(path(), { method: 'PUT', body: JSON.stringify({ widthDeductionMm: 1, heightDeductionMm: 1, reason: 'Taken over' }), cookie: owner, origin: 'https://evil.example' });
    expect(elsewhere.status).toBe(403);
    expect((await detail()).designs[0].revision.cutOverrides[0]).toMatchObject({ widthDeductionMm: 8, reason: REASON });
  });

  test('is never shown to the customer: not the cut size, the deductions, the override or its reason', async () => {
    const html = said(await customerPage(shop, jobId));
    expect(html).toContain('400 × 1800mm');
    for (const leak of ['392', '1795', '390', REASON, 'rake measurement', 'override', 'deduction', 'cut size', 'widthDeduction', 'heightDeduction', 'cutWidth', 'cutHeight']) {
      expect(html.toLowerCase(), `shows ${leak}`).not.toContain(leak.toLowerCase());
    }
  });

  test('the customer’s approximate weight is of the glass as overridden', async () => {
    const other = await walkInJob(shop, 'Wendy Weight', 'WW1 1WW');
    // 100mm off the width: 300 × 1795 of 10mm glass is 13.46kg, about 13.5.
    const response = await put({ widthDeductionMm: 100, heightDeductionMm: 5, reason: 'A deliberately narrow pane' }, owner, path(other.job.id, other.designId));
    expect(response.status).toBe(200);
    const html = said(await customerPage(shop, other.job.id));
    expect(html).toMatch(/Approx\. weight<\/dt><dd>13\.5kg/);
    expect(html).toContain('weighs about 13.5kg');
    expect(html).not.toContain('300 ×');
    expect(html).not.toContain('A deliberately narrow pane');
  });
});

describe('clearing it', () => {
  test('goes back to the rule, and the timeline says so', async () => {
    const cleared = await clear();
    expect(cleared.status).toBe(200);
    const d = await detail();
    const [panel] = d.designs[0].revision.computed.panels;
    expect([panel.cutWidthMm, panel.cutHeightMm]).toEqual([390, 1795]);
    expect(d.designs[0].revision.cutOverrides).toEqual([]);
    expect(d.events.find((e) => e.type === 'cut_override_cleared')?.data).toMatchObject({ paneId: 'p1', cut: '390 × 1795' });
    // Clearing what is not there is fine.
    expect((await clear()).status).toBe(200);
  });
});
