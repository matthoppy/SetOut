/**
 * Billing: off unless switched on, and, switched on, Stripe's Checkout, its
 * billing portal and its webhook, with a stand-in for Stripe. Nothing here
 * reaches Stripe: every test that would is given a fetch of its own, and any
 * other call out fails the test.
 */
import { env, exports } from 'cloudflare:workers';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { savePlan } from '../src/db/admin';
import { addMember } from '../src/db/auth';
import { standingOf, trialDays } from '../src/lib/billing';
import { createCheckoutSession, formEncode, signStripePayload, StripeError, verifyStripeSignature } from '../src/lib/stripe';
import type { Row } from '../src/db/tables';
import { api, APP, body, callWith, company, DESIGNER, enquire, json, signIn, type Company, type Overrides } from './helpers';

const WEBHOOK_SECRET = 'whsec_test_secret';
const ON: Overrides = { BILLING: 'on', STRIPE_SECRET_KEY: 'sk_test_key', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET };
const DAY = 86_400_000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

interface Sent {
  url: string;
  authorization: string | null;
  form: Record<string, string>;
}

/** Stand in for Stripe: keep what was sent, and answer with this. */
function stripe(answer: unknown = { url: 'https://checkout.stripe.com/c/pay/cs_test_1' }, status = 200): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    sent.push({
      url,
      authorization: new Headers(init.headers).get('authorization'),
      form: Object.fromEntries(new URLSearchParams(init.body as string)),
    });
    return Response.json(answer, { status });
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

let eventNumber = 0;
/** Stripe's webhook, signed as Stripe signs it unless told otherwise. */
async function webhook(type: string, object: Record<string, unknown>, options: { signature?: string | null; id?: string; overrides?: Overrides } = {}) {
  const payload = JSON.stringify({ id: options.id ?? `evt_test${++eventNumber}`, type, data: { object } });
  const signature = options.signature === undefined ? await signStripePayload(WEBHOOK_SECRET, payload, Math.floor(Date.now() / 1000)) : options.signature;
  return callWith(options.overrides ?? ON, '/api/stripe/webhook', {
    method: 'POST',
    body: payload,
    origin: null,
    headers: signature === null ? {} : { 'Stripe-Signature': signature },
  });
}

async function shop(name: string, prefix: string, subscription?: Partial<Row<'subscriptions'>>, plan = 'trial') {
  const made = await company(name, prefix);
  await env.DB.prepare('UPDATE companies SET plan = ? WHERE id = ?').bind(plan, made.id).run();
  const email = `owner@${prefix.toLowerCase()}.example`;
  await addMember(env, made.id, email, 'owner');
  if (subscription) await made.db.insert('subscriptions', { status: 'trialing', ...subscription });
  return { ...made, email, cookie: await signIn(email) };
}
const subscriptionOf = async (c: Company) => (await c.db.find('subscriptions'))[0];

beforeAll(async () => {
  await savePlan(env, { id: 'standard', name: 'Standard', monthlyPricePence: 4900, enquiriesPerMonth: 50, stripePriceId: 'price_standard', offered: true, position: 1 });
  await savePlan(env, { id: 'pro', name: 'Pro', monthlyPricePence: 9900, enquiriesPerMonth: null, stripePriceId: 'price_pro', offered: true, position: 2 });
  await savePlan(env, { id: 'hidden', name: 'Hidden', monthlyPricePence: 100, enquiriesPerMonth: null, stripePriceId: 'price_hidden', offered: false, position: 3 });
});

beforeEach(() => void nothingGoesOut());
afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------

