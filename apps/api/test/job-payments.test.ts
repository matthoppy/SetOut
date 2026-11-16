/**
 * Customers paying for their job through the company's own Stripe account:
 * the pay button on the confirmation page, Checkout's parameters, trade
 * invoices, and Stripe's webhook. Nothing here reaches Stripe: every call out
 * goes to a stand-in, and a test that should not call out fails if it does.
 */
import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { addMember } from '../src/db/auth';
import { hashResumeToken, newConfirmationToken } from '../src/db/platform';
import { jobPrice, parseInvoiceDays, paymentSettings, standingOf } from '../src/lib/job-payments';
import { formEncode, signStripePayload } from '../src/lib/stripe';
import type { QuoteRow, Row } from '../src/db/tables';
import { APP, callWith, company, DESIGNER, json, signIn, type Company, type Overrides } from './helpers';
import { walkInJob } from './walk-in';

const WEBHOOK_SECRET = 'whsec_job_test_secret';
let shop: Company;
let ON: Overrides;
let cookie = '';

interface Sent {
  url: string;
  path: string;
  authorization: string | null;
  idempotencyKey: string | null;
  form: Record<string, string>;
}

/** Stand in for Stripe: keep what was sent, and answer each path as Stripe would. */
let sessionNumber = 0;
let invoiceNumber = 100;
function stripe(overrides: Record<string, { status?: number; body: unknown }> = {}): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname.replace(/^\/v1/, '');
    const headers = new Headers(init.headers);
    sent.push({
      url,
      path,
      authorization: headers.get('authorization'),
      idempotencyKey: headers.get('idempotency-key'),
      form: Object.fromEntries(new URLSearchParams(init.body as string)),
    });
    expect(new URL(url).origin).toBe('https://api.stripe.com');
    if (overrides[path]) return Response.json(overrides[path].body, { status: overrides[path].status ?? 200 });
    if (path === '/checkout/sessions') {
      const n = ++sessionNumber;
      return Response.json({ id: `cs_test_${n}`, url: `https://checkout.stripe.com/c/pay/cs_test_${n}`, expires_at: Math.floor(Date.now() / 1000) + 1860 });
    }
    if (path === '/customers') return Response.json({ id: 'cus_test_trade' });
    if (path === '/invoices') return Response.json({ id: `in_test_${++invoiceNumber}`, status: 'draft' });
    if (path === '/invoiceitems') return Response.json({ id: 'ii_test_1' });
    if (path.endsWith('/finalize') || path.endsWith('/send')) {
      const id = path.split('/')[2];
      return Response.json({ id, status: 'open', hosted_invoice_url: `https://invoice.stripe.com/i/acct_test/${id}` });
    }
    return Response.json({ error: { message: 'unexpected' } }, { status: 404 });
  });
  return sent;
}

/** Any call out fails the test that made it. */
function nothingGoesOut(): { calls: number } {
  const seen = { calls: 0 };
  vi.stubGlobal('fetch', async () => {
    seen.calls++;
    throw new Error('this test must not call out');
  });
  return seen;
}

/** A job like CS-1001 with a quote, and its customer's link, confirmed unless told otherwise. */
async function job(options: { quote?: Partial<QuoteRow> | null; confirmed?: boolean } = {}) {
  const made = await walkInJob(shop);
  if (options.quote !== null) {
    await shop.db.insert('quotes', {
      job_id: made.job.id,
      number: 1,
      status: 'accepted',
      lines: [{ key: 'glass', description: 'Glass', quantity: 1, unit: 'job', unitPricePence: 45_000 }],
      vat_rate_bp: 0,
      subtotal_pence: 45_000,
      vat_pence: 0,
      total_pence: 45_000,
      ...options.quote,
    });
  }
  const token = newConfirmationToken();
  await shop.db.insert('order_confirmations', {
    job_id: made.job.id,
    link_token_hash: await hashResumeToken(token),
    confirmed_at: options.confirmed === false ? null : new Date().toISOString(),
  });
  return { ...made, token };
}

const page = async (token: string, overrides: Overrides = ON, query = '') => callWith(overrides, `/confirm/${token}${query}`, {}, DESIGNER);
const pay = (token: string, overrides: Overrides = ON, origin: string | null = DESIGNER) =>
  callWith(overrides, `/confirm/${token}/pay`, { method: 'POST', origin: origin ?? null }, DESIGNER);
const paymentsOf = (jobId: string) => shop.db.find('job_payments', { where: { job_id: jobId }, orderBy: { column: 'created_at' } });
const eventsOf = (jobId: string, type: string) => shop.db.find('job_events', { where: { job_id: jobId, type } });

let eventNumber = 0;
async function webhook(type: string, object: Record<string, unknown>, options: { signature?: string | null; id?: string; overrides?: Overrides; livemode?: boolean; at?: number } = {}) {
  const payload = JSON.stringify({ id: options.id ?? `evt_job${++eventNumber}`, type, livemode: options.livemode ?? false, data: { object } });
  const at = options.at ?? Math.floor(Date.now() / 1000);
  const signature = options.signature === undefined ? await signStripePayload(WEBHOOK_SECRET, payload, at) : options.signature;
  return callWith(options.overrides ?? ON, '/api/stripe/payments/webhook', {
    method: 'POST',
    body: payload,
    origin: null,
    headers: signature === null ? {} : { 'Stripe-Signature': signature },
  });
}

