/**
 * Signing up: a company opens its own account, and is then a company like
 * any other. It can see and change nothing of anyone else's, and nobody else
 * can see or change anything of its.
 */
import { env, exports } from 'cloudflare:workers';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { addMember, sha256 } from '../src/db/auth';
import { companyDb } from '../src/db/company-db';
import {
  openCompany,
  prefixFrom,
  redeemSignUp,
  requestSignUp,
  SIGNUPS_PER_ADDRESS_PER_HOUR,
  SIGNUPS_PER_IP_PER_HOUR,
} from '../src/db/onboarding';
import { TABLES, type TableName } from '../src/db/tables';
import { signUpEmail } from '../src/lib/sign-up';
import { api, APP, body, callWith, company, DESIGNER, enquire, json, post, sessionFrom, signIn, type Company } from './helpers';

const FORM = { companyName: 'Northern Glass', name: 'Nia Roberts', email: 'nia@northern.example' };

/** Ask to sign up, on a developer's machine, where the link comes back in the answer. */
async function ask(form: Record<string, unknown> = FORM): Promise<string> {
  const response = await post('/sign-up', form);
  expect(response.status).toBe(202);
  const { link } = await json<{ link: string }>(response);
  return new URL(link).searchParams.get('token') as string;
}

/** Sign up and use the link. Answers with the new owner's session and the company's id. */
async function signUp(form: Record<string, unknown>): Promise<{ cookie: string; companyId: string }> {
  const used = await post('/sign-up/verify', { token: await ask(form) });
  expect(used.status).toBe(200);
  const cookie = sessionFrom(used);
  if (!cookie) throw new Error('no session cookie');
  return { cookie, companyId: (await json<{ company: { id: string } }>(used)).company.id };
}

const count = async (sql: string, ...values: unknown[]) => (await env.DB.prepare(sql).bind(...values).first<{ n: number }>())?.n ?? 0;

let old: Company;
let oldOwner: string;
let oldJobId: string;

beforeAll(async () => {
  old = await company('Custom Showers', 'CS');
  await addMember(env, old.id, 'owner@cs.example', 'owner');
  await enquire(old, 'Asha Patel', 'asha@example.test', 'SW1A 1AA');
  oldOwner = await signIn('owner@cs.example');
  oldJobId = (await json<{ jobs: { id: string }[] }>(await api('/jobs', { cookie: oldOwner }))).jobs[0].id;
});

afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------

describe('whether sign-ups are open', () => {
  test('the page is told they are, and how long a link lasts', async () => {
    expect(await json(await api('/sign-up'))).toEqual({ open: true, linkHours: 24 });
  });

  test('closed, the page is told so and nothing can be asked for or used', async () => {
    const closed = { SIGNUPS: 'closed' };
    expect(await json(await callWith(closed, '/api/workspace/sign-up'))).toEqual({ open: false, linkHours: 24 });
    const asked = await callWith(closed, '/api/workspace/sign-up', { method: 'POST', body: body(FORM) });
    expect(asked.status).toBe(403);
    expect(await json(asked)).toMatchObject({ error: 'sign_ups_closed' });

    // A link from before they were closed opens nothing.
    const token = await ask({ ...FORM, email: 'closed@northern.example' });
    const used = await callWith(closed, '/api/workspace/sign-up/verify', { method: 'POST', body: body({ token }) });
    expect(used.status).toBe(403);
    expect(await count("SELECT COUNT(*) AS n FROM users WHERE email = 'closed@northern.example'")).toBe(0);
  });

  test('anything but "open" is closed', async () => {
    expect((await callWith({ SIGNUPS: '' }, '/api/workspace/sign-up', { method: 'POST', body: body(FORM) })).status).toBe(403);
    expect((await callWith({ SIGNUPS: 'yes' }, '/api/workspace/sign-up', { method: 'POST', body: body(FORM) })).status).toBe(403);
  });

  test('the bot check’s public key is given only where the check is set up', async () => {
    const config = await json<{ turnstileSiteKey?: string }>(
      await callWith({ TURNSTILE_SECRET_KEY: 'secret', TURNSTILE_SITE_KEY: '0x4AAA' }, '/api/workspace/sign-up')
    );
    expect(config.turnstileSiteKey).toBe('0x4AAA');
    expect(await json(await callWith({ TURNSTILE_SITE_KEY: '0x4AAA' }, '/api/workspace/sign-up'))).not.toHaveProperty('turnstileSiteKey');
  });

  test('it answers on the workspace’s address only', async () => {
    expect((await exports.default.fetch(`${DESIGNER}/api/workspace/sign-up`)).status).toBe(404);
  });
});