describe('switched off, as it is everywhere', () => {
  test('there are no billing routes, no webhook, and nothing calls Stripe', async () => {
    const out = nothingGoesOut();
    const s = await shop('Off Glass', 'OFF', { trial_ends_at: inDays(-30) });
    expect((await api('/billing', { cookie: s.cookie })).status).toBe(404);
    expect((await api('/billing/checkout', { cookie: s.cookie, method: 'POST', body: body({ planId: 'standard' }) })).status).toBe(404);
    expect((await api('/billing/portal', { cookie: s.cookie, method: 'POST', body: '{}' })).status).toBe(404);

    // Even with the keys set, and a message Stripe really signed.
    const keysOnly = { STRIPE_SECRET_KEY: 'sk_test_key', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET };
    const response = await webhook('customer.subscription.updated', { id: 'sub_off', customer: 'cus_off', status: 'active' }, { overrides: keysOnly });
    expect(response.status).toBe(404);
    expect((await callWith(keysOnly, '/api/workspace/billing', { cookie: s.cookie })).status).toBe(404);
    expect(out.calls).toBe(0);
  });

  test('no company is locked, whatever its subscription says', async () => {
    const s = await shop('Unlocked Glass', 'UNL', { status: 'canceled' });
    expect((await api('/jobs', { cookie: s.cookie })).status).toBe(200);
    expect(await json(await api('/me', { cookie: s.cookie }))).not.toHaveProperty('billing');
  });

  test.each(['', 'off', 'ON', 'true', '1'])('BILLING "%s" is off', async (value) => {
    const s = await shop(`Value Glass ${value}`, `V${value.length}${value.charCodeAt(0) || 0}`.slice(0, 6));
    expect((await callWith({ ...ON, BILLING: value }, '/api/workspace/billing', { cookie: s.cookie })).status).toBe(404);
  });
});

describe('where a company stands', () => {
  const sub = (changes: Partial<Row<'subscriptions'>>) =>
    ({ status: 'trialing', stripe_subscription_id: null, trial_ends_at: null, ...changes }) as Row<'subscriptions'>;
  const now = new Date('2026-12-01T12:00:00Z');

  test.each([
    ['a free account', { plan: 'free' }, sub({ status: 'canceled' }), { state: 'free', locked: false }],
    ['a company from before billing', { plan: 'trial' }, null, { state: 'none', locked: false }],
    ['in its trial', { plan: 'trial' }, sub({ trial_ends_at: '2026-12-04T12:00:00Z' }), { state: 'trial', locked: false, trialDaysLeft: 3 }],
    ['on the trial’s last day', { plan: 'trial' }, sub({ trial_ends_at: '2026-12-01T18:00:00Z' }), { state: 'trial', locked: false, trialDaysLeft: 1 }],
    ['after its trial with no plan', { plan: 'trial' }, sub({ trial_ends_at: '2026-12-01T11:59:00Z' }), { state: 'trial_ended', locked: true }],
    [
      'after its trial with a card on file, before Stripe has said it was charged',
      { plan: 'standard' },
      sub({ trial_ends_at: '2026-12-01T11:59:00Z', stripe_subscription_id: 'sub_1' }),
      { state: 'trial', locked: false, trialDaysLeft: 0 },
    ],
    ['paying', { plan: 'standard' }, sub({ status: 'active' }), { state: 'active', locked: false }],
    ['with a payment that failed', { plan: 'standard' }, sub({ status: 'past_due' }), { state: 'past_due', locked: false }],
    ['once Stripe has given up', { plan: 'standard' }, sub({ status: 'unpaid' }), { state: 'ended', locked: true }],
    ['cancelled', { plan: 'standard' }, sub({ status: 'canceled' }), { state: 'ended', locked: true }],
  ])('%s', (_, c, subscription, standing) => {
    expect(standingOf(c, subscription, now)).toEqual(standing);
  });

  test('a trial is 14 days unless TRIAL_DAYS is a sensible number', () => {
    expect(trialDays({ TRIAL_DAYS: '30' })).toBe(30);
    for (const value of ['', '0', '-3', '1.5', 'a fortnight', '4000']) expect(trialDays({ TRIAL_DAYS: value })).toBe(14);
  });
});

