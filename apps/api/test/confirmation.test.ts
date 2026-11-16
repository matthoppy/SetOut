/**
 * A customer confirming their order with their own link, on the public
 * address: what the page shows and never shows, the answers it accepts, the
 * job event it writes, the thank-you on reopening, and the workshop's email.
 */
import type { ConfiguratorSpec } from '@setout/engine';
import { env, exports } from 'cloudflare:workers';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { addMember } from '../src/db/auth';
import { hashResumeToken, newConfirmationToken, resolveConfirmationLink } from '../src/db/platform';
import { extrasOf, readAnswers } from '../src/lib/order-confirmation';
import { DEFAULT_TERMS, TERMS_CHECKBOX, termsFor, termsVersion } from '../src/lib/terms-of-sale';
import { APP, callWith, company, DESIGNER, json, post, signIn, type Company } from './helpers';
import { walkInJob } from './walk-in';

let shop: Company;
let jobId = '';
let spec: ConfiguratorSpec;

async function linkFor(c: Company, job: string): Promise<string> {
  const token = newConfirmationToken();
  await c.db.insert('order_confirmations', { job_id: job, link_token_hash: await hashResumeToken(token) });
  return token;
}

const page = (token: string, host = DESIGNER) => exports.default.fetch(`${host}/confirm/${token}`);

const FULL: Record<string, string> = {
  addr_line1: ' 12  Holly Lane ',
  addr_line2: '',
  addr_town: 'St Albans',
  addr_postcode: 'al35qn',
  can_unload: 'yes',
  unload_note: 'Drive is steep.',
  silicone_clear: '1',
  silicone_translucent: '0',
  silicone_white: '2',
  details_confirmed: 'yes',
  measurements_accepted: 'yes',
  terms_accepted: 'yes',
  signed_name: '  Oliver   Milton ',
  comments: '',
};