describe('asking to sign up', () => {
  test.each([
    [{ ...FORM, companyName: '' }, 'invalid_company_name'],
    [{ ...FORM, companyName: 'x'.repeat(101) }, 'invalid_company_name'],
    [{ ...FORM, name: '   ' }, 'invalid_name'],
    [{ ...FORM, name: 'Visit https://evil.example now' }, 'invalid_name'],
    [{ ...FORM, email: 'not-an-email' }, 'invalid_email'],
    [{ ...FORM, email: undefined }, 'invalid_email'],
    [[], 'invalid_request'],
  ])('%j is refused', async (form, error) => {
    const response = await post('/sign-up', form);
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ error });
  });

  test('must come from the workspace’s own page', async () => {
    expect((await post('/sign-up', FORM, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await post('/sign-up', FORM, { origin: null })).status).toBe(403);
  });

  test('keeps what was typed and the hash of the link, and makes nothing else', async () => {
    const form = { companyName: '  Pending   Glass ', name: ' Pat  Pending ', email: ' Pat@Pending.Example ' };
    const companies = await count('SELECT COUNT(*) AS n FROM companies');
    const token = await ask(form);
    expect(token).toMatch(/^st_[a-z0-9]{32}$/);

    const rows = await env.DB.prepare("SELECT * FROM signups WHERE email = 'pat@pending.example'").all();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]).toMatchObject({ company_name: 'Pending Glass', person_name: 'Pat Pending', used_at: null, company_id: null });
    expect(rows.results[0].token_hash).toBe(await sha256(token));
    expect(JSON.stringify(rows.results)).not.toContain(token);

    expect(await count('SELECT COUNT(*) AS n FROM companies')).toBe(companies);
    expect(await count("SELECT COUNT(*) AS n FROM users WHERE email = 'pat@pending.example'")).toBe(0);
  });

  test('the answer is the same for an address that already has an account', async () => {
    const response = await callWith({ ENVIRONMENT: 'staging' }, '/api/workspace/sign-up', {
      method: 'POST',
      body: body({ ...FORM, email: 'owner@cs.example' }),
    });
    const fresh = await callWith({ ENVIRONMENT: 'staging' }, '/api/workspace/sign-up', {
      method: 'POST',
      body: body({ ...FORM, email: 'nobody@fresh.example' }),
    });
    expect(response.status).toBe(202);
    expect(await json(response)).toEqual({ ok: true });
    expect(await json(fresh)).toEqual({ ok: true });
  });

  test('a script that fills the hidden field is told it worked, and nothing is kept', async () => {
    const response = await post('/sign-up', { ...FORM, email: 'bot@spam.example', website: 'https://spam.example' });
    expect(response.status).toBe(202);
    expect(await json(response)).toEqual({ ok: true });
    expect(await count("SELECT COUNT(*) AS n FROM signups WHERE email = 'bot@spam.example'")).toBe(0);
  });

  test('where mail is set up, the link is emailed and never in the answer', async () => {
    const sent: { url: string; body: { to: string[]; subject: string; html: string } }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(init.body as string) as { to: string[]; subject: string; html: string } });
      return new Response('{}', { status: 200 });
    });
    const response = await callWith({ ENVIRONMENT: 'staging', RESEND_API_KEY: 're_test', EMAIL_FROM: 'hello@setout.example' }, '/api/workspace/sign-up', {
      method: 'POST',
      body: body({ ...FORM, email: 'mailed@northern.example' }),
    });
    expect(await json(response)).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('https://api.resend.com/emails');
    expect(sent[0].body.to).toEqual(['mailed@northern.example']);
    expect(sent[0].body.html).toMatch(/https:\/\/app\.test\/sign-up\?token=st_[a-z0-9]{32}/);
    expect(sent[0].body.html).toContain('Northern Glass');
  });

  test('the email cannot be made to carry markup', () => {
    const email = signUpEmail('SetOut <hello@setout.example>', 'a@b.example', {
      companyName: '<img src=x onerror=alert(1)>',
      personName: '<b>Bad</b>',
      link: 'https://app.test/sign-up?token=st_x',
    });
    expect(email.html).not.toContain('<img');
    expect(email.html).not.toContain('<b>Bad');
  });
});