describe('a locked company', () => {
  test('can sign in and reach billing, and nothing else, while its designer keeps working', async () => {
    const s = await shop('Lapsed Glass', 'LAP', { trial_ends_at: inDays(-1) });
    const on = (path: string, init = {}) => callWith(ON, `/api/workspace${path}`, { cookie: s.cookie, ...init });

    for (const path of ['/jobs', '/team', '/settings', '/jobs/job_x', '/files/fil_x']) {
      const response = await on(path);
      expect(response.status, path).toBe(402);
      expect(await json(response)).toMatchObject({ error: 'payment_needed' });
    }
    expect((await on('/team', { method: 'POST', body: body({ email: 'new@lap.example' }) })).status).toBe(402);

    const me = await on('/me');
    expect(me.status).toBe(200);
    expect(await json(me)).toMatchObject({ billing: { state: 'trial_ended', locked: true } });
    expect((await on('/billing')).status).toBe(200);
    expect((await on('/sign-out', { method: 'POST', body: '{}' })).status).toBe(200);

    // A customer's design still arrives, and is counted.
    const reference = await enquire(s, 'Hal Homeowner', 'hal@example.test', 'LS1 1AA');
    expect(reference).toBe('LAP-1001');
    expect(await s.db.count('jobs')).toBe(1);
  });

  test('is the only one locked', async () => {
    const lapsed = await shop('Other Lapsed Glass', 'OLG', { status: 'unpaid', stripe_customer_id: 'cus_olg', stripe_subscription_id: 'sub_olg' });
    const trialing = await shop('Trialing Glass', 'TRG', { trial_ends_at: inDays(5) });
    const free = await shop('Free Glass', 'FRG', { status: 'canceled' }, 'free');
    const before = await shop('Before Billing Glass', 'BBG');
    expect((await callWith(ON, '/api/workspace/jobs', { cookie: lapsed.cookie })).status).toBe(402);
    for (const s of [trialing, free, before]) expect((await callWith(ON, '/api/workspace/jobs', { cookie: s.cookie })).status).toBe(200);
    expect(await json(await callWith(ON, '/api/workspace/me', { cookie: trialing.cookie }))).toMatchObject({ billing: { state: 'trial', trialDaysLeft: 5 } });
  });
});

describe('the billing page', () => {
  test('says where the company stands, what it has used, and the plans that can be paid for', async () => {
    const s = await shop('Page Glass', 'PGE', { trial_ends_at: inDays(9) });
    await enquire(s, 'Una User', 'una@example.test', 'B1 1AA');
    const billing = await json<{
      canChange: boolean;
      standing: unknown;
      plan: unknown;
      subscription: Record<string, unknown>;
      usage: { enquiries: number };
      plans: { id: string }[];
    }>(await callWith(ON, '/api/workspace/billing', { cookie: s.cookie }));
    expect(billing.canChange).toBe(true);
    expect(billing.standing).toEqual({ state: 'trial', locked: false, trialDaysLeft: 9 });
    expect(billing.plan).toBeNull();
    expect(billing.subscription).toMatchObject({ status: 'trialing', withStripe: false });
    expect(billing.usage.enquiries).toBe(1);
    expect(billing.plans).toEqual([
      { id: 'standard', name: 'Standard', monthlyPricePence: 4900, enquiriesPerMonth: 50 },
      { id: 'pro', name: 'Pro', monthlyPricePence: 9900, enquiriesPerMonth: null },
    ]);
    // Stripe's ids stay on the server.
    expect(JSON.stringify(billing)).not.toMatch(/price_|cus_|sub_/);
  });
});

