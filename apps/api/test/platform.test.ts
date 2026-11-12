/**
 * The platform admin: SetOut's own staff, and nobody else, looking after
 * every company. Who they are is a setting on the server. No company can
 * make itself one.
 */
import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { addMember } from '../src/db/auth';
import { companyDb } from '../src/db/company-db';
import { isPlatformAdmin } from '../src/lib/sign-up';
import { api, APP, body, callWith, company, DESIGNER, enquire, json, post, signIn, type Company, type Overrides } from './helpers';

const ADMINS: Overrides = { PLATFORM_ADMINS: 'matt@setout.example, Second@SetOut.example' };

let ours: Company;
let theirs: Company;
let admin: string;
let owner: string;
let rival: string;

/** A call to the platform's routes, on a deploy whose admins are the two above. */
const platform = (path: string, cookie: string | undefined, init: Parameters<typeof callWith>[2] = {}, overrides: Overrides = ADMINS, host = APP) =>
  callWith(overrides, `/api/platform${path}`, { ...init, cookie }, host);

interface Listed {
  companies: {
    id: string;
    name: string;
    status: string;
    plan: string;
    openedVia: string;
    owners: { email: string }[];
    people: number;
    designers: { siteKey: string; websites: string[] }[];
    usage: { month: string; enquiries: number; quotesSent: number }[];
    subscription: { status: string; trialEndsAt: string | null; withStripe: boolean } | null;
  }[];
  plans: { id: string; name: string; monthlyPricePence: number; stripePriceId: string | null; offered: boolean }[];
  switches: Record<string, unknown>;
}
const list = async () => json<Listed>(await platform('/companies', admin));
const find = async (id: string) => (await list()).companies.find((c) => c.id === id);

beforeAll(async () => {
  ours = await company('Custom Showers', 'CS');
  theirs = await company('Brennan Glass', 'BG');
  // SetOut's own staff sign in the way everyone does, so are on a team.
  await addMember(env, ours.id, 'matt@setout.example', 'owner');
  await addMember(env, ours.id, 'owner@cs.example', 'owner');
  await addMember(env, theirs.id, 'owner@bg.example', 'owner');
  await enquire(ours, 'Asha Patel', 'asha@example.test', 'SW1A 1AA');
  await enquire(theirs, 'Dan Theirs', 'dan@example.test', 'SW15 1AA');
  admin = await signIn('matt@setout.example');
  owner = await signIn('owner@cs.example');
  rival = await signIn('owner@bg.example');
});

// ---------------------------------------------------------------------------

describe('who is a platform admin', () => {
  test('the list is read however it is typed, and an empty list is nobody', () => {
    expect(isPlatformAdmin(ADMINS, 'matt@setout.example')).toBe(true);
    expect(isPlatformAdmin(ADMINS, 'second@setout.example')).toBe(true);
    expect(isPlatformAdmin(ADMINS, 'owner@cs.example')).toBe(false);
    expect(isPlatformAdmin({ PLATFORM_ADMINS: '' }, '')).toBe(false);
    expect(isPlatformAdmin({}, 'matt@setout.example')).toBe(false);
    // Part of an address, or an address with one inside it, is not a match.
    expect(isPlatformAdmin({ PLATFORM_ADMINS: 'matt@setout.example' }, 'att@setout.example')).toBe(false);
    expect(isPlatformAdmin({ PLATFORM_ADMINS: 'matt@setout.example' }, 'xmatt@setout.example')).toBe(false);
  });

  const ROUTES: [string, string, unknown][] = [
    ['GET', '/companies', undefined],
    ['POST', '/companies', { name: 'Sneaky Glass', ownerEmail: 'owner@cs.example' }],
    ['PATCH', '/companies/co_x', { status: 'suspended' }],
    ['POST', '/companies/co_x/trial', {}],
    ['PUT', '/plans/standard', { name: 'Standard', monthlyPricePence: 1, enquiriesPerMonth: null }],
  ];

  test.each(ROUTES)('%s %s answers "not found" to an owner, to someone signed out, and on a deploy with no admins', async (method, path, sent) => {
    const init = { method, ...(sent ? { body: body(sent) } : {}) };
    for (const response of [
      await platform(path.replace('co_x', theirs.id), owner, init),
      await platform(path.replace('co_x', theirs.id), undefined, init),
      await platform(path.replace('co_x', theirs.id), admin, init, {}),
      await platform(path.replace('co_x', theirs.id), admin, init, { PLATFORM_ADMINS: '' }),
    ]) {
      expect(response.status).toBe(404);
      expect(await json(response)).toEqual({ error: 'not_found' });
    }
    expect((await theirs.db.company())?.status).toBe('active');
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM companies WHERE name = 'Sneaky Glass'").first()).toEqual({ n: 0 });
  });

  test('nothing a company does makes one of its people an admin', async () => {
    // Putting an admin's address on its team gives the company nothing.
    expect((await post('/team', { email: 'second@setout.example', role: 'owner' }, { cookie: rival })).status).toBe(201);
    expect((await platform('/companies', rival)).status).toBe(404);
    // Nor does anything a request says about itself.
    const claims = { headers: { 'X-Platform-Admin': 'true', 'X-Forwarded-Email': 'matt@setout.example' } };
    expect((await platform('/companies?admin=1&email=matt@setout.example', rival, claims)).status).toBe(404);
    expect(await json(await callWith(ADMINS, '/api/workspace/me', { cookie: rival }))).not.toHaveProperty('platformAdmin');
    expect(await json(await callWith(ADMINS, '/api/workspace/me', { cookie: admin }))).toMatchObject({ platformAdmin: true });
    // On a deploy that does not list them, the same person is nobody special.
    expect(await json(await api('/me', { cookie: admin }))).not.toHaveProperty('platformAdmin');
  });

  test('the routes answer on the workspace’s address only, and a change must come from its pages', async () => {
    expect((await platform('/companies', admin, {}, ADMINS, DESIGNER)).status).toBe(404);
    const elsewhere = await platform(`/companies/${theirs.id}`, admin, { method: 'PATCH', body: body({ status: 'suspended' }), origin: 'https://evil.example' });
    expect(elsewhere.status).toBe(403);
    expect((await theirs.db.company())?.status).toBe('active');
  });
});