/** Pay for a job through Checkout and have Stripe say so. */
async function paidThroughCheckout(made: Awaited<ReturnType<typeof job>>) {
  stripe();
  expect((await pay(made.token)).status).toBe(303);
  const [row] = await paymentsOf(made.job.id);
  nothingGoesOut();
  const response = await webhook('checkout.session.completed', {
    id: row.stripe_checkout_session_id,
    payment_status: 'paid',
    amount_total: 45_000,
    total_details: { amount_tax: 0 },
    customer: 'cus_test_retail',
    payment_intent: 'pi_test_retail',
    metadata: { company_id: shop.id, job_id: made.job.id, payment_id: row.id, payment_kind: 'full' },
  });
  expect(response.status).toBe(200);
  return row;
}

beforeAll(async () => {
  shop = await company('Custom Showers', 'CS');
  ON = { JOB_PAYMENTS_COMPANY: shop.id, JOB_STRIPE_SECRET_KEY: 'sk_test_abc123', JOB_STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, JOB_PAYMENTS_INVOICE_DAYS: '14' };
  await addMember(env, shop.id, 'owner@cs.example', 'owner');
  cookie = await signIn('owner@cs.example');
});

beforeEach(() => void nothingGoesOut());
afterEach(() => vi.unstubAllGlobals());

describe('settings', () => {
  test('payments are off unless a company is named, and only for that company', () => {
    expect(paymentSettings({ ...env, JOB_PAYMENTS_COMPANY: '' }, shop.id)).toEqual({ ok: false, reason: 'off' });
    expect(paymentSettings({ ...env, ...ON }, 'co_someone_else')).toEqual({ ok: false, reason: 'off' });
    expect(paymentSettings({ ...env, ...ON, JOB_STRIPE_SECRET_KEY: undefined }, shop.id)).toEqual({ ok: false, reason: 'no_key' });
    expect(paymentSettings({ ...env, ...ON, JOB_STRIPE_SECRET_KEY: 'pk_test_abc' }, shop.id)).toEqual({ ok: false, reason: 'bad_key' });
  });

  test('a live key is refused unless live payments are allowed', () => {
    expect(paymentSettings({ ...env, ...ON, JOB_STRIPE_SECRET_KEY: 'sk_live_abc' }, shop.id)).toEqual({ ok: false, reason: 'live_key_refused' });
    expect(paymentSettings({ ...env, ...ON, JOB_STRIPE_SECRET_KEY: 'rk_live_abc' }, shop.id)).toEqual({ ok: false, reason: 'live_key_refused' });
    const allowed = paymentSettings({ ...env, ...ON, JOB_STRIPE_SECRET_KEY: 'sk_live_abc', JOB_PAYMENTS_ALLOW_LIVE: 'on' }, shop.id);
    expect(allowed.ok && allowed.settings.live).toBe(true);
    const restricted = paymentSettings({ ...env, ...ON, JOB_STRIPE_SECRET_KEY: 'rk_test_abc' }, shop.id);
    expect(restricted.ok && restricted.settings.live).toBe(false);
  });

  test('Stripe Tax is off by default; on, the tax behaviour must be chosen', () => {
    const plain = paymentSettings({ ...env, ...ON }, shop.id);
    expect(plain.ok && plain.settings).toMatchObject({ stripeTax: false, taxMode: 'none', bankTransfer: false, invoiceDays: 14 });
    const undecided = paymentSettings({ ...env, ...ON, JOB_PAYMENTS_STRIPE_TAX: 'on' }, shop.id);
    expect(undecided.ok && undecided.settings).toMatchObject({ stripeTax: true, taxMode: null });
    const chosen = paymentSettings({ ...env, ...ON, JOB_PAYMENTS_STRIPE_TAX: 'on', JOB_PAYMENTS_TAX_BEHAVIOR: 'exclusive' }, shop.id);
    expect(chosen.ok && chosen.settings.taxMode).toBe('exclusive');
    // Tax behaviour means nothing with Stripe Tax off.
    const ignored = paymentSettings({ ...env, ...ON, JOB_PAYMENTS_TAX_BEHAVIOR: 'inclusive' }, shop.id);
    expect(ignored.ok && ignored.settings.taxMode).toBe('none');
  });

  test('invoice days are a sensible whole number or unset', () => {
    expect(parseInvoiceDays('30')).toBe(30);
    for (const bad of ['', '0', '-1', '400', '14.5', 'soon', undefined]) expect(parseInvoiceDays(bad)).toBeNull();
  });

  test('the shipped settings take no payments and charge no tax', async () => {
    expect(env.JOB_PAYMENTS_COMPANY).toBe('');
    expect(env.JOB_PAYMENTS_STRIPE_TAX).toBe('off');
    expect(env.JOB_PAYMENTS_ALLOW_LIVE).toBe('off');
  });
});