describe('Checkout', () => {
  test('sends the owner to Stripe for the plan chosen, with the company named and the trial carried over', async () => {
    const trialEndsAt = inDays(9);
    const s = await shop('Checkout Glass', 'CHK', { trial_ends_at: trialEndsAt });
    const sent = stripe();
    const response = await callWith(ON, '/api/workspace/billing/checkout', { cookie: s.cookie, method: 'POST', body: body({ planId: 'standard' }) });
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_1' });

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(sent[0].authorization).toBe('Bearer sk_test_key');
    expect(sent[0].form).toEqual({
      mode: 'subscription',
      client_reference_id: s.id,
      customer_email: s.email,
      'line_items[0][price]': 'price_standard',
      'line_items[0][quantity]': '1',
      'metadata[company_id]': s.id,
      'subscription_data[metadata][company_id]': s.id,
      'subscription_data[trial_end]': String(Math.floor(Date.parse(trialEndsAt) / 1000)),
      success_url: `${APP}/billing?paid=1`,
      cancel_url: `${APP}/billing`,
    });
  });

  test('a company Stripe already knows is sent as that customer, and a trial that is over is not given again', async () => {
    const s = await shop('Returning Glass', 'RET', { trial_ends_at: inDays(-3), stripe_customer_id: 'cus_returning' });
    const sent = stripe();
    await callWith(ON, '/api/workspace/billing/checkout', { cookie: s.cookie, method: 'POST', body: body({ planId: 'pro' }) });
    expect(sent[0].form.customer).toBe('cus_returning');
    expect(sent[0].form).not.toHaveProperty('customer_email');
    expect(sent[0].form).not.toHaveProperty('subscription_data[trial_end]');
    expect(sent[0].form['line_items[0][price]']).toBe('price_pro');
  });

  test('only an owner can pay, and only for a plan on offer', async () => {
    const s = await shop('Roles Glass', 'ROL', { trial_ends_at: inDays(5) });
    await addMember(env, s.id, 'staff@rol.example', 'staff');
    const staff = await signIn('staff@rol.example');
    const out = nothingGoesOut();
    const pay = (cookie: string, planId: unknown) => callWith(ON, '/api/workspace/billing/checkout', { cookie, method: 'POST', body: body({ planId }) });
    expect((await pay(staff, 'standard')).status).toBe(403);
    for (const planId of ['hidden', 'free', 'trial', 'nope', null, 'price_standard']) expect((await pay(s.cookie, planId)).status).toBe(400);
    expect(out.calls).toBe(0);
  });

  test('a company that already pays is sent to manage its plan, not charged twice', async () => {
    const s = await shop('Paying Glass', 'PYG', { status: 'active', stripe_customer_id: 'cus_pyg', stripe_subscription_id: 'sub_pyg' });
    const out = nothingGoesOut();
    const response = await callWith(ON, '/api/workspace/billing/checkout', { cookie: s.cookie, method: 'POST', body: body({ planId: 'pro' }) });
    expect(response.status).toBe(409);
    expect(out.calls).toBe(0);
  });

  test('without Stripe’s key it says billing is not set up, and with Stripe refusing it says so plainly', async () => {
    const s = await shop('Keyless Glass', 'KEY', { trial_ends_at: inDays(5) });
    const noKey = await callWith({ BILLING: 'on' }, '/api/workspace/billing/checkout', { cookie: s.cookie, method: 'POST', body: body({ planId: 'standard' }) });
    expect(noKey.status).toBe(503);

    stripe({ error: { message: 'No such price: price_standard; sk_test_key' } }, 400);
    const refused = await callWith(ON, '/api/workspace/billing/checkout', { cookie: s.cookie, method: 'POST', body: body({ planId: 'standard' }) });
    expect(refused.status).toBe(502);
    // Stripe's own words, and the key, are for the log and never the page.
    expect(await refused.text()).not.toMatch(/No such price|sk_test/);
  });

  test('nothing but an https page from Stripe is passed on', async () => {
    await expect(createCheckoutSession('sk', { priceId: 'p', companyId: 'c', customerId: null, email: 'a@b.c', trialEndsAt: null, successUrl: 's', cancelUrl: 'c' }, async () => Response.json({ url: 'javascript:alert(1)' }))).rejects.toThrow(StripeError);
  });

  test('a form is written the way Stripe reads it', () => {
    expect(formEncode({ a: 1, b: { c: 'x', d: null }, e: [{ f: true }, { f: false }], g: undefined }).toString()).toBe('a=1&b%5Bc%5D=x&e%5B0%5D%5Bf%5D=true&e%5B1%5D%5Bf%5D=false');
  });
});