const submit = (token: string, form: Record<string, string>, origin: string | null = DESIGNER) =>
  exports.default.fetch(`${DESIGNER}/confirm/${token}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(origin ? { Origin: origin } : {}) },
    body: new URLSearchParams(form).toString(),
  });

const events = async (type: string) => shop.db.find('job_events', { where: { job_id: jobId, type } });

/** The page with its inline logo, its one-time nonce and its own random link taken out, so a number found is one the page says. */
const said = (html: string) => html.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, '').replace(/nonce="[^"]*"/g, '').replace(/\/confirm\/oc_[a-z0-9]+/g, '');

beforeAll(async () => {
  shop = await company('Custom Showers', 'CS');
  const made = await walkInJob(shop);
  jobId = made.job.id;
  spec = made.computed;
});

afterEach(() => vi.unstubAllGlobals());

describe('the link', () => {
  test('only a well-formed, known link opens anything', async () => {
    expect(await resolveConfirmationLink(env, 'not a token')).toBeNull();
    expect(await resolveConfirmationLink(env, `oc_${'a'.repeat(32)}`)).toBeNull();
    expect(await resolveConfirmationLink(env, `qt_${'a'.repeat(32)}`)).toBeNull();
    const token = await linkFor(shop, jobId);
    expect(await resolveConfirmationLink(env, token)).toMatchObject({ companyId: shop.id });
    expect((await page(`oc_${'b'.repeat(32)}`)).status).toBe(404);
    expect((await page('rubbish')).status).toBe(404);
  });

  test('is only stored as its hash', async () => {
    const token = await linkFor(shop, jobId);
    const rows = await shop.db.find('order_confirmations', { where: { job_id: jobId } });
    expect(rows.some((r) => r.link_token_hash === token)).toBe(false);
    expect(rows.some(async (r) => r.link_token_hash === (await hashResumeToken(token)))).toBe(true);
  });

  test('is never served where staff sign in', async () => {
    const token = await linkFor(shop, jobId);
    expect((await page(token, APP)).status).toBe(404);
  });

  test('a suspended company’s links open nothing', async () => {
    const gone = await company('Gone Glass', 'GG');
    const { job } = await walkInJob(gone);
    const token = await linkFor(gone, job.id);
    await env.DB.prepare("UPDATE companies SET status = 'suspended' WHERE id = ?").bind(gone.id).run();
    expect((await page(token)).status).toBe(404);
  });
});

describe('the page', () => {
  test('shows first name, postcode and the measured size, from the job', async () => {
    const response = await page(await linkFor(shop, jobId));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('same-origin');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    const html = await response.text();
    expect(html).toContain('Hi Oliver,');
    expect(html).not.toContain('Milton');
    expect(html).not.toContain('oliver@example.test');
    expect(html).not.toContain('07000');
    expect(html).toContain('AL3 5QN');
    expect(html).toContain('400 × 1800mm');
    expect(html).toContain('1 fixed walk-in panel (no door)');
    expect(html).toContain('500mm (900mm overall opening)');
    expect(html).toContain('10mm toughened, low-iron (extra clear)');
    expect(html).toContain('U-channel on the floor and up the wall');
    expect(html).toContain('Matte black');
    // A fixed panel has no handle, and the page says nothing about one (Matt, 16 November 2026).
    expect(html).not.toMatch(/handle/i);
    expect(html).toContain('data-part="wall-channel"');
    expect(html).toContain('data-part="floor-channel"');
    expect(html).toContain("They're added to your total when you pay.");
    expect(html).toMatch(/<button type="button" class="paybtn" disabled[^>]*>.*Pay securely<\/button>/s);
  });

  test('asks for the delivery address in section 3, with the job’s postcode filled in', async () => {
    const html = await (await page(await linkFor(shop, jobId))).text();
    const sections = [...html.matchAll(/<h2><span class="n">(\d)<\/span>([^<]+)/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(sections).toEqual(['1 Your glass', '2 Drawing', '3 Delivery', '4 Optional extras', '5 Payment', '6 Terms of sale', '7 Confirm']);
    const delivery = html.slice(html.indexOf('3</span>Delivery'), html.indexOf('4</span>Optional extras'));
    for (const name of ['addr_line1', 'addr_line2', 'addr_town', 'addr_postcode']) expect(delivery).toContain(`name="${name}"`);
    expect(delivery).toMatch(/name="addr_postcode"[^>]*value="AL3 5QN"/);
    expect(delivery).toContain('Delivery / site address');
  });

  test('sells silicone by the tube in three colours, and the tool as a tick box, with their prices', async () => {
    const html = await (await page(await linkFor(shop, jobId))).text();
    for (const c of ['clear', 'translucent', 'white']) expect(html).toMatch(new RegExp(`type="number"[^>]*name="silicone_${c}" min="0" max="10" step="1" value="0"`));
    expect(html).toContain('£8.50 per tube');
    expect(html).toContain("One tube of clear or translucent is enough to seal the glass into the channel. Add a white tube if you'd also like to seal where the channel meets the tiles.");
    expect(html).toMatch(/<input type="checkbox" name="silicone_tool" value="yes">.*Silicone finishing tool.*£4\.95/s);
    expect(html).not.toMatch(/name="silicone"|silicone_colour|Black/);
    expect(html).toContain('Extras: £0.00');
  });

  test('shows the terms of sale word for word, and a third box to agree to them', async () => {
    const html = await (await page(await linkFor(shop, jobId))).text();
    const terms = html.slice(html.indexOf('6</span>Terms of sale'), html.indexOf('7</span>Confirm'));
    const unescape = (t: string) => t.replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    const items = [...terms.matchAll(/<li><strong>([^<]+)<\/strong> ([^<]+)<\/li>/g)].map((m) => ({ title: unescape(m[1]), text: unescape(m[2]) }));
    expect(items).toEqual([...DEFAULT_TERMS]);
    expect(unescape(html)).toContain(`name="terms_accepted" value="yes"><span>${TERMS_CHECKBOX}</span>`);
    expect(html).toContain('Please read and tick all three boxes.');
  });

  test('says delivery is kerbside to the address in section 3 next to the price', async () => {
    const made = await walkInJob(shop);
    await shop.db.insert('quotes', {
      job_id: made.job.id,
      number: 1,
      status: 'sent',
      lines: [{ key: 'package', description: 'Shower panel package', quantity: 1, unit: 'job', unitPricePence: 44_900 }],
      vat_rate_bp: 0,
      subtotal_pence: 44_900,
      vat_pence: 0,
      total_pence: 44_900,
    });
    const html = await (await callWith({ JOB_PAYMENTS_COMPANY: shop.id, JOB_STRIPE_SECRET_KEY: 'sk_test_abc123' }, `/confirm/${await linkFor(shop, made.job.id)}`, {}, DESIGNER)).text();
    expect(html).toContain('Total: £449.00');
    expect(html).toContain('plus any extras you choose in section 4. Delivered kerbside to the address in section 3.');
  });

  test('never shows the cut size or the deductions, in the page, its drawings or their labels', async () => {
    const html = said(await (await page(await linkFor(shop, jobId))).text());
    const panel = spec.panels[0];
    // The workshop's numbers exist on the job, and differ from what was measured.
    expect([panel.cutWidthMm, panel.cutHeightMm]).not.toEqual([400, 1800]);
    for (const n of [panel.cutWidthMm, panel.cutHeightMm, ...(spec.channelCuts ?? []).map((c) => c.lengthMm).filter((n) => n !== 400 && n !== 1800), 392, 1795]) {
      expect(html, `shows ${n}`).not.toContain(String(n));
    }
    expect(html).not.toMatch(/cut size|deduction|cutWidth|cutHeight|tight/i);
    expect(html).toMatch(/Approx\. weight<\/dt><dd>\d+(\.5)?kg/);
  });

  test('has no phone number or call wording', async () => {
    const html = said(await (await page(await linkFor(shop, jobId))).text());
    expect(html).not.toMatch(/\bcall\b|\bphone\b|tel:|\b0\d{3,4}\s?\d{3}\s?\d{3,4}\b/i);
    expect(html).toContain('mailto:sales@customshowers.uk');
  });
});

describe('the answers', () => {
  test('are checked in the page’s order, with the page’s words', () => {
    const tries: [Record<string, string>, string][] = [
      [{ ...FULL, addr_line1: '' }, 'Please enter the full delivery address (section 3).'],
      [{ ...FULL, addr_town: ' ' }, 'Please enter the full delivery address (section 3).'],
      [{ ...FULL, addr_postcode: '' }, 'Please enter the full delivery address (section 3).'],
      [{ ...FULL, addr_postcode: 'NOT A CODE' }, 'Please check the postcode of the delivery address (section 3).'],
      [{ ...FULL, addr_line2: 'x'.repeat(121) }, 'Please keep each line of the delivery address to 120 characters (section 3).'],
      [{ ...FULL, can_unload: '' }, 'Please tell us if someone can help take the glass off the van (section 3).'],
      [{ ...FULL, can_unload: 'maybe' }, 'Please tell us if someone can help take the glass off the van (section 3).'],
      [{ ...FULL, silicone_clear: '11' }, 'Please choose between 0 and 10 tubes of each silicone colour (section 4).'],
      [{ ...FULL, silicone_white: '-1' }, 'Please choose between 0 and 10 tubes of each silicone colour (section 4).'],
      [{ ...FULL, silicone_translucent: '1.5' }, 'Please choose between 0 and 10 tubes of each silicone colour (section 4).'],
      [{ ...FULL, silicone_clear: 'two' }, 'Please choose between 0 and 10 tubes of each silicone colour (section 4).'],
      [{ ...FULL, details_confirmed: '' }, 'Please tick all three confirmation boxes.'],
      [{ ...FULL, measurements_accepted: '' }, 'Please tick all three confirmation boxes.'],
      [{ ...FULL, terms_accepted: '' }, 'Please tick all three confirmation boxes.'],
      [{ ...FULL, terms_accepted: 'no' }, 'Please tick all three confirmation boxes.'],
      [{ ...FULL, signed_name: ' O ' }, 'Please type your full name.'],
      [{ ...FULL, signed_name: 'x'.repeat(121) }, 'Please keep your name to 120 characters.'],
      [{ ...FULL, unload_note: 'x'.repeat(1001) }, 'Please keep the delivery note to 1000 characters (section 3).'],
      [{ ...FULL, comments: 'x'.repeat(2001) }, 'Please keep your comments to 2000 characters.'],
      [{ ...FULL, can_unload: '', silicone_clear: '99' }, 'Please tell us if someone can help take the glass off the van (section 3).'],
    ];
    for (const [form, error] of tries) expect(readAnswers('CS-1', form, { version: 'v' })).toEqual({ error });
  });

  test('tidy the address, count the tubes, and record the terms with the server’s time', () => {
    const at = new Date('2026-11-16T19:00:00.000Z');
    const read = readAnswers('CS-1', { ...FULL, silicone_translucent: '', silicone_tool: 'yes' }, { version: 'sha256:abc' }, at);
    expect('answers' in read && read.answers).toMatchObject({
      delivery_address: { line1: '12 Holly Lane', line2: '', town: 'St Albans', postcode: 'AL3 5QN' },
      silicone_tubes: { clear: 1, translucent: 0, white: 2 },
      silicone_tool: 'yes',
      terms_accepted: true,
      terms_version: 'sha256:abc',
      terms_accepted_at: '2026-11-16T19:00:00.000Z',
    });
    // An unticked tool box sends nothing at all.
    const none = readAnswers('CS-1', { ...FULL, silicone_clear: '0', silicone_white: '0' }, { version: 'v' });
    expect('answers' in none && [none.answers.silicone_tubes, none.answers.silicone_tool]).toEqual([{ clear: 0, translucent: 0, white: 0 }, 'no']);
  });

  test('extras are one line per colour ordered, at 850p a tube, and the tool at 495p', () => {
    expect(extrasOf({ silicone_tubes: { clear: 1, translucent: 0, white: 2 }, silicone_tool: 'yes' })).toEqual([
      { key: 'silicone:clear', description: 'Silicone sealant, clear', quantity: 1, unitPence: 850 },
      { key: 'silicone:white', description: 'Silicone sealant, white', quantity: 2, unitPence: 850 },
      { key: 'silicone-tool', description: 'Silicone finishing tool', quantity: 1, unitPence: 495 },
    ]);
    expect(extrasOf({ silicone_tubes: { clear: 0, translucent: 0, white: 0 }, silicone_tool: 'no' })).toEqual([]);
    // Saved before tubes were counted: one tube of the colour chosen.
    expect(extrasOf({ silicone: 'yes', silicone_colour: 'clear', silicone_tool: 'no' })).toEqual([{ key: 'silicone:clear', description: 'Silicone sealant, clear', quantity: 1, unitPence: 850 }]);
  });

  test('terms are a company’s own when it has set them, each wording with its own version', async () => {
    const standard = await termsFor({});
    expect(standard).toMatchObject({ source: 'default', items: [...DEFAULT_TERMS] });
    expect(standard.version).toBe(await termsVersion(DEFAULT_TERMS));
    expect(standard.version).toMatch(/^sha256:[0-9a-f]{16}$/);
    const own = await termsFor({ termsOfSale: [{ title: 'Ours.', text: 'Different words.' }] });
    expect(own).toMatchObject({ source: 'company', items: [{ title: 'Ours.', text: 'Different words.' }] });
    expect(own.version).not.toBe(standard.version);
    expect((await termsFor({ termsOfSale: [{ title: 'Empty.' }] })).source).toBe('default');
  });

  test('a mistake comes back with the answers kept and nothing written', async () => {
    const token = await linkFor(shop, jobId);
    const response = await submit(token, { ...FULL, details_confirmed: '' });
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('Please tick all three confirmation boxes.');
    expect(html).toContain('value="  Oliver   Milton "');
    expect(html).toContain('Drive is steep.');
    expect(html).toMatch(/name="addr_postcode"[^>]*value="al35qn"/);
    expect(html).toMatch(/name="silicone_white" min="0" max="10" step="1" value="2"/);
    expect(html).toMatch(/name="terms_accepted" value="yes" checked/);
    expect(html).toContain('Extras: £25.50');
    expect(said(html)).not.toMatch(/392|1795|cut size|deduction/i);
    expect(await events('order_confirmed')).toHaveLength(0);
  });

  test('a post from another site is refused', async () => {
    const token = await linkFor(shop, jobId);
    expect((await submit(token, FULL, 'https://evil.example')).status).toBe(403);
    expect((await submit(token, FULL, null)).status).toBe(403);
    expect((await submit(token, FULL, 'null')).status).toBe(403);
    expect(await events('order_confirmed')).toHaveLength(0);
  });
});

test('a browser that sends no origin but says the post is from this site is let through', async () => {
  const other = await company('Origin Glass', 'OR');
  const { job } = await walkInJob(other);
  const token = await linkFor(other, job.id);
  const response = await exports.default.fetch(`${DESIGNER}/confirm/${token}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'null', 'Sec-Fetch-Site': 'same-origin' },
    body: new URLSearchParams(FULL).toString(),
  });
  expect(response.status).toBe(303);
});