describe('the price', () => {
  const quote = (q: Partial<QuoteRow>): QuoteRow =>
    ({ id: 'qte_1', number: 1, status: 'accepted', currency: 'GBP', subtotal_pence: 40_000, vat_pence: 0, total_pence: 40_000, valid_until: null, ...q }) as QuoteRow;

  test('comes from the latest accepted quote, or the latest sent one still standing, never a draft', () => {
    expect(jobPrice([], 'none')).toEqual({ missing: 'no_quote' });
    expect(jobPrice([quote({ status: 'draft' })], 'none')).toEqual({ missing: 'no_quote' });
    expect(jobPrice([quote({ status: 'withdrawn' })], 'none')).toEqual({ missing: 'no_quote' });
    const accepted = jobPrice([quote({ number: 1, total_pence: 1_000, subtotal_pence: 1_000 }), quote({ number: 2, status: 'sent', total_pence: 2_000, subtotal_pence: 2_000 })], 'none');
    expect('amountPence' in accepted && accepted.amountPence).toBe(1_000);
    const sent = jobPrice([quote({ status: 'sent', total_pence: 2_000, subtotal_pence: 2_000 })], 'none');
    expect('amountPence' in sent && sent.amountPence).toBe(2_000);
    expect(jobPrice([quote({ status: 'sent', valid_until: '2020-01-01T00:00:00.000Z' })], 'none')).toEqual({ missing: 'quote_expired' });
    expect(jobPrice([quote({ total_pence: 0, subtotal_pence: 0 })], 'none')).toEqual({ missing: 'quote_empty' });
    expect(jobPrice([quote({ currency: 'NZD' })], 'none')).toEqual({ missing: 'not_gbp' });
  });

  test('with Stripe Tax off, the total is what is paid, and a quote with VAT on it is no price at all', () => {
    expect(jobPrice([quote({ subtotal_pence: 40_000, vat_pence: 8_000, total_pence: 48_000 })], 'none')).toEqual({ missing: 'quote_has_vat' });
  });

  test('with Stripe Tax on: inclusive is the total, exclusive the subtotal', () => {
    const q = quote({ subtotal_pence: 40_000, vat_pence: 8_000, total_pence: 48_000 });
    expect(jobPrice([q], 'inclusive')).toMatchObject({ amountPence: 48_000 });
    expect(jobPrice([q], 'exclusive')).toMatchObject({ amountPence: 40_000 });
  });

  test('Stripe’s forms name list items by position', () => {
    expect(formEncode({ a: { b: ['GB', 'IE'] }, c: [{ d: 1 }] }).toString()).toBe('a%5Bb%5D%5B0%5D=GB&a%5Bb%5D%5B1%5D=IE&c%5B0%5D%5Bd%5D=1');
  });
});