describe('every company', () => {
  test('is listed with its owners, designers and usage, and nothing of its customers', async () => {
    const response = await platform('/companies', admin);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const text = await response.clone().text();
    const listed = await json<Listed>(response);

    const cs = listed.companies.find((c) => c.id === ours.id);
    expect(cs).toMatchObject({ name: 'Custom Showers', status: 'active', plan: 'free', openedVia: 'seed', subscription: null });
    expect(cs?.owners.map((o) => o.email)).toEqual(['matt@setout.example', 'owner@cs.example']);
    expect(cs?.designers).toEqual([expect.objectContaining({ siteKey: ours.siteKey, websites: [] })]);
    expect(cs?.usage[0]).toMatchObject({ month: new Date().toISOString().slice(0, 7), enquiries: 1, quotesSent: 0 });
    expect(cs?.usage).toHaveLength(2);

    for (const secret of ['Asha Patel', 'asha@example.test', 'Dan Theirs', 'SW1A 1AA']) expect(text).not.toContain(secret);
    expect(listed.plans.map((p) => p.id)).toEqual(['free']);
    expect(listed.switches).toMatchObject({ signUps: true, billing: false, trialDays: 14, stripeKey: false, stripeWebhookSecret: false });
  });

  test('the switches say whether each secret is set, never what it is', async () => {
    const response = await platform('/companies', admin, {}, { ...ADMINS, STRIPE_SECRET_KEY: 'sk_test_verysecret', STRIPE_WEBHOOK_SECRET: 'whsec_verysecret', BILLING: 'on' });
    const text = await response.text();
    expect(text).not.toContain('verysecret');
    expect(JSON.parse(text).switches).toMatchObject({ billing: true, stripeKey: true, stripeWebhookSecret: true });
  });
});