describe('confirming', () => {
  let token = '';

  test('writes the answers on the job, emails the workshop, and goes to the thank-you', async () => {
    token = await linkFor(shop, jobId);
    const mail: { to: string[]; subject: string; html: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.resend.com/emails');
      mail.push(JSON.parse(init.body as string));
      return new Response('{}');
    });
    const response = await callWith({ RESEND_API_KEY: 're_test', EMAIL_FROM: 'hello@setout.example' }, `/confirm/${token}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(FULL).toString(),
    }, DESIGNER);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`/confirm/${token}`);

    const [event] = await events('order_confirmed');
    expect(event.actor_kind).toBe('customer');
    expect(event.data).toMatchObject({
      order_ref: 'CS-1001',
      details_confirmed: true,
      measurements_accepted: true,
      terms_accepted: true,
      terms_version: await termsVersion(DEFAULT_TERMS),
      terms_source: 'default',
      delivery_address: { line1: '12 Holly Lane', line2: '', town: 'St Albans', postcode: 'AL3 5QN' },
      can_unload: 'yes',
      unload_note: 'Drive is steep.',
      silicone_tubes: { clear: 1, translucent: 0, white: 2 },
      silicone_tool: 'no',
      signed_name: 'Oliver Milton',
      comments: '',
    });
    expect(typeof event.data.submitted_at).toBe('string');
    expect(event.data.terms_accepted_at).toBe(event.data.submitted_at);
    expect(event.data).not.toHaveProperty('silicone_colour');
    expect((event.data.shown as Record<string, string>).Fixing).toBe('U-channel on the floor and up the wall');

    expect(mail).toHaveLength(1);
    expect(mail[0].to).toEqual(['workshop@cs.example']);
    expect(mail[0].subject).toBe('CS-1001: order confirmed by the customer');
    expect(mail[0].html).toContain('<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;">12 Holly Lane<br>St Albans<br>AL3 5QN</td>');
    expect(mail[0].html).toContain('1 clear, 2 white');
    expect(mail[0].html).toContain(`Accepted, version ${await termsVersion(DEFAULT_TERMS)}`);
    expect(mail[0].html).toContain('agree to the terms of sale');
    expect(await events('email_sent')).toHaveLength(1);
  });

  test('reopening the link shows the thank-you, not the form', async () => {
    const html = await (await page(token)).text();
    expect(html).toContain('Thank you, your details are confirmed');
    expect(html).toContain('CS-1001');
    expect(html).not.toContain('<form');
    expect(said(html)).not.toMatch(/392|1795|cut size|deduction/i);
  });

  test('confirming again changes nothing', async () => {
    const again = await submit(token, { ...FULL, silicone_white: '0' });
    expect(again.status).toBe(303);
    expect(await events('order_confirmed')).toHaveLength(1);
  });

  test('the database refuses to change a confirmation once given', async () => {
    const [row] = await shop.db.find('order_confirmations', { where: { job_id: jobId, link_token_hash: await hashResumeToken(token) } });
    await expect(shop.db.update('order_confirmations', row.id, { confirmed_at: null })).rejects.toThrow();
  });
});

describe('making a link', () => {
  test('a member of staff makes one; a new one replaces the last; none once confirmed', async () => {
    const other = await company('Link Showers', 'LS');
    await addMember(env, other.id, 'owner@ls.example', 'owner');
    const cookie = await signIn('owner@ls.example');
    const { job } = await walkInJob(other, 'Lena Smith', 'LS1 1AA');

    const first = await post(`/jobs/${job.id}/confirmation-link`, {}, { cookie });
    expect(first.status).toBe(201);
    const { link } = await json<{ link: string }>(first);
    expect(link).toMatch(/^https:\/\/designer\.test\/confirm\/oc_[a-z0-9]{32}$/);
    const second = await json<{ link: string }>(await post(`/jobs/${job.id}/confirmation-link`, {}, { cookie }));
    expect((await page(link.slice(link.lastIndexOf('/') + 1))).status).toBe(404);
    const token = second.link.slice(second.link.lastIndexOf('/') + 1);
    expect((await page(token)).status).toBe(200);

    expect((await submit(token, FULL)).status).toBe(303);
    expect((await post(`/jobs/${job.id}/confirmation-link`, {}, { cookie })).status).toBe(409);
    // Another company's job is not found.
    expect((await post(`/jobs/${jobId}/confirmation-link`, {}, { cookie })).status).toBe(404);
  });
});