describe('the pay button', () => {
  test('is “coming soon” with payments off, and pressing it does nothing', async () => {
    const seen = nothingGoesOut();
    const made = await job();
    const html = await (await page(made.token, {})).text();
    expect(html).toContain('Coming soon');
    expect(html).toMatch(/<button type="button" class="paybtn" disabled/);
    expect(html).not.toContain('/pay"');
    const response = await pay(made.token, {});
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`/confirm/${made.token}`);
    expect(seen.calls).toBe(0);
  });

  test('waits for the order to be confirmed, and shows the total', async () => {
    const made = await job({ confirmed: false });
    const html = await (await page(made.token)).text();
    expect(html).toContain('Confirm your order below first');
    expect(html).toContain('Total: £450.00');
    expect(html).toContain('The full amount for your order');
    // The payment card adds no VAT. (The terms of sale say none is charged.)
    expect(html.slice(html.indexOf('id="payment"'), html.indexOf('id="terms"'))).not.toMatch(/VAT/);
    expect(html).toMatch(/<button type="button" class="paybtn" disabled/);
    expect((await pay(made.token)).headers.get('location')).toBe(`/confirm/${made.token}`);
  });

  test('stays off with a clear message while the job has no price, and never makes one up', async () => {
    const seen = nothingGoesOut();
    const made = await job({ quote: null });
    const html = await (await page(made.token)).text();
    expect(html).toContain("Your final price isn't ready yet.");
    expect(html).toMatch(/<button type="button" class="paybtn" disabled/);
    expect((await pay(made.token)).headers.get('location')).toBe(`/confirm/${made.token}`);
    // A draft quote is not a price either, nor one with VAT while VAT is not charged.
    const draft = await job({ quote: { status: 'draft' } });
    expect(await (await page(draft.token)).text()).toContain("Your final price isn't ready yet.");
    const vat = await job({ quote: { vat_rate_bp: 2000, vat_pence: 9_000, total_pence: 54_000 } });
    expect(await (await page(vat.token)).text()).toContain("Your final price isn't ready yet.");
    expect((await pay(vat.token)).status).toBe(303);
    expect(seen.calls).toBe(0);
    expect(await paymentsOf(vat.job.id)).toHaveLength(0);
  });

  test('once confirmed, posts to the Worker, which opens Checkout for the whole order with no tax', async () => {
    const made = await job();
    const html = await (await page(made.token)).text();
    expect(html).toContain(`<form id="payform" method="post" action="/confirm/${made.token}/pay">`);
    expect(html).toContain('Total: £450.00');
    const sent = stripe();
    const response = await pay(made.token);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_\d+$/);
    expect(sent).toHaveLength(1);
    const [call] = sent;
    expect(call.path).toBe('/checkout/sessions');
    expect(call.authorization).toBe('Bearer sk_test_abc123');
    expect(call.idempotencyKey).toMatch(/^setout-checkout-jpy_/);
    const [row] = await paymentsOf(made.job.id);
    expect(call.form).toMatchObject({
      mode: 'payment',
      currency: 'gbp',
      client_reference_id: made.job.id,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'gbp',
      'line_items[0][price_data][unit_amount]': '45000',
      'line_items[0][price_data][product_data][name]': `${made.job.reference}, made-to-measure shower glass`,
      customer_email: 'oliver@example.test',
      customer_creation: 'always',
      'metadata[company_id]': shop.id,
      'metadata[job_id]': made.job.id,
      'metadata[job_ref]': made.job.reference,
      'metadata[payment_kind]': 'full',
      'metadata[payment_id]': row.id,
      'payment_intent_data[metadata][payment_kind]': 'full',
      success_url: `${DESIGNER}/confirm/${made.token}?paid=1`,
      cancel_url: `${DESIGNER}/confirm/${made.token}?cancelled=1`,
    });
    // No tax of any kind while Stripe Tax is off, and payment methods are the Dashboard's.
    const keys = Object.keys(call.form);
    expect(keys.filter((k) => /tax/.test(k))).toEqual([]);
    expect(keys.filter((k) => /payment_method_types/.test(k))).toEqual([]);
    // Stripe never asks for the address again: it was given on our page.
    expect(keys.filter((k) => /shipping_address_collection|billing_address_collection/.test(k))).toEqual([]);
    expect(row).toMatchObject({ status: 'pending', kind: 'full', method: 'checkout', tax_behavior: 'none', amount_pence: 45_000, stripe_checkout_session_id: expect.stringMatching(/^cs_test_\d+$/) });
    expect(await eventsOf(made.job.id, 'checkout_started')).toHaveLength(1);
  });

  test('puts the confirmed delivery address on the session and payment as metadata and shipping, with no address step', async () => {
    const made = await job();
    const [link] = await shop.db.find('order_confirmations', { where: { job_id: made.job.id } });
    await shop.db.insert('job_events', {
      job_id: made.job.id,
      type: 'order_confirmed',
      actor_kind: 'customer',
      data: {
        confirmationId: link.id,
        signed_name: 'Oliver Milton',
        delivery_address: { line1: '12 Station Road', line2: '', town: 'St Albans', postcode: 'AL3 5QN' },
        silicone_tubes: { clear: 0, white: 0, black: 0 },
        silicone_tool: 'no',
      },
    });
    const sent = stripe();
    expect((await pay(made.token)).status).toBe(303);
    const form = sent[0].form;
    expect(form).toMatchObject({
      'metadata[delivery_line1]': '12 Station Road',
      'metadata[delivery_line2]': '',
      'metadata[delivery_town]': 'St Albans',
      'metadata[delivery_postcode]': 'AL3 5QN',
      'payment_intent_data[metadata][delivery_postcode]': 'AL3 5QN',
      'payment_intent_data[shipping][address][line1]': '12 Station Road',
      'payment_intent_data[shipping][address][city]': 'St Albans',
      'payment_intent_data[shipping][address][postal_code]': 'AL3 5QN',
      'payment_intent_data[shipping][address][country]': 'GB',
    });
    expect(form['payment_intent_data[shipping][name]']).toBeTruthy();
    expect(Object.keys(form).some((k) => k.startsWith('shipping_address_collection'))).toBe(false);
    expect(Object.keys(form).some((k) => k.includes('[line2]') && k.includes('shipping'))).toBe(false);
    expect(sent.filter((c) => c.path.startsWith('/customers'))).toHaveLength(0);
  });

  test('adds the extras chosen when confirming, one line per silicone colour and the tool, to the total and to Checkout', async () => {
    const made = await job();
    const [link] = await shop.db.find('order_confirmations', { where: { job_id: made.job.id } });
    await shop.db.insert('job_events', {
      job_id: made.job.id,
      type: 'order_confirmed',
      actor_kind: 'customer',
      data: { confirmationId: link.id, silicone_tubes: { clear: 1, white: 2, black: 0 }, silicone_tool: 'yes' },
    });
    // 450.00 + 3 tubes at 8.50 + the tool at 4.95, line by line.
    const html = await (await page(made.token)).text();
    expect(html).toContain('Total: £480.45');
    expect(html).toMatch(/Shower glass package<\/span><span class="amt">£450\.00<.*Silicone sealant, clear<\/span><span class="amt">£8\.50<.*Silicone sealant, white × 2<\/span><span class="amt">£17\.00<.*Silicone finishing tool<\/span><span class="amt">£4\.95<.*id="pay_total">£480\.45</s);
    const sent = stripe();
    expect((await pay(made.token)).status).toBe(303);
    expect(sent[0].form).toMatchObject({
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][unit_amount]': '45000',
      'line_items[1][quantity]': '1',
      'line_items[1][price_data][unit_amount]': '850',
      'line_items[1][price_data][product_data][name]': 'Silicone sealant, clear',
      'line_items[2][quantity]': '2',
      'line_items[2][price_data][unit_amount]': '850',
      'line_items[2][price_data][product_data][name]': 'Silicone sealant, white',
      'line_items[3][quantity]': '1',
      'line_items[3][price_data][unit_amount]': '495',
      'line_items[3][price_data][product_data][name]': 'Silicone finishing tool',
    });
    expect(Object.keys(sent[0].form).some((k) => k.startsWith('line_items[4]'))).toBe(false);
    expect(Object.keys(sent[0].form).filter((k) => /tax/.test(k))).toEqual([]);
    const [row] = await paymentsOf(made.job.id);
    expect(row.amount_pence).toBe(48_045);
    const [started] = await eventsOf(made.job.id, 'checkout_started');
    expect(started.data).toMatchObject({ amountPence: 48_045, quotePence: 45_000, extras: [{ key: 'silicone:clear', quantity: 1, unitPence: 850 }, { key: 'silicone:white', quantity: 2, unitPence: 850 }, { key: 'silicone-tool', quantity: 1, unitPence: 495 }] });
  });

  test('a second press uses the open session rather than starting another', async () => {
    const made = await job();
    const sent = stripe();
    const first = await pay(made.token);
    const second = await pay(made.token);
    expect(second.headers.get('location')).toBe(first.headers.get('location'));
    expect(sent).toHaveLength(1);
    expect(await paymentsOf(made.job.id)).toHaveLength(1);
  });

  test('sends tax only with Stripe Tax on: inclusive charges the total, exclusive the subtotal', async () => {
    for (const [behavior, amount] of [
      ['inclusive', '54000'],
      ['exclusive', '45000'],
    ] as const) {
      const made = await job({ quote: { vat_rate_bp: 2000, subtotal_pence: 45_000, vat_pence: 9_000, total_pence: 54_000 } });
      const sent = stripe();
      expect((await pay(made.token, { ...ON, JOB_PAYMENTS_STRIPE_TAX: 'on', JOB_PAYMENTS_TAX_BEHAVIOR: behavior })).status).toBe(303);
      expect(sent[0].form).toMatchObject({
        'automatic_tax[enabled]': 'true',
        'line_items[0][price_data][unit_amount]': amount,
        'line_items[0][price_data][tax_behavior]': behavior,
        'line_items[0][price_data][product_data][tax_code]': 'txcd_99999999',
      });
      expect((await paymentsOf(made.job.id))[0].tax_behavior).toBe(behavior);
    }
  });

  test('with Stripe Tax on and the tax behaviour undecided, nobody can pay', async () => {
    const made = await job();
    const undecided = { ...ON, JOB_PAYMENTS_STRIPE_TAX: 'on' };
    expect(await (await page(made.token, undecided)).text()).toContain('Coming soon');
    expect((await pay(made.token, undecided)).headers.get('location')).toBe(`/confirm/${made.token}`);
  });

  test('a live key is refused unless live payments are allowed', async () => {
    const made = await job();
    const live = { ...ON, JOB_STRIPE_SECRET_KEY: 'sk_live_abc' };
    expect(await (await page(made.token, live)).text()).toContain('Coming soon');
    expect((await pay(made.token, live)).headers.get('location')).toBe(`/confirm/${made.token}`);
    const sent = stripe();
    expect((await pay(made.token, { ...live, JOB_PAYMENTS_ALLOW_LIVE: 'on' })).status).toBe(303);
    expect(sent[0].authorization).toBe('Bearer sk_live_abc');
  });

  test('only from the page itself', async () => {
    const made = await job();
    expect((await pay(made.token, ON, 'https://evil.example')).status).toBe(403);
    expect((await pay(made.token, ON, null)).status).toBe(403);
    expect(await paymentsOf(made.job.id)).toHaveLength(0);
  });

  test('when Stripe fails, the customer is told to try again and nothing is kept', async () => {
    const made = await job();
    stripe({ '/checkout/sessions': { status: 500, body: { error: { message: 'boom' } } } });
    const response = await pay(made.token);
    expect(response.status).toBe(502);
    const html = await response.text();
    expect(html).toContain('open the payment page just now. Please try again in a few minutes');
    expect(html).not.toContain('boom');
    expect(await paymentsOf(made.job.id)).toHaveLength(0);
  });

  test('refuses a job that is already paid, and says it is paid', async () => {
    const made = await job();
    await paidThroughCheckout(made);
    const seen = nothingGoesOut();
    const response = await pay(made.token);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`/confirm/${made.token}`);
    expect(seen.calls).toBe(0);
    const html = await (await page(made.token)).text();
    expect(html).toContain('Paid in full');
    expect(html).toContain('£450.00');
    expect(html).not.toContain('id="payform"');
  });

  test('back from Stripe before its message, the page says the payment is being confirmed', async () => {
    const made = await job();
    stripe();
    await pay(made.token);
    nothingGoesOut();
    const html = await (await page(made.token, ON, '?paid=1')).text();
    expect(html).toContain('confirming your payment');
    expect(html).not.toContain('id="payform"');
  });
});