describe('adding a company', () => {
  test('opens it with its owner and designer, as signing up does, and says who did', async () => {
    const response = await platform('/companies', admin, { method: 'POST', body: body({ name: ' Added  Glass ', ownerEmail: 'Owner@Added.Example', ownerName: 'Ada Added' }) });
    expect(response.status).toBe(201);
    const { company: made } = await json<{ company: { id: string; referencePrefix: string; siteKey: string } }>(response);
    expect(made.referencePrefix).toBe('AG');
    expect(made.siteKey).toMatch(/^pk_test_/);

    const db = companyDb(env, made.id);
    expect(await db.company()).toMatchObject({ name: 'Added Glass', plan: 'free', status: 'active', settings: { setUp: { done: false } } });
    expect((await db.find('designers'))[0]).toMatchObject({ site_key: made.siteKey, notify_emails: ['owner@added.example'] });
    const opened = (await db.find('audit_log')).find((a) => a.action === 'company_opened');
    const me = await json<{ user: { id: string } }>(await api('/me', { cookie: admin }));
    expect(opened).toMatchObject({ actor_id: me.user.id, data: { via: 'setout', owner: 'owner@added.example', plan: 'free' } });
    expect((await find(made.id))?.openedVia).toBe('setout');

    // Its owner signs in like anyone else, into their own company.
    const cookie = await signIn('owner@added.example');
    expect((await json<{ company: { name: string }; role: string }>(await api('/me', { cookie })))).toMatchObject({ company: { name: 'Added Glass' }, role: 'owner' });
    expect((await platform('/companies', cookie)).status).toBe(404);
  });

  test.each([
    [{ name: '', ownerEmail: 'a@b.example' }, 'invalid_name'],
    [{ name: 'No Owner Glass', ownerEmail: 'nope' }, 'invalid_email'],
    [{ name: 'No Plan Glass', ownerEmail: 'a@b.example', plan: 'gold' }, 'no_such_plan'],
    [{ name: 'Bad Prefix Glass', ownerEmail: 'a@b.example', referencePrefix: 'toolongprefix' }, 'invalid_request'],
    [{ name: 'Taken Prefix Glass', ownerEmail: 'a@b.example', referencePrefix: 'cs' }, 'invalid_request'],
  ])('%j is refused and makes nothing', async (sent, error) => {
    const response = await platform('/companies', admin, { method: 'POST', body: body(sent) });
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ error });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM companies WHERE name = ?').bind(sent.name).first()).toEqual({ n: 0 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'a@b.example'").first()).toEqual({ n: 0 });
  });
});

describe('switching a company off', () => {
  test('stops its designer, signs its staff out and keeps them out, and goes in its audit log', async () => {
    const shop = await company('Switched Glass', 'SWG');
    await addMember(env, shop.id, 'owner@swg.example', 'owner');
    const cookie = await signIn('owner@swg.example');
    expect((await exports.default.fetch(`${DESIGNER}/api/designer/config?key=${shop.siteKey}`)).status).toBe(200);

    const off = await platform(`/companies/${shop.id}`, admin, { method: 'PATCH', body: body({ status: 'suspended', reason: 'Asked to close' }) });
    expect(off.status).toBe(200);
    expect((await find(shop.id))?.status).toBe('suspended');

    expect((await exports.default.fetch(`${DESIGNER}/api/designer/config?key=${shop.siteKey}`)).status).toBe(404);
    expect((await api('/me', { cookie })).status).toBe(401);
    expect(await json(await post('/sign-in', { email: 'owner@swg.example' }))).toEqual({ ok: true });
    const log = await shop.db.find('audit_log');
    expect(log.find((a) => a.action === 'company_switched_off')).toMatchObject({ data: { reason: 'Asked to close', by: 'setout' } });
    // Nothing was deleted.
    expect(await shop.db.count('designers')).toBe(1);
    expect(await shop.db.count('memberships')).toBe(1);

    // Doing it twice changes nothing and records nothing more.
    await platform(`/companies/${shop.id}`, admin, { method: 'PATCH', body: body({ status: 'suspended' }) });
    expect((await shop.db.find('audit_log')).filter((a) => a.action === 'company_switched_off')).toHaveLength(1);

    const on = await platform(`/companies/${shop.id}`, admin, { method: 'PATCH', body: body({ status: 'active' }) });
    expect(on.status).toBe(200);
    expect((await exports.default.fetch(`${DESIGNER}/api/designer/config?key=${shop.siteKey}`)).status).toBe(200);
    // Switching back on signs nobody in: the old session is gone.
    expect((await api('/me', { cookie })).status).toBe(401);
    expect((await api('/me', { cookie: await signIn('owner@swg.example') })).status).toBe(200);
    expect((await shop.db.find('audit_log')).map((a) => a.action)).toContain('company_switched_on');
  });

  test('leaves every other company as it was', async () => {
    expect((await api('/me', { cookie: owner })).status).toBe(200);
    expect((await api('/me', { cookie: rival })).status).toBe(200);
  });

  test.each([[{ status: 'deleted' }], [{ status: 1 }], [{}], [{ plan: 7 }]])('%j is refused', async (sent) => {
    expect((await platform(`/companies/${theirs.id}`, admin, { method: 'PATCH', body: body(sent) })).status).toBe(400);
    expect((await theirs.db.company())?.status).toBe('active');
  });

  test('a company that does not exist is not found', async () => {
    expect((await platform('/companies/co_nope', admin, { method: 'PATCH', body: body({ status: 'suspended' }) })).status).toBe(404);
    expect((await platform('/companies/co_nope', admin, { method: 'PATCH', body: body({ plan: 'free' }) })).status).toBe(404);
  });
});