describe('the bot check', () => {
  const checked = { TURNSTILE_SECRET_KEY: 'secret', TURNSTILE_SITE_KEY: '0x4AAA' };
  const answering = (success: boolean) =>
    vi.stubGlobal('fetch', async (url: string) => {
      expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
      return Response.json({ success });
    });

  test('where it is set up, a sign-up without it is refused', async () => {
    const response = await callWith(checked, '/api/workspace/sign-up', { method: 'POST', body: body({ ...FORM, email: 'nocheck@northern.example' }) });
    expect(response.status).toBe(403);
    expect(await json(response)).toMatchObject({ error: 'bot_check_failed' });
    expect(await count("SELECT COUNT(*) AS n FROM signups WHERE email = 'nocheck@northern.example'")).toBe(0);
  });

  test('one that fails it is refused', async () => {
    answering(false);
    const response = await callWith(checked, '/api/workspace/sign-up', {
      method: 'POST',
      body: body({ ...FORM, email: 'failed@northern.example', turnstileToken: 'bad' }),
    });
    expect(response.status).toBe(403);
    expect(await count("SELECT COUNT(*) AS n FROM signups WHERE email = 'failed@northern.example'")).toBe(0);
  });

  test('one that passes it goes through', async () => {
    answering(true);
    const response = await callWith(checked, '/api/workspace/sign-up', {
      method: 'POST',
      body: body({ ...FORM, email: 'passed@northern.example', turnstileToken: 'good' }),
    });
    expect(response.status).toBe(202);
    expect(await count("SELECT COUNT(*) AS n FROM signups WHERE email = 'passed@northern.example'")).toBe(1);
  });
});