describe('the billing portal', () => {
  test('opens Stripe’s page for the company’s own customer', async () => {
    const s = await shop('Portal Glass', 'POR', { status: 'active', stripe_customer_id: 'cus_portal', stripe_subscription_id: 'sub_portal' });
    const sent = stripe({ url: 'https://billing.stripe.com/p/session/test_1' });
    const response = await callWith(ON, '/api/workspace/billing/portal', { cookie: s.cookie, method: 'POST', body: '{}' });
    expect(await json(response)).toEqual({ ok: true, url: 'https://billing.stripe.com/p/session/test_1' });
    expect(sent[0].url).toBe('https://api.stripe.com/v1/billing_portal/sessions');
    expect(sent[0].form).toEqual({ customer: 'cus_portal', return_url: `${APP}/billing` });
  });

  test('a company can never open another’s: the customer comes from its own record, not the request', async () => {
    const mine = await shop('Mine Glass', 'MIN', { trial_ends_at: inDays(5) });
    await shop('Yours Glass', 'YRS', { status: 'active', stripe_customer_id: 'cus_yours', stripe_subscription_id: 'sub_yours' });
    const out = nothingGoesOut();
    const response = await callWith(ON, '/api/workspace/billing/portal', { cookie: mine.cookie, method: 'POST', body: body({ customer: 'cus_yours', customerId: 'cus_yours' }) });
    expect(response.status).toBe(409);
    expect(out.calls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The webhook
// ---------------------------------------------------------------------------

describe('a webhook’s signature', () => {
  const payload = '{"id":"evt_1","type":"invoice.paid"}';
  const at = 1_800_000_000;

  test('is good when Stripe signed this body with this secret, lately', async () => {
    expect(await verifyStripeSignature('whsec_a', await signStripePayload('whsec_a', payload, at), payload, at + 10)).toBe(true);
  });

  test('matches a signature worked out by hand', async () => {
    // HMAC-SHA256 of "1800000000.{}" with the key "whsec_known".
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec_known'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${at}.{}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(await signStripePayload('whsec_known', '{}', at)).toBe(`t=${at},v1=${mac}`);
    expect(await verifyStripeSignature('whsec_known', `t=${at},v0=ignored,v1=${'0'.repeat(64)},v1=${mac}`, '{}', at)).toBe(true);
  });

  test.each([
    ['another secret', async () => signStripePayload('whsec_b', payload, at), payload, at],
    ['a body changed by one character', async () => signStripePayload('whsec_a', payload, at), payload.replace('paid', 'pain'), at],
    ['a message six minutes old', async () => signStripePayload('whsec_a', payload, at), payload, at + 360],
    ['a message dated six minutes ahead', async () => signStripePayload('whsec_a', payload, at), payload, at - 360],
    ['a time changed after signing', async () => (await signStripePayload('whsec_a', payload, at)).replace(String(at), String(at + 1)), payload, at],
    ['no signature', async () => `t=${at}`, payload, at],
    ['no time', async () => (await signStripePayload('whsec_a', payload, at)).replace(/^t=\d+,/, ''), payload, at],
    ['nonsense', async () => 'hello', payload, at],
    ['an empty header', async () => '', payload, at],
  ])('is bad with %s', async (_, header, signed, now) => {
    expect(await verifyStripeSignature('whsec_a', await header(), signed, now)).toBe(false);
  });

  test('is bad with no header, or with no secret to check it by', async () => {
    const good = await signStripePayload('whsec_a', payload, at);
    expect(await verifyStripeSignature('whsec_a', null, payload, at)).toBe(false);
    expect(await verifyStripeSignature(undefined, good, payload, at)).toBe(false);
    expect(await verifyStripeSignature('', good, payload, at)).toBe(false);
  });
});

describe('Stripe’s webhook', () => {
  test('a message that is not signed, or is signed by someone else, changes nothing', async () => {
    const s = await shop('Unsigned Glass', 'UNS', { trial_ends_at: inDays(5), stripe_customer_id: 'cus_unsigned' });
    const before = await subscriptionOf(s);
    const active = { id: 'sub_forged', customer: 'cus_unsigned', status: 'canceled' };
    const forged = await signStripePayload('whsec_someone_else', JSON.stringify({ id: 'evt_forged', type: 'customer.subscription.deleted', data: { object: active } }), Math.floor(Date.now() / 1000));
    for (const signature of [null, '', 't=1,v1=abc', forged]) {
      const response = await webhook('customer.subscription.deleted', active, { signature, id: 'evt_forged' });
      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({ error: 'bad_signature' });
    }
    expect(await subscriptionOf(s)).toEqual(before);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM stripe_events WHERE id = 'evt_forged'").first()).toEqual({ n: 0 });
  });

  test('without its secret set, nothing is accepted', async () => {
    const response = await webhook('invoice.paid', { customer: 'cus_x' }, { overrides: { BILLING: 'on', STRIPE_SECRET_KEY: 'sk_test_key' } });
    expect(response.status).toBe(503);
  });

  test('it answers on the workspace’s address only', async () => {
    const response = await exports.default.fetch(`${DESIGNER}/api/stripe/webhook`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(404);
  });

  test('Checkout finishing ties the company to its Stripe customer, and the subscription that follows sets its plan', async () => {
    const s = await shop('Subscribing Glass', 'SUB', { trial_ends_at: inDays(5) });
    const done = await webhook('checkout.session.completed', {
      mode: 'subscription',
      client_reference_id: s.id,
      metadata: { company_id: s.id },
      customer: 'cus_subscribing',
      subscription: 'sub_subscribing',
    });
    expect(await json(done)).toEqual({ ok: true, handled: 'recorded' });
    expect(await subscriptionOf(s)).toMatchObject({ stripe_customer_id: 'cus_subscribing', stripe_subscription_id: 'sub_subscribing', status: 'trialing' });

    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86_400;
    await webhook('customer.subscription.updated', {
      id: 'sub_subscribing',
      customer: 'cus_subscribing',
      status: 'active',
      cancel_at_period_end: false,
      trial_end: null,
      // Where newer versions of Stripe's API put the period's end.
      items: { data: [{ price: { id: 'price_pro' }, current_period_end: periodEnd }] },
    });
    expect(await subscriptionOf(s)).toMatchObject({
      status: 'active',
      plan_id: 'pro',
      cancel_at_period_end: 0,
      trial_ends_at: null,
      current_period_ends_at: new Date(periodEnd * 1000).toISOString(),
    });
    expect((await s.db.company())?.plan).toBe('pro');
    expect(await s.db.count('subscriptions')).toBe(1);
    expect(await json(await callWith(ON, '/api/workspace/me', { cookie: s.cookie }))).toMatchObject({ billing: { state: 'active', locked: false } });
  });

  test('the subscription arriving before Checkout’s own message still finds its company', async () => {
    const s = await shop('Early Glass', 'ERL', { trial_ends_at: inDays(5) });
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86_400;
    await webhook('customer.subscription.created', {
      id: 'sub_early',
      customer: 'cus_early',
      status: 'trialing',
      metadata: { company_id: s.id },
      trial_end: periodEnd,
      // Where older versions put it.
      current_period_end: periodEnd,
      items: { data: [{ price: 'price_standard' }] },
    });
    expect(await subscriptionOf(s)).toMatchObject({
      stripe_customer_id: 'cus_early',
      stripe_subscription_id: 'sub_early',
      plan_id: 'standard',
      trial_ends_at: new Date(periodEnd * 1000).toISOString(),
      current_period_ends_at: new Date(periodEnd * 1000).toISOString(),
    });
  });

  test('a message delivered twice is handled once', async () => {
    const s = await shop('Twice Glass', 'TWI', { status: 'active', stripe_customer_id: 'cus_twice', stripe_subscription_id: 'sub_twice' });
    const failed = await webhook('invoice.payment_failed', { customer: 'cus_twice' }, { id: 'evt_twice' });
    expect(await json(failed)).toEqual({ ok: true, handled: 'recorded' });
    const first = (await subscriptionOf(s)).payment_failed_at;
    expect(first).not.toBeNull();
    await webhook('invoice.paid', { customer: 'cus_twice' });
    expect((await subscriptionOf(s)).payment_failed_at).toBeNull();
    // Stripe sends the failure again, late. It is not acted on a second time.
    const again = await webhook('invoice.payment_failed', { customer: 'cus_twice' }, { id: 'evt_twice' });
    expect(await json(again)).toEqual({ ok: true, handled: 'already' });
    expect((await subscriptionOf(s)).payment_failed_at).toBeNull();
  });

  test('a failed payment is recorded, the owners are emailed, and nothing is locked while Stripe tries again', async () => {
    const s = await shop('Failing Glass', 'FAI', { status: 'active', stripe_customer_id: 'cus_failing', stripe_subscription_id: 'sub_failing' });
    await addMember(env, s.id, 'staff@fai.example', 'staff');
    const mail: { to: string[]; subject: string; html: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.resend.com/emails');
      mail.push(JSON.parse(init.body as string) as (typeof mail)[number]);
      return new Response('{}');
    });
    const mailed = { ...ON, RESEND_API_KEY: 're_test', EMAIL_FROM: 'hello@setout.example' };
    await webhook('invoice.payment_failed', { customer: 'cus_failing', subscription: 'sub_failing' }, { overrides: mailed });
    await webhook('customer.subscription.updated', { id: 'sub_failing', customer: 'cus_failing', status: 'past_due' }, { overrides: mailed });

    expect(mail).toHaveLength(1);
    expect(mail[0].to).toEqual([s.email]);
    expect(mail[0].subject).toBe('A payment for Failing Glass did not go through');
    expect(mail[0].html).toContain(`${APP}/billing`);
    expect(await subscriptionOf(s)).toMatchObject({ status: 'past_due' });
    expect((await subscriptionOf(s)).payment_failed_at).not.toBeNull();
    vi.unstubAllGlobals();
    expect(await json(await callWith(ON, '/api/workspace/me', { cookie: s.cookie }))).toMatchObject({ billing: { state: 'past_due', locked: false } });
    expect((await callWith(ON, '/api/workspace/jobs', { cookie: s.cookie })).status).toBe(200);

    // Stripe gives up: the workspace locks.
    await webhook('customer.subscription.updated', { id: 'sub_failing', customer: 'cus_failing', status: 'unpaid' });
    expect((await callWith(ON, '/api/workspace/jobs', { cookie: s.cookie })).status).toBe(402);
    // The card is fixed and the invoice paid: it opens again.
    await webhook('customer.subscription.updated', { id: 'sub_failing', customer: 'cus_failing', status: 'active' });
    expect((await callWith(ON, '/api/workspace/jobs', { cookie: s.cookie })).status).toBe(200);
    expect((await subscriptionOf(s)).payment_failed_at).toBeNull();
  });

  test('a cancelled subscription ends, and an older one ending does not undo a newer one', async () => {
    const s = await shop('Cancelling Glass', 'CAN', { status: 'active', stripe_customer_id: 'cus_cancel', stripe_subscription_id: 'sub_new' });
    await webhook('customer.subscription.deleted', { id: 'sub_old', customer: 'cus_cancel', status: 'canceled' });
    expect((await subscriptionOf(s)).status).toBe('active');
    await webhook('customer.subscription.updated', { id: 'sub_new', customer: 'cus_cancel', status: 'active', cancel_at_period_end: true });
    expect(await subscriptionOf(s)).toMatchObject({ status: 'active', cancel_at_period_end: 1 });
    await webhook('customer.subscription.deleted', { id: 'sub_new', customer: 'cus_cancel', status: 'canceled' });
    expect((await subscriptionOf(s)).status).toBe('canceled');
  });

  test('a message about a customer SetOut does not know changes nothing', async () => {
    const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM subscriptions').first<{ n: number }>();
    for (const [type, object] of [
      ['invoice.payment_failed', { customer: 'cus_stranger' }],
      ['customer.subscription.updated', { id: 'sub_stranger', customer: 'cus_stranger', status: 'active' }],
      ['customer.subscription.updated', { id: 'sub_stranger', customer: 'cus_stranger', status: 'active', metadata: { company_id: 'co_00000000000000000000000000' } }],
      ['customer.subscription.updated', { id: 'sub_stranger', customer: 'cus_stranger', status: 'active', metadata: { company_id: "x' OR 1=1 --" } }],
      ['charge.succeeded', { customer: 'cus_stranger' }],
    ] as const) {
      expect(await json(await webhook(type, object))).toEqual({ ok: true, handled: 'ignored' });
    }
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM subscriptions').first()).toEqual(before);
  });

  test('one company’s payment can never be tied to another', async () => {
    const victim = await shop('Victim Glass', 'VIC', { status: 'active', stripe_customer_id: 'cus_victim', stripe_subscription_id: 'sub_victim' });
    const other = await shop('Other Glass', 'OTH', { trial_ends_at: inDays(5) });
    const before = await subscriptionOf(victim);

    // A checkout that names a company without SetOut's own mark on it, as a
    // payment link made by hand in Stripe could.
    await webhook('checkout.session.completed', { mode: 'subscription', client_reference_id: victim.id, customer: 'cus_attacker', subscription: 'sub_attacker' });
    await webhook('checkout.session.completed', { mode: 'subscription', client_reference_id: victim.id, metadata: { company_id: other.id }, customer: 'cus_attacker', subscription: 'sub_attacker' });
    // One that names a company which already has a different customer.
    await webhook('checkout.session.completed', { mode: 'subscription', client_reference_id: victim.id, metadata: { company_id: victim.id }, customer: 'cus_attacker', subscription: 'sub_attacker' });
    // A subscription for a new customer that names the victim.
    await webhook('customer.subscription.updated', { id: 'sub_attacker', customer: 'cus_attacker', status: 'canceled', metadata: { company_id: victim.id } });
    expect(await subscriptionOf(victim)).toEqual(before);

    // And the victim's customer cannot be given to someone else.
    const taken = await webhook('checkout.session.completed', { mode: 'subscription', client_reference_id: other.id, metadata: { company_id: other.id }, customer: 'cus_victim', subscription: 'sub_x' });
    expect(await json(taken)).toEqual({ ok: true, handled: 'ignored' });
    expect((await subscriptionOf(other)).stripe_customer_id).toBeNull();
    expect(await subscriptionOf(victim)).toEqual(before);
  });

  test.each(['not json', '[]', '{"id":"evt_x"}', '{"id":"nope","type":"invoice.paid","data":{"object":{}}}', '{"id":"evt_x","type":"invoice.paid","data":{}}'])(
    'a signed body that is not one of Stripe’s messages is refused: %s',
    async (payload) => {
      const response = await callWith(ON, '/api/stripe/webhook', {
        method: 'POST',
        body: payload,
        origin: null,
        headers: { 'Stripe-Signature': await signStripePayload(WEBHOOK_SECRET, payload, Math.floor(Date.now() / 1000)) },
      });
      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({ error: 'invalid_event' });
    }
  );
});