describe('plans', () => {
  const put = (id: string, plan: unknown) => platform(`/plans/${id}`, admin, { method: 'PUT', body: body(plan) });
  const standard = { name: 'Standard', monthlyPricePence: 4900, enquiriesPerMonth: 50, stripePriceId: 'price_1Standard', offered: true, position: 1 };

  test('are added and changed by an admin', async () => {
    expect((await put('standard', standard)).status).toBe(200);
    expect((await list()).plans.find((p) => p.id === 'standard')).toMatchObject(standard);
    expect((await put('standard', { ...standard, monthlyPricePence: 5900 })).status).toBe(200);
    const plans = (await list()).plans;
    expect(plans.filter((p) => p.id === 'standard')).toHaveLength(1);
    expect(plans.find((p) => p.id === 'standard')?.monthlyPricePence).toBe(5900);
  });

  test.each([
    ['trial', standard],
    ['Bad Id', standard],
    ['pro', { ...standard, name: '' }],
    ['pro', { ...standard, monthlyPricePence: 49.5 }],
    ['pro', { ...standard, monthlyPricePence: -1 }],
    ['pro', { ...standard, enquiriesPerMonth: 'lots' }],
    ['pro', { ...standard, stripePriceId: 'sk_live_oops' }],
    ['pro', { ...standard, stripePriceId: null, offered: true }],
    // Two plans cannot be charged as one Stripe price.
    ['pro', { ...standard, stripePriceId: 'price_1Standard' }],
  ])('%s %j is refused', async (id, plan) => {
    const response = await put(id, plan);
    expect(response.status).toBe(400);
    expect((await list()).plans.some((p) => p.id === 'pro')).toBe(false);
  });

  test('a company is put on a plan SetOut keeps, and its audit log says so', async () => {
    const moved = await platform(`/companies/${theirs.id}`, admin, { method: 'PATCH', body: body({ plan: 'standard' }) });
    expect(moved.status).toBe(200);
    expect((await theirs.db.company())?.plan).toBe('standard');
    expect((await theirs.db.find('audit_log')).find((a) => a.action === 'plan_changed')).toMatchObject({ data: { from: 'free', to: 'standard', by: 'setout' } });
    expect((await platform(`/companies/${theirs.id}`, admin, { method: 'PATCH', body: body({ plan: 'platinum' }) })).status).toBe(400);
    expect((await theirs.db.company())?.plan).toBe('standard');
    // The other company's plan is untouched.
    expect((await ours.db.company())?.plan).toBe('free');
  });
});

describe('starting a trial', () => {
  test('gives a company with none a trial from today', async () => {
    const shop = await company('Trial Start Glass', 'TSG');
    const response = await platform(`/companies/${shop.id}/trial`, admin, { method: 'POST', body: body({ days: 7 }) });
    expect(response.status).toBe(200);
    const [subscription] = await shop.db.find('subscriptions');
    expect(subscription.status).toBe('trialing');
    expect((Date.parse(subscription.trial_ends_at as string) - Date.now()) / 86_400_000).toBeCloseTo(7, 1);
    expect((await shop.db.find('audit_log')).map((a) => a.action)).toContain('trial_started');
    expect((await find(shop.id))?.subscription).toMatchObject({ status: 'trialing', withStripe: false });

    // Again, it starts afresh: still one subscription.
    await platform(`/companies/${shop.id}/trial`, admin, { method: 'POST', body: body({}) });
    expect(await shop.db.count('subscriptions')).toBe(1);
  });

  test('is refused for a company that already pays through Stripe', async () => {
    const shop = await company('Paying Glass', 'PAY');
    await shop.db.insert('subscriptions', { status: 'active', stripe_customer_id: 'cus_paying', stripe_subscription_id: 'sub_paying' });
    const response = await platform(`/companies/${shop.id}/trial`, admin, { method: 'POST', body: body({}) });
    expect(response.status).toBe(409);
    expect((await shop.db.find('subscriptions'))[0].status).toBe('active');
    expect((await shop.db.find('audit_log')).map((a) => a.action)).not.toContain('trial_started');
  });

  test.each([[{ days: 0 }], [{ days: 366 }], [{ days: 1.5 }], [{ days: '7' }]])('%j is refused', async (sent) => {
    expect((await platform(`/companies/${theirs.id}/trial`, admin, { method: 'POST', body: body(sent) })).status).toBe(400);
  });
});