describe('the webhook', () => {
  test('is not there with payments off', async () => {
    expect((await webhook('checkout.session.completed', {}, { overrides: {} })).status).toBe(404);
    expect((await webhook('checkout.session.completed', {}, { overrides: { ...ON, JOB_STRIPE_WEBHOOK_SECRET: undefined } })).status).toBe(404);
  });

  test('refuses a bad, missing, old or other-secret signature', async () => {
    expect((await webhook('checkout.session.completed', {}, { signature: null })).status).toBe(400);
    expect((await webhook('checkout.session.completed', {}, { signature: 't=1,v1=abc' })).status).toBe(400);
    expect((await webhook('checkout.session.completed', {}, { at: Math.floor(Date.now() / 1000) - 600 })).status).toBe(400);
    const other = JSON.stringify({ id: 'evt_other', type: 'checkout.session.completed', data: { object: {} } });
    const signature = await signStripePayload('whsec_someone_else', other, Math.floor(Date.now() / 1000));
    const response = await callWith(ON, '/api/stripe/payments/webhook', { method: 'POST', body: other, origin: null, headers: { 'Stripe-Signature': signature } });
    expect(response.status).toBe(400);
  });

  test('is only on the workspace’s address', async () => {
    const payload = JSON.stringify({ id: 'evt_host', type: 'x', data: { object: {} } });
    const signature = await signStripePayload(WEBHOOK_SECRET, payload, Math.floor(Date.now() / 1000));
    const response = await callWith(ON, '/api/stripe/payments/webhook', { method: 'POST', body: payload, origin: null, headers: { 'Stripe-Signature': signature } }, DESIGNER);
    expect(response.status).toBe(404);
  });

  test('refuses live-mode messages unless live payments are allowed', async () => {
    expect((await webhook('checkout.session.completed', {}, { livemode: true })).status).toBe(400);
    const allowed = await webhook('checkout.session.completed', { id: 'cs_live_x' }, { livemode: true, overrides: { ...ON, JOB_PAYMENTS_ALLOW_LIVE: 'on' } });
    expect(await json(allowed)).toEqual({ ok: true, handled: 'ignored' });
  });

  test('a paid Checkout marks the job paid and writes it on the timeline, once however often it comes', async () => {
    const made = await job();
    stripe();
    await pay(made.token);
    const [row] = await paymentsOf(made.job.id);
    nothingGoesOut();
    const object = {
      id: row.stripe_checkout_session_id,
      payment_status: 'paid',
      amount_total: 45_000,
      total_details: { amount_tax: 0 },
      customer: 'cus_test_9',
      payment_intent: 'pi_test_9',
      metadata: { company_id: shop.id, job_id: made.job.id, payment_id: row.id },
    };
    const first = await webhook('checkout.session.completed', object, { id: 'evt_paid_once' });
    expect(await json(first)).toEqual({ ok: true, handled: 'recorded' });
    const again = await webhook('checkout.session.completed', object, { id: 'evt_paid_once' });
    expect(await json(again)).toEqual({ ok: true, handled: 'already' });
    // A different delivery of the same news changes nothing either.
    expect(await json(await webhook('checkout.session.async_payment_succeeded', object))).toEqual({ ok: true, handled: 'ignored' });
    const [paid] = await paymentsOf(made.job.id);
    expect(paid).toMatchObject({ status: 'paid', amount_total_pence: 45_000, tax_pence: 0, stripe_customer_id: 'cus_test_9', stripe_payment_intent_id: 'pi_test_9', stripe_checkout_url: null });
    const events = await eventsOf(made.job.id, 'payment_received');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor_kind: 'system', data: { amountTotalPence: 45_000, via: 'checkout', paymentId: row.id } });
  });

  test('a delayed method waits, then succeeds or fails', async () => {
    const made = await job();
    stripe();
    await pay(made.token);
    const [row] = await paymentsOf(made.job.id);
    nothingGoesOut();
    const object = { id: row.stripe_checkout_session_id, payment_status: 'unpaid', amount_total: 45_000, metadata: { company_id: shop.id } };
    await webhook('checkout.session.completed', object);
    expect((await paymentsOf(made.job.id))[0].status).toBe('pending');
    await webhook('checkout.session.async_payment_failed', object);
    expect((await paymentsOf(made.job.id))[0].status).toBe('failed');
    const html = await (await page(made.token)).text();
    expect(html).toContain('go through. You can try again.');
    expect(html).toContain('id="payform"');
  });

  test('an expired session leaves the link usable, and the customer can pay again', async () => {
    const made = await job();
    stripe();
    await pay(made.token);
    const [row] = await paymentsOf(made.job.id);
    nothingGoesOut();
    await webhook('checkout.session.expired', { id: row.stripe_checkout_session_id, metadata: { company_id: shop.id } });
    expect((await paymentsOf(made.job.id))[0].status).toBe('expired');
    expect(await eventsOf(made.job.id, 'checkout_expired')).toHaveLength(1);
    const sent = stripe();
    expect((await pay(made.token)).status).toBe(303);
    expect(sent).toHaveLength(1);
    expect(await paymentsOf(made.job.id)).toHaveLength(2);
  });

  test('leaves alone what SetOut did not start, or another company’s', async () => {
    expect(await json(await webhook('checkout.session.completed', { id: 'cs_test_unknown', payment_status: 'paid' }))).toEqual({ ok: true, handled: 'ignored' });
    const made = await job();
    stripe();
    await pay(made.token);
    const [row] = await paymentsOf(made.job.id);
    nothingGoesOut();
    const other = await webhook('checkout.session.completed', { id: row.stripe_checkout_session_id, payment_status: 'paid', metadata: { company_id: 'co_other' } });
    expect(await json(other)).toEqual({ ok: true, handled: 'ignored' });
    expect((await paymentsOf(made.job.id))[0].status).toBe('pending');
    expect(await json(await webhook('customer.created', { id: 'cus_x' }))).toEqual({ ok: true, handled: 'ignored' });
  });

  test('a refund is recorded, whole or in part', async () => {
    const made = await job();
    await paidThroughCheckout(made);
    await webhook('charge.refunded', { id: 'ch_1', payment_intent: 'pi_test_retail', amount: 45_000, amount_captured: 45_000, amount_refunded: 10_000, refunded: false });
    expect((await paymentsOf(made.job.id))[0]).toMatchObject({ status: 'partially_refunded', amount_refunded_pence: 10_000 });
    await webhook('charge.refunded', { id: 'ch_1', payment_intent: 'pi_test_retail', amount: 45_000, amount_captured: 45_000, amount_refunded: 45_000, refunded: true });
    expect((await paymentsOf(made.job.id))[0]).toMatchObject({ status: 'refunded', amount_refunded_pence: 45_000 });
    expect(await eventsOf(made.job.id, 'payment_refunded')).toHaveLength(2);
    expect(await (await page(made.token)).text()).toContain('This order has been refunded.');
  });

  test('a second payment for a paid job is flagged for staff to refund', async () => {
    const made = await job();
    await paidThroughCheckout(made);
    const second = await shop.db.insert('job_payments', {
      job_id: made.job.id, kind: 'full', method: 'checkout', status: 'pending', tax_behavior: 'none', amount_pence: 45_000, stripe_checkout_session_id: 'cs_test_dupe',
    });
    await webhook('checkout.session.completed', { id: 'cs_test_dupe', payment_status: 'paid', amount_total: 45_000, metadata: { company_id: shop.id, payment_id: second.id } });
    expect(await eventsOf(made.job.id, 'payment_duplicate')).toHaveLength(1);
  });
});