describe('limits', () => {
  test(`an address is sent no more than ${SIGNUPS_PER_ADDRESS_PER_HOUR} links an hour, and is not told when it has had them`, async () => {
    const form = { ...FORM, email: 'busy@northern.example' };
    for (let i = 0; i < SIGNUPS_PER_ADDRESS_PER_HOUR; i++) await ask(form);
    const refused = await post('/sign-up', form);
    expect(refused.status).toBe(202);
    expect(await json(refused)).toEqual({ ok: true });
    expect(await count("SELECT COUNT(*) AS n FROM signups WHERE email = 'busy@northern.example'")).toBe(SIGNUPS_PER_ADDRESS_PER_HOUR);
  });

  test(`one network address may ask no more than ${SIGNUPS_PER_IP_PER_HOUR} times an hour, and only its hash is kept`, async () => {
    const from = { 'CF-Connecting-IP': '203.0.113.7' };
    for (let i = 0; i < SIGNUPS_PER_IP_PER_HOUR; i++) {
      expect((await post('/sign-up', { ...FORM, email: `flood${i}@northern.example` }, { headers: from })).status).toBe(202);
    }
    const refused = await post('/sign-up', { ...FORM, email: 'flood-last@northern.example' }, { headers: from });
    expect(refused.status).toBe(429);
    expect(await json(refused)).toMatchObject({ error: 'too_many' });
    // Someone else, somewhere else, is not held up by it.
    expect((await post('/sign-up', { ...FORM, email: 'elsewhere@northern.example' }, { headers: { 'CF-Connecting-IP': '198.51.100.9' } })).status).toBe(202);

    const kept = await env.DB.prepare("SELECT ip_hash FROM signups WHERE email = 'flood0@northern.example'").first<{ ip_hash: string }>();
    expect(kept?.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(kept?.ip_hash).not.toContain('203.0.113.7');
  });

  test('sign-ups in all are limited by the day', async () => {
    const at = new Date('2031-03-01T12:00:00.000Z');
    const asked = async (i: number) => requestSignUp(env, { email: `day${i}@northern.example`, personName: 'A', companyName: 'B', ip: null }, at);
    await env.DB.prepare(
      `INSERT INTO signups (token_hash, email, person_name, company_name, created_at, expires_at)
       SELECT 'day-' || value, 'filler' || value || '@northern.example', 'A', 'B', '2031-03-01T11:00:00.000Z', '2031-03-02T11:00:00.000Z'
         FROM json_each(?)`
    )
      .bind(JSON.stringify([...Array(199).keys()]))
      .run();
    expect((await asked(1)).ok).toBe(true);
    expect(await asked(2)).toEqual({ ok: false, reason: 'too_many_today' });
    // Those were dated in the future, and would hold up every test after this one.
    await env.DB.prepare("DELETE FROM signups WHERE created_at > '2031-01-01'").run();
  });
});

describe('using a sign-up link', () => {
  test('opens the company with its designer and its owner, and signs the browser in', async () => {
    const used = await post('/sign-up/verify', { token: await ask() });
    expect(used.status).toBe(200);
    const cookie = sessionFrom(used) as string;
    expect(used.headers.get('Set-Cookie')).toMatch(/HttpOnly/i);
    expect(used.headers.get('Set-Cookie')).toMatch(/Secure/i);

    const me = await json<{
      user: { email: string; name: string };
      role: string;
      company: { id: string; name: string; referencePrefix: string };
      companies: { name: string }[];
      setUp: unknown;
    }>(await api('/me', { cookie }));
    expect(me.user).toMatchObject({ email: 'nia@northern.example', name: 'Nia Roberts' });
    expect(me.role).toBe('owner');
    expect(me.company).toMatchObject({ name: 'Northern Glass', referencePrefix: 'NG' });
    expect(me.companies.map((c) => c.name)).toEqual(['Northern Glass']);
    expect(me.setUp).toEqual({ done: false });

    const db = companyDb(env, me.company.id);
    expect(await db.company()).toMatchObject({ status: 'active', plan: 'trial', currency: 'GBP' });
    const designers = await db.find('designers');
    expect(designers).toHaveLength(1);
    expect(designers[0]).toMatchObject({ name: 'Website', status: 'active', allowed_origins: [], config: {}, notify_emails: ['nia@northern.example'] });
    // Anywhere but production a new designer has a test key.
    expect(designers[0].site_key).toMatch(/^pk_test_[a-z0-9]{24}$/);
    expect((await db.find('memberships')).map((m) => m.role)).toEqual(['owner']);
    expect((await db.find('audit_log')).map((a) => a.action).sort()).toEqual(['company_opened', 'member_added']);
    // With billing off there is no trial to run out.
    expect(await db.count('subscriptions')).toBe(0);
    expect((await db.rulesets.current()).version).toBe(0);
  });

  test('works once', async () => {
    const token = await ask({ ...FORM, companyName: 'Once Glass', email: 'once@northern.example' });
    expect((await post('/sign-up/verify', { token })).status).toBe(200);
    const again = await post('/sign-up/verify', { token });
    expect(again.status).toBe(400);
    expect(await json(again)).toMatchObject({ error: 'link_not_valid' });
    expect(sessionFrom(again)).toBeNull();
    expect(await count("SELECT COUNT(*) AS n FROM companies WHERE name = 'Once Glass'")).toBe(1);
  });

  test('two browsers racing with one link open one company', async () => {
    const token = await ask({ ...FORM, companyName: 'Race Glass', email: 'race@northern.example' });
    const both = await Promise.all([post('/sign-up/verify', { token }), post('/sign-up/verify', { token })]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await count("SELECT COUNT(*) AS n FROM companies WHERE name = 'Race Glass'")).toBe(1);
  });

  test('does not work after 24 hours', async () => {
    const asked = await requestSignUp(env, { email: 'late@northern.example', personName: 'Late', companyName: 'Late Glass', ip: null }, new Date('2030-01-01T00:00:00Z'));
    if (!asked.ok) throw new Error('not asked');
    const defaults = { keyKind: 'test', trialEndsAt: null } as const;
    expect(await redeemSignUp(env, asked.token, defaults, new Date('2030-01-02T00:00:01Z'))).toBeNull();
    expect(await redeemSignUp(env, asked.token, defaults, new Date('2030-01-01T23:59:00Z'))).not.toBeNull();
  });

  test.each(['', 'st_short', 'lt_abcdefghijkmnpqrstuvwxyz23456789', 'st_abcdefghijkmnpqrstuvwxyz23456789', null, 42])('%j is not a link', async (token) => {
    expect((await post('/sign-up/verify', { token })).status).toBe(400);
  });

  test('a sign-in link is not a sign-up link, nor the other way round', async () => {
    const signUpToken = await ask({ ...FORM, email: 'mix@northern.example' });
    expect((await post('/sign-in/verify', { token: signUpToken })).status).toBe(400);
    const { link } = await json<{ link: string }>(await post('/sign-in', { email: 'owner@cs.example' }));
    expect((await post('/sign-up/verify', { token: new URL(link).searchParams.get('token') })).status).toBe(400);
  });

  test('a company whose initials are taken gets the next reference', async () => {
    const first = await signUp({ ...FORM, companyName: 'Clear Screens', email: 'one@clear.example' });
    const second = await signUp({ ...FORM, companyName: 'Crystal Showers Ltd', email: 'two@crystal.example' });
    // Custom Showers has CS already.
    expect((await companyDb(env, first.companyId).company())?.reference_prefix).toBe('CS2');
    expect((await companyDb(env, second.companyId).company())?.reference_prefix).toBe('CS3');
  });

  test('someone who already has an account opens a second company as the same person', async () => {
    const { cookie, companyId } = await signUp({ companyName: 'Second String Glass', name: 'Someone Else', email: 'owner@cs.example' });
    expect(await count("SELECT COUNT(*) AS n FROM users WHERE email = 'owner@cs.example'")).toBe(1);
    const me = await json<{ company: { id: string }; companies: { name: string; role: string }[] }>(await api('/me', { cookie }));
    expect(me.company.id).toBe(companyId);
    expect(me.companies.map((c) => c.name)).toEqual(['Custom Showers', 'Second String Glass']);
    // The session made by signing in still works in the first company.
    expect((await json<{ company: { name: string } }>(await api('/me', { cookie: oldOwner }))).company.name).toBe('Custom Showers');
  });

  test('in production the designer gets a live key, and the bot check’s key where there is one', async () => {
    const token = await ask({ ...FORM, companyName: 'Live Glass', email: 'live@northern.example' });
    const used = await callWith({ ENVIRONMENT: 'production', TURNSTILE_SITE_KEY: '0x4AAA' }, '/api/workspace/sign-up/verify', {
      method: 'POST',
      body: body({ token }),
    });
    const { company: made } = await json<{ company: { id: string } }>(used);
    const [designer] = await companyDb(env, made.id).find('designers');
    expect(designer.site_key).toMatch(/^pk_live_/);
    expect(designer.config).toEqual({ turnstileSiteKey: '0x4AAA' });
  });

  test('with billing on, the company starts a trial', async () => {
    const token = await ask({ ...FORM, companyName: 'Trial Glass', email: 'trial@northern.example' });
    const used = await callWith({ BILLING: 'on', TRIAL_DAYS: '10' }, '/api/workspace/sign-up/verify', { method: 'POST', body: body({ token }) });
    const { company: made } = await json<{ company: { id: string } }>(used);
    const [subscription] = await companyDb(env, made.id).find('subscriptions');
    expect(subscription).toMatchObject({ status: 'trialing', stripe_customer_id: null, plan_id: null });
    const days = (Date.parse(subscription.trial_ends_at as string) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(9.9);
    expect(days).toBeLessThan(10.1);
  });
});

describe('reference prefixes', () => {
  test.each([
    ['Brennan Glass', 'BG'],
    ['The Shower Company Ltd', 'SHO'],
    ['Showerwise', 'SHO'],
    ['A & B Glazing (Leeds) Limited', 'ABGL'],
    ['1st Glass', 'SG'],
    ['Éclat Verre', 'EV'],
    ['玻璃', 'SO'],
    ['X', 'SO'],
  ])('%s gives %s', (name, prefix) => {
    expect(prefixFrom(name)).toBe(prefix);
    expect(prefix).toMatch(/^[A-Z][A-Z0-9]{1,5}$/);
  });

  test('a prefix chosen by hand is used as given, or refused', async () => {
    const opened = await openCompany(env, { name: 'Hand Picked', owner: { email: 'hp@example.test', name: null }, via: 'setout', plan: 'free', keyKind: 'test', referencePrefix: 'HPK' });
    expect(opened.referencePrefix).toBe('HPK');
    await expect(
      openCompany(env, { name: 'Hand Picked Two', owner: { email: 'hp2@example.test', name: null }, via: 'setout', plan: 'free', keyKind: 'test', referencePrefix: 'HPK' })
    ).rejects.toThrow(/already uses/);
    expect(await count("SELECT COUNT(*) AS n FROM users WHERE email = 'hp2@example.test'")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A company that signed up is a company like any other
// ---------------------------------------------------------------------------

describe('a new company and the others', () => {
  let fresh: { cookie: string; companyId: string };
  let freshKey: string;
  let freshDesignerId: string;

  beforeAll(async () => {
    fresh = await signUp({ companyName: 'Fresh Glass', name: 'Fay Fresh', email: 'fay@fresh.example' });
    const [designer] = await companyDb(env, fresh.companyId).find('designers');
    freshKey = designer.site_key;
    freshDesignerId = designer.id;
  });

  test('its inbox is empty, and its designer takes designs that only it can see', async () => {
    expect((await json<{ jobs: unknown[] }>(await api('/jobs', { cookie: fresh.cookie }))).jobs).toEqual([]);

    const config = await exports.default.fetch(`${DESIGNER}/api/designer/config?key=${freshKey}`);
    expect(config.status).toBe(200);
    expect(await json<{ brand: { name: string } }>(config)).toMatchObject({ brand: { name: 'Fresh Glass' } });

    const reference = await enquire({ id: fresh.companyId, name: 'Fresh Glass', db: companyDb(env, fresh.companyId), siteKey: freshKey }, 'Gil Hart', 'gil@example.test', 'M1 1AA');
    expect(reference).toBe('FG-1001');
    const mine = await json<{ jobs: { customer: { name: string } }[] }>(await api('/jobs', { cookie: fresh.cookie }));
    expect(mine.jobs.map((j) => j.customer.name)).toEqual(['Gil Hart']);
    const theirs = await json<{ jobs: { customer: { name: string } }[] }>(await api('/jobs', { cookie: oldOwner }));
    expect(theirs.jobs.map((j) => j.customer.name)).toEqual(['Asha Patel']);
  });

  test('it cannot open, move, note or quote another company’s job', async () => {
    const { cookie } = fresh;
    expect((await api(`/jobs/${oldJobId}`, { cookie })).status).toBe(404);
    expect((await api(`/jobs/${oldJobId}`, { cookie, method: 'PATCH', body: body({ stage: 'closed' }) })).status).toBe(404);
    expect((await post(`/jobs/${oldJobId}/notes`, { text: 'hello' }, { cookie })).status).toBe(404);
    expect((await post(`/jobs/${oldJobId}/quotes`, {}, { cookie })).status).toBe(404);
    expect((await api('/jobs?q=Asha', { cookie }).then((r) => json<{ jobs: unknown[] }>(r))).jobs).toEqual([]);

    const job = await json<{ job: { stage: string }; files: { id: string }[] }>(await api(`/jobs/${oldJobId}`, { cookie: oldOwner }));
    expect(job.job.stage).toBe('new');
    for (const file of job.files) expect((await api(`/files/${file.id}`, { cookie })).status).toBe(404);
  });

  test('it cannot see or change another company’s settings, designer or team', async () => {
    const { cookie } = fresh;
    const theirs = await json<{ designers: { id: string; versions: Record<string, string> }[] }>(await api('/settings', { cookie: oldOwner }));
    const target = theirs.designers[0];
    const mine = await json<{ company: { name: string }; designers: { id: string }[] }>(await api('/settings', { cookie }));
    expect(mine.company.name).toBe('Fresh Glass');
    expect(mine.designers.map((d) => d.id)).toEqual([freshDesignerId]);

    for (const change of [{ notifyEmails: ['fay@fresh.example'] }, { websites: ['https://fresh.example'] }]) {
      const response = await api(`/settings/designers/${target.id}`, { cookie, method: 'PATCH', body: body({ ...change, basedOn: target.versions }) });
      expect(response.status).toBe(404);
    }
    expect((await old.db.find('designers'))[0]).toMatchObject({ allowed_origins: [], notify_emails: [] });

    const team = await json<{ members: { id: string; email: string }[] }>(await api('/team', { cookie }));
    expect(team.members.map((m) => m.email)).toEqual(['fay@fresh.example']);
    const [theirMember] = await old.db.find('memberships');
    expect((await api(`/team/${theirMember.id}`, { cookie, method: 'DELETE' })).status).toBe(404);
    expect((await api(`/team/${theirMember.id}`, { cookie, method: 'PATCH', body: body({ role: 'staff' }) })).status).toBe(404);
    expect(await old.db.count('memberships')).toBe(1);
  });

  test('it cannot move into a company it is not on', async () => {
    expect((await post('/company', { companyId: old.id }, { cookie: fresh.cookie })).status).toBe(404);
    expect((await json<{ company: { name: string } }>(await api('/me', { cookie: fresh.cookie }))).company.name).toBe('Fresh Glass');
  });

  test('an older company cannot reach anything of the new one’s', async () => {
    const db = companyDb(env, fresh.companyId);
    const [job] = await db.find('jobs');
    const [member] = await db.find('memberships');
    expect((await api(`/jobs/${job.id}`, { cookie: oldOwner })).status).toBe(404);
    expect((await api(`/team/${member.id}`, { cookie: oldOwner, method: 'DELETE' })).status).toBe(404);
    const mine = await json<{ designers: { versions: Record<string, string> }[] }>(await api('/settings', { cookie: fresh.cookie }));
    const response = await api(`/settings/designers/${freshDesignerId}`, {
      cookie: oldOwner,
      method: 'PATCH',
      body: body({ websites: ['https://customshowers.example'], basedOn: mine.designers[0].versions }),
    });
    expect(response.status).toBe(404);
    expect((await db.get('designers', freshDesignerId))?.allowed_origins).toEqual([]);
    expect((await post('/company', { companyId: fresh.companyId }, { cookie: oldOwner })).status).toBe(404);
  });

  test('through the data layer, neither can read, change or delete a row of the other’s, in any table', async () => {
    const mine = companyDb(env, fresh.companyId);
    for (const table of Object.keys(TABLES) as TableName[]) {
      for (const [from, to] of [
        [mine, old.db],
        [old.db, mine],
      ]) {
        for (const row of await to.find(table)) {
          expect(await from.get(table, row.id), table).toBeNull();
          expect(await from.remove(table, row.id), table).toBe(false);
          expect(await to.get(table, row.id), table).toEqual(row);
        }
      }
    }
    // Both have rows to have tried it with.
    expect(await mine.count('jobs')).toBe(1);
    expect(await old.db.count('jobs')).toBe(1);
  });

  test('the sign-up link opened one company and can be used for no other', async () => {
    const row = await env.DB.prepare("SELECT company_id, used_at FROM signups WHERE email = 'fay@fresh.example'").first<{ company_id: string; used_at: string }>();
    expect(row?.company_id).toBe(fresh.companyId);
    expect(row?.used_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Setting up
// ---------------------------------------------------------------------------

describe('setting up', () => {
  let owner: { cookie: string; companyId: string };
  let staff: string;
  interface DesignerSeen {
    id: string;
    siteKey: string;
    websites: string[];
    versions: Record<string, string>;
  }
  const settings = async (cookie = owner.cookie) => json<{ embedScript: string; designers: DesignerSeen[]; changes?: { data: { changes: unknown[] } }[] }>(await api('/settings', { cookie }));
  const setWebsites = async (websites: unknown, cookie = owner.cookie) => {
    const [designer] = (await settings(cookie)).designers;
    return api(`/settings/designers/${designer.id}`, { cookie, method: 'PATCH', body: body({ websites, basedOn: designer.versions }) });
  };

  beforeAll(async () => {
    owner = await signUp({ companyName: 'Wizard Glass', name: 'Wil Wizard', email: 'wil@wizard.example' });
    await addMember(env, owner.companyId, 'staff@wizard.example', 'staff');
    staff = await signIn('staff@wizard.example');
  });

  test('the settings give the embed code’s two parts: the script’s address and the site key', async () => {
    const seen = await settings();
    expect(seen.embedScript).toBe('https://designer.test/embed.js');
    expect(seen.designers[0].siteKey).toMatch(/^pk_test_/);
    expect(seen.designers[0].websites).toEqual([]);
  });

  test('an owner lists the websites its designer may appear on, tidied to their addresses', async () => {
    const response = await setWebsites(['https://www.Wizard-Glass.example/showers/?x=1', 'wizard-glass.example', 'https://www.wizard-glass.example']);
    expect(response.status).toBe(200);
    const seen = await settings();
    expect(seen.designers[0].websites).toEqual(['https://www.wizard-glass.example', 'https://wizard-glass.example']);
    expect(seen.changes?.[0].data.changes).toEqual([{ field: 'websites', added: ['https://www.wizard-glass.example', 'https://wizard-glass.example'], removed: [] }]);

    // The designer's page may then be framed by those websites, and no others.
    const page = await exports.default.fetch(`${DESIGNER}/?key=${seen.designers[0].siteKey}`);
    expect(page.headers.get('content-security-policy')).toBe(
      'frame-ancestors https://www.wizard-glass.example https://wizard-glass.example http://localhost:* http://127.0.0.1:*'
    );
  });

  test.each([
    [['http://wizard-glass.example'], 'not https'],
    [['https://localhost'], 'no real host'],
    [['https://192.168.1.10'], 'numbers'],
    [['https://user:pw@wizard-glass.example'], 'a sign-in in the address'],
    [['javascript:alert(1)'], 'not a website'],
    [["https://a.example 'unsafe-inline'"], 'more than an address'],
    [['https://*.example.com'], 'a pattern'],
    [[''], 'empty'],
    [[42], 'not text'],
    ['https://wizard-glass.example', 'not a list'],
    [Array.from({ length: 11 }, (_, i) => `https://site${i}.example`), 'too many'],
  ] as [unknown, string][])('%j is refused: %s', async (websites, _why) => {
    const before = (await settings()).designers[0].websites;
    const response = await setWebsites(websites);
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ error: 'invalid_websites' });
    expect((await settings()).designers[0].websites).toEqual(before);
  });

  test('staff can see the websites and change none', async () => {
    expect((await setWebsites(['https://staff.example'], staff)).status).toBe(403);
  });

  test('the wizard’s place is kept, by owners only, and says nothing of anyone else’s', async () => {
    expect((await post('/set-up', { step: 4 }, { cookie: staff })).status).toBe(403);
    expect((await post('/set-up', { step: -1 }, { cookie: owner.cookie })).status).toBe(400);
    expect((await post('/set-up', { done: 'yes' }, { cookie: owner.cookie })).status).toBe(400);

    expect(await json(await post('/set-up', { step: 4 }, { cookie: owner.cookie }))).toEqual({ ok: true, setUp: { done: false, step: 4 } });
    expect(await json(await post('/set-up', { done: true }, { cookie: owner.cookie }))).toEqual({ ok: true, setUp: { done: true, step: 4 } });
    expect((await json<{ setUp: unknown }>(await api('/me', { cookie: owner.cookie }))).setUp).toEqual({ done: true, step: 4 });

    // A company from before sign-up was never sent to the wizard.
    expect((await json<{ setUp: unknown }>(await api('/me', { cookie: oldOwner }))).setUp).toBeNull();
    // And the quote settings kept beside it are untouched by it.
    const company = await companyDb(env, owner.companyId).company();
    expect(company?.settings).toEqual({ setUp: { done: true, step: 4 } });
  });

  test('finishing set-up leaves a later change to the quote settings working', async () => {
    const seen = await json<{ company: { versions: Record<string, string> } }>(await api('/settings', { cookie: owner.cookie }));
    const saved = await api('/settings/company', { cookie: owner.cookie, method: 'PATCH', body: body({ quotes: { validDays: 21 }, basedOn: seen.company.versions }) });
    expect(saved.status).toBe(200);
    expect((await companyDb(env, owner.companyId).company())?.settings).toEqual({ setUp: { done: true, step: 4 }, quoteValidDays: 21 });
  });
});

test('every sign-up route refuses the designer’s address', async () => {
  for (const path of ['/sign-up', '/sign-up/verify']) {
    const response = await exports.default.fetch(`${DESIGNER}/api/workspace${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: DESIGNER },
      body: body(FORM),
    });
    expect(response.status, path).toBe(404);
  }
  expect(APP).not.toBe(DESIGNER);
});