describe('trade invoices', () => {
  const invoice = (jobId: string, overrides: Overrides = ON, body: unknown = {}) =>
    callWith(overrides, `/api/workspace/jobs/${jobId}/payments/invoice`, { method: 'POST', cookie, body: JSON.stringify(body) }, APP);

  test('raise a Stripe invoice for the whole order, with no tax, due in the set days', async () => {
    const made = await job({ confirmed: false });
    const sent = stripe();
    const response = await invoice(made.job.id);
    expect(response.status).toBe(201);
    const answer = await json<{ invoiceId: string; hostedInvoiceUrl: string; amountPence: number }>(response);
    const id = answer.invoiceId;
    expect(answer).toMatchObject({ hostedInvoiceUrl: `https://invoice.stripe.com/i/acct_test/${id}`, amountPence: 45_000 });
    expect(sent.map((s) => s.path)).toEqual(['/customers', '/invoices', '/invoiceitems', `/invoices/${id}/finalize`, `/invoices/${id}/send`]);
    expect(new Set(sent.map((s) => s.idempotencyKey)).size).toBe(5);
    const [customer, inv, item] = sent;
    expect(customer.form).toMatchObject({ email: 'oliver@example.test', name: 'Oliver Milton', 'address[country]': 'GB', 'address[postal_code]': 'AL3 5QN' });
    expect(inv.form).toMatchObject({
      customer: 'cus_test_trade',
      currency: 'gbp',
      collection_method: 'send_invoice',
      days_until_due: '14',
      'metadata[payment_kind]': 'full',
      'metadata[job_ref]': made.job.reference,
    });
    expect(inv.form.description).toContain(made.job.reference);
    expect(item.form).toMatchObject({ invoice: id, amount: '45000', currency: 'gbp' });
    for (const call of sent) expect(Object.keys(call.form).filter((k) => /tax|payment_method_types/.test(k))).toEqual([]);
    const [row] = await paymentsOf(made.job.id);
    expect(row).toMatchObject({ kind: 'invoice', method: 'invoice', status: 'open', stripe_invoice_id: id, amount_pence: 45_000, tax_behavior: 'none' });
    expect(await eventsOf(made.job.id, 'invoice_created')).toHaveLength(1);
    // The customer's page sends them to the invoice instead of Checkout.
    nothingGoesOut();
    const html = await (await page(made.token)).text();
    expect(html).toContain(`https://invoice.stripe.com/i/acct_test/${id}`);
    expect(html).not.toContain('id="payform"');
  });

  test('send tax only with Stripe Tax on, and bank transfer only when it is on', async () => {
    const made = await job({ quote: { vat_rate_bp: 2000, subtotal_pence: 45_000, vat_pence: 9_000, total_pence: 54_000 } });
    const sent = stripe();
    const response = await invoice(made.job.id, { ...ON, JOB_PAYMENTS_STRIPE_TAX: 'on', JOB_PAYMENTS_TAX_BEHAVIOR: 'exclusive', JOB_PAYMENTS_BANK_TRANSFER: 'on' });
    expect(response.status).toBe(201);
    const inv = sent.find((s) => s.path === '/invoices')!;
    const item = sent.find((s) => s.path === '/invoiceitems')!;
    expect(inv.form).toMatchObject({
      'automatic_tax[enabled]': 'true',
      'payment_settings[payment_method_types][0]': 'card',
      'payment_settings[payment_method_types][1]': 'customer_balance',
      'payment_settings[payment_method_options][customer_balance][funding_type]': 'bank_transfer',
      'payment_settings[payment_method_options][customer_balance][bank_transfer][type]': 'gb_bank_transfer',
    });
    expect(item.form).toMatchObject({ amount: '45000', tax_behavior: 'exclusive', tax_code: 'txcd_99999999' });
  });

  test('refused until the terms are set, for a job with no price, or one already paying', async () => {
    const seen = nothingGoesOut();
    const made = await job();
    expect((await invoice(made.job.id, { ...ON, JOB_PAYMENTS_INVOICE_DAYS: '' })).status).toBe(409);
    expect((await invoice(made.job.id, {})).status).toBe(409);
    const unpriced = await job({ quote: null });
    const refused = await invoice(unpriced.job.id);
    expect(refused.status).toBe(409);
    expect(await json(refused)).toMatchObject({ error: 'no_quote' });
    expect(seen.calls).toBe(0);
    stripe();
    expect((await invoice(made.job.id)).status).toBe(201);
    nothingGoesOut();
    expect((await invoice(made.job.id)).status).toBe(409);
  });

  test('invoice.paid marks it paid; a failure keeps it open; voiding closes it', async () => {
    const made = await job();
    stripe();
    await invoice(made.job.id);
    const id = (await paymentsOf(made.job.id))[0].stripe_invoice_id;
    nothingGoesOut();
    await webhook('invoice.payment_failed', { id, metadata: { company_id: shop.id } });
    expect((await paymentsOf(made.job.id))[0].status).toBe('failed');
    expect(await (await page(made.token)).text()).toContain('View invoice');
    await webhook('invoice.paid', { id, amount_paid: 45_000, total_taxes: [], customer: 'cus_test_trade', payment_intent: 'pi_inv', metadata: { company_id: shop.id } });
    expect((await paymentsOf(made.job.id))[0]).toMatchObject({ status: 'paid', amount_total_pence: 45_000, tax_pence: 0, stripe_payment_intent_id: 'pi_inv' });
    expect(await (await page(made.token)).text()).toContain('Paid in full');

    const other = await job();
    stripe();
    await invoice(other.job.id);
    nothingGoesOut();
    await webhook('invoice.voided', { id: (await paymentsOf(other.job.id))[0].stripe_invoice_id });
    expect((await paymentsOf(other.job.id))[0]).toMatchObject({ status: 'void', hosted_invoice_url: null });
  });
});

describe('the job, for staff', () => {
  test('shows where the payment stands, from Stripe’s messages', async () => {
    const made = await job();
    await paidThroughCheckout(made);
    const response = await callWith(ON, `/api/workspace/jobs/${made.job.id}`, { cookie }, APP);
    const detail = await json<{ payment: { enabled: boolean; stripeTax: boolean; standing: { state: string; paidTotalPence: number }; price: unknown; canInvoice: unknown; payments: Row<'job_payments'>[] } }>(response);
    expect(detail.payment).toMatchObject({ enabled: true, stripeTax: false, standing: { state: 'paid', paidTotalPence: 45_000 }, canInvoice: null });
    expect(detail.payment.payments).toHaveLength(1);
    expect(JSON.stringify(detail.payment)).not.toContain('checkout.stripe.com');
  });

  test('says nothing about payments for a company that does not take them', async () => {
    const made = await job();
    const response = await callWith({}, `/api/workspace/jobs/${made.job.id}`, { cookie }, APP);
    expect((await json<{ payment: unknown }>(response)).payment).toBeNull();
  });

  test('standing counts only what was paid', () => {
    const row = (p: Partial<Row<'job_payments'>>) => ({ amount_pence: 100, amount_total_pence: null, tax_pence: null, amount_refunded_pence: 0, updated_at: '2026-01-01', ...p }) as Row<'job_payments'>;
    expect(standingOf([]).state).toBe('unpaid');
    expect(standingOf([row({ status: 'expired', method: 'checkout' })]).state).toBe('unpaid');
    expect(standingOf([row({ status: 'paid', amount_total_pence: 120 })])).toMatchObject({ state: 'paid', paidTotalPence: 120 });
  });
});
