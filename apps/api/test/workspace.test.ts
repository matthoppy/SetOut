/**
 * The workspace: signing in by emailed link, the inbox, a job, and its files.
 *
 * Designs reach these tests the way they reach a company: sent by a customer
 * through the designer. Every test that can be tried from another company's
 * side is.
 */
import { createDocument, designFromTemplate } from '@setout/engine';
import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { addMember, issueSignInLink, LINKS_PER_HOUR, sha256 } from '../src/db/auth';
import { companyDb, type CompanyDb } from '../src/db/company-db';
import { ADDS_PER_DAY } from '../src/db/team';
import { addedToTeamEmail } from '../src/lib/team-email';
import { createCompany, newSiteKey } from '../src/db/platform';
import app from '../src/index';
import { SESSION_COOKIE } from '../src/routes/workspace';

const APP = 'https://app.test';
const DESIGNER = 'https://designer.test';

const base64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3];
const PNG = base64(PNG_BYTES);
const JPEG = base64([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1]);

interface Company {
  id: string;
  name: string;
  db: CompanyDb;
  siteKey: string;
}

async function company(name: string, prefix: string): Promise<Company> {
  const record = await createCompany(env, { name, referencePrefix: prefix });
  const db = companyDb(env, record.id);
  const siteKey = newSiteKey('test');
  await db.insert('designers', { name: `${name} website`, site_key: siteKey, allowed_origins: [] });
  return { id: record.id, name, db, siteKey };
}

/** A customer sends a design through the company's designer. Answers with its reference. */
async function enquire(c: Company, name: string, email: string, postcode: string, phone = '020 7946 0000'): Promise<string> {
  const response = await exports.default.fetch(`${DESIGNER}/api/designer/enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteKey: c.siteKey,
      document: createDocument(designFromTemplate('alcove-panel-door')),
      templateId: 'alcove-panel-door',
      customer: { name, email, phone, postcode, notes: 'Tray is in.', measurementsAcknowledged: true },
      attachments: [
        { filename: 'plan-view.png', content: PNG, kind: 'drawing' },
        { filename: 'left-wall.jpg', content: JPEG, kind: 'photo' },
      ],
      turnstileToken: null,
      antispam: { honeypot: '', elapsedMs: 240_000 },
    }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { reference: string }).reference;
}

interface Call extends RequestInit {
  cookie?: string;
  origin?: string | null;
}

/** A call to the workspace's API, from the workspace's own page unless told otherwise. */
function api(path: string, init: Call = {}, host = APP): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('Cookie', `${SESSION_COOKIE}=${init.cookie}`);
  const method = init.method ?? 'GET';
  if (method !== 'GET' && init.origin !== null) headers.set('Origin', init.origin ?? host);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return exports.default.fetch(`${host}/api/workspace${path}`, { ...init, method, headers });
}

const post = (path: string, body: unknown, init: Call = {}) => api(path, { ...init, method: 'POST', body: JSON.stringify(body) });

/** The session cookie a response set, if it set one. */
function sessionFrom(response: Response): string | null {
  const header = response.headers.get('Set-Cookie') ?? '';
  const match = new RegExp(`${SESSION_COOKIE.replace(/[-]/g, '\\-')}=([^;]*)`).exec(header);
  return match ? match[1] : null;
}

/** Sign in as this person, the way a browser does: ask for a link, then use it. */
async function signIn(email: string): Promise<string> {
  const asked = await post('/sign-in', { email });
  const { link } = (await asked.json()) as { link: string };
  const token = new URL(link).searchParams.get('token');
  const used = await post('/sign-in/verify', { token });
  expect(used.status).toBe(200);
  const session = sessionFrom(used);
  if (!session) throw new Error('no session cookie');
  return session;
}

const json = async <T>(response: Response) => (await response.json()) as T;

let ours: Company;
let theirs: Company;
let owner: string;
let rival: string;

interface InboxBody {
  jobs: {
    id: string;
    reference: string;
    stage: string;
    createdAt: string;
    customer: { name: string; postcode: string | null };
    layout: string | null;
    widthMm: number | null;
    heightMm: number | null;
    panels: number | null;
    photos: number;
    designs: number;
  }[];
  counts: Record<string, number>;
  next: string | null;
}

interface JobBody {
  job: { id: string; reference: string; stage: string };
  customer: { name: string; email: string };
  designs: { id: string; revision: { number: number; computed: { panels: unknown[] }; document: { design: { panels: unknown[] } } } }[];
  files: { id: string; kind: string; name: string; contentType: string; sizeBytes: number }[];
  events: { type: string; actorKind: string; actor: { email: string } | null; data: Record<string, unknown> }[];
}

beforeAll(async () => {
  ours = await company('Custom Showers', 'CS');
  theirs = await company('Brennan Glass', 'BG');
  await addMember(env, ours.id, 'owner@cs.example', 'owner');
  await addMember(env, theirs.id, 'owner@bg.example', 'owner');
  await enquire(ours, 'Asha Patel', 'asha@example.test', 'SW1A 1AA');
  await enquire(ours, 'Ben Okafor', 'ben@example.test', 'N1 2AB', '07700 900123');
  await enquire(ours, 'Cara Liu', 'cara@example.test', 'E8 3CD');
  await enquire(theirs, 'Dan Theirs', 'dan@example.test', 'SW15 1AA');
  owner = await signIn('owner@cs.example');
  rival = await signIn('owner@bg.example');
});

// ---------------------------------------------------------------------------

describe('asking for a sign-in link', () => {
  test.each(['', 'not-an-email', 'a@b', 'a b@c.d', '<a@b.c>'])('"%s" is refused', async (email) => {
    const response = await post('/sign-in', { email });
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ error: 'invalid_email' });
  });

  test('an address with no account gets the same answer and no link', async () => {
    const response = await post('/sign-in', { email: 'stranger@example.test' });
    expect(response.status).toBe(202);
    expect(await json(response)).toEqual({ ok: true });
    const kept = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_tokens WHERE email = 'stranger@example.test'").first<{ n: number }>();
    expect(kept?.n).toBe(0);
  });

  test('a member gets a link, and only its hash is kept', async () => {
    await addMember(env, ours.id, 'hash@cs.example', 'staff');
    const response = await post('/sign-in', { email: 'hash@cs.example' });
    expect(response.status).toBe(202);
    const { link } = await json<{ link: string }>(response);
    expect(link).toMatch(/^https:\/\/app\.test\/sign-in\?token=lt_[a-z0-9]{32}$/);
    const token = new URL(link).searchParams.get('token') as string;
    const rows = await env.DB.prepare("SELECT * FROM login_tokens WHERE email = 'hash@cs.example'").all();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].token_hash).toBe(await sha256(token));
    expect(JSON.stringify(rows.results)).not.toContain(token);
  });

  test('an address is matched however it is typed', async () => {
    const response = await post('/sign-in', { email: '  Owner@CS.Example ' });
    expect(await json(response)).toHaveProperty('link');
  });

  test(`an address is sent no more than ${LINKS_PER_HOUR} links an hour`, async () => {
    await addMember(env, ours.id, 'busy@cs.example', 'staff');
    for (let i = 0; i < LINKS_PER_HOUR; i++) {
      expect(await json(await post('/sign-in', { email: 'busy@cs.example' }))).toHaveProperty('link');
    }
    const refused = await post('/sign-in', { email: 'busy@cs.example' });
    expect(refused.status).toBe(202);
    expect(await json(refused)).toEqual({ ok: true });
  });

  test('a member of a company that has been switched off gets no link', async () => {
    const gone = await company('Gone Glass', 'GG');
    await addMember(env, gone.id, 'staff@gg.example', 'staff');
    await env.DB.prepare("UPDATE companies SET status = 'suspended' WHERE id = ?").bind(gone.id).run();
    expect(await json(await post('/sign-in', { email: 'staff@gg.example' }))).toEqual({ ok: true });
  });

  test('the link comes back in the answer only on a developer’s own machine', async () => {
    const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
    const request = new Request(`${APP}/api/workspace/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP },
      body: JSON.stringify({ email: 'owner@cs.example' }),
    });
    const response = await app.fetch(request, { ...env, ENVIRONMENT: 'staging' }, ctx);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe('using a sign-in link', () => {
  test('signs the browser in with a cookie no script can read, sent only to this address', async () => {
    await addMember(env, ours.id, 'cookie@cs.example', 'staff');
    const { link } = await json<{ link: string }>(await post('/sign-in', { email: 'cookie@cs.example' }));
    const response = await post('/sign-in/verify', { token: new URL(link).searchParams.get('token') });
    expect(response.status).toBe(200);
    const cookie = response.headers.get('Set-Cookie') ?? '';
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=ss_[a-z0-9]{32};`));
    for (const part of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', `Max-Age=${30 * 86_400}`]) expect(cookie).toContain(part);
    expect(cookie).not.toMatch(/Domain=/i);
    // Only the session's hash is kept.
    const session = sessionFrom(response) as string;
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?').bind(await sha256(session)).first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  test('works once', async () => {
    await addMember(env, ours.id, 'once@cs.example', 'staff');
    const { link } = await json<{ link: string }>(await post('/sign-in', { email: 'once@cs.example' }));
    const token = new URL(link).searchParams.get('token');
    expect((await post('/sign-in/verify', { token })).status).toBe(200);
    const again = await post('/sign-in/verify', { token });
    expect(again.status).toBe(400);
    expect(await json(again)).toMatchObject({ error: 'link_not_valid' });
    expect(sessionFrom(again)).toBeNull();
  });

  test('does not work once its fifteen minutes are up', async () => {
    await addMember(env, ours.id, 'late@cs.example', 'staff');
    const token = await issueSignInLink(env, 'late@cs.example', new Date(Date.now() - 16 * 60_000));
    expect(token).not.toBeNull();
    expect((await post('/sign-in/verify', { token })).status).toBe(400);
  });

  test.each([['a link nobody was sent', 'lt_abcdefghijkmnpqrstuvwxyz23456789'], ['something that is not a link', 'hello'], ['nothing', undefined]])(
    '%s signs nobody in',
    async (_, token) => {
      const response = await post('/sign-in/verify', { token });
      expect(response.status).toBe(400);
      expect(sessionFrom(response)).toBeNull();
    }
  );
});

describe('signed in', () => {
  test.each(['/me', '/jobs', '/jobs/job_x', '/files/fil_x'])('%s answers nothing without a session', async (path) => {
    const response = await api(path);
    expect(response.status).toBe(401);
    expect(await json(response)).toMatchObject({ error: 'signed_out' });
  });

  test('a made-up session is no session', async () => {
    expect((await api('/me', { cookie: 'ss_abcdefghijkmnpqrstuvwxyz23456789' })).status).toBe(401);
  });

  test('says who is signed in and which company they are working in', async () => {
    const me = await json<{ user: { email: string }; role: string; company: { name: string; referencePrefix: string }; companies: { name: string }[] }>(
      await api('/me', { cookie: owner })
    );
    expect(me.user.email).toBe('owner@cs.example');
    expect(me.role).toBe('owner');
    expect(me.company).toMatchObject({ name: 'Custom Showers', referencePrefix: 'CS' });
    expect(me.companies.map((c) => c.name)).toEqual(['Custom Showers']);
  });

  test('someone on two teams can move between them, and only between them', async () => {
    await addMember(env, ours.id, 'both@example.test', 'staff');
    await addMember(env, theirs.id, 'both@example.test', 'staff');
    const both = await signIn('both@example.test');
    const me = async () => json<{ company: { name: string }; companies: { name: string }[] }>(await api('/me', { cookie: both }));
    expect((await me()).company.name).toBe('Custom Showers');
    expect((await me()).companies.map((c) => c.name)).toEqual(['Custom Showers', 'Brennan Glass']);

    expect((await post('/company', { companyId: theirs.id }, { cookie: both })).status).toBe(200);
    expect((await me()).company.name).toBe('Brennan Glass');
    const listed = await json<InboxBody>(await api('/jobs', { cookie: both }));
    expect(listed.jobs.map((j) => j.customer.name)).toEqual(['Dan Theirs']);

    const stranger = await company('Other Glass', 'OG');
    const refused = await post('/company', { companyId: stranger.id }, { cookie: both });
    expect(refused.status).toBe(404);
    expect((await me()).company.name).toBe('Brennan Glass');
  });

  test('taken off the team, the session stops working at once', async () => {
    await addMember(env, ours.id, 'leaver@cs.example', 'staff');
    const leaver = await signIn('leaver@cs.example');
    expect((await api('/me', { cookie: leaver })).status).toBe(200);
    await env.DB.prepare('DELETE FROM memberships WHERE company_id = ? AND user_id = (SELECT id FROM users WHERE email = ?)')
      .bind(ours.id, 'leaver@cs.example')
      .run();
    expect((await api('/me', { cookie: leaver })).status).toBe(401);
  });

  test('a company that is switched off signs its staff out', async () => {
    const paused = await company('Paused Glass', 'PG');
    await addMember(env, paused.id, 'staff@pg.example', 'staff');
    const staff = await signIn('staff@pg.example');
    expect((await api('/me', { cookie: staff })).status).toBe(200);
    await env.DB.prepare("UPDATE companies SET status = 'suspended' WHERE id = ?").bind(paused.id).run();
    expect((await api('/me', { cookie: staff })).status).toBe(401);
  });

  test('signing out ends the session', async () => {
    await addMember(env, ours.id, 'out@cs.example', 'staff');
    const session = await signIn('out@cs.example');
    const response = await post('/sign-out', {}, { cookie: session });
    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
    expect((await api('/me', { cookie: session })).status).toBe(401);
  });
});

describe('a change must come from the workspace’s own pages', () => {
  test.each([['no origin', null], ['another website', 'https://evil.example'], ['the designer', DESIGNER]])(
    'from %s it is refused',
    async (_, origin) => {
      const { jobs } = await json<InboxBody>(await api('/jobs', { cookie: owner }));
      const response = await post(`/jobs/${jobs[0].id}/notes`, { text: 'Hello' }, { cookie: owner, origin });
      expect(response.status).toBe(403);
      expect(await json(response)).toMatchObject({ error: 'wrong_origin' });
    }
  );

  test('the workspace’s routes are not on the designer’s address at all', async () => {
    expect((await api('/me', { cookie: owner }, DESIGNER)).status).toBe(404);
    expect((await post('/sign-in', { email: 'owner@cs.example' }, {}, )).status).toBe(202);
    expect((await api('/sign-in', { method: 'POST', body: JSON.stringify({ email: 'owner@cs.example' }) }, DESIGNER)).status).toBe(404);
  });
});

describe('the inbox', () => {
  test('lists the company’s jobs newest first, and nobody else’s', async () => {
    const { jobs } = await json<InboxBody>(await api('/jobs', { cookie: owner }));
    expect(jobs.map((j) => j.customer.name)).toEqual(['Cara Liu', 'Ben Okafor', 'Asha Patel']);
    expect(jobs.every((j) => j.reference.startsWith('CS-'))).toBe(true);
    expect(jobs[0]).toMatchObject({
      stage: 'new',
      layout: 'alcove-panel-door',
      heightMm: 2000,
      panels: 2,
      photos: 1,
      designs: 1,
      customer: { name: 'Cara Liu', postcode: 'E8 3CD' },
    });
    expect(jobs[0].widthMm).toBeGreaterThan(0);

    const theirsListed = await json<InboxBody>(await api('/jobs', { cookie: rival }));
    expect(theirsListed.jobs.map((j) => j.customer.name)).toEqual(['Dan Theirs']);
  });

  test('says how many jobs are at each stage', async () => {
    const { counts } = await json<InboxBody>(await api('/jobs', { cookie: rival }));
    expect(counts).toEqual({ new: 1, reviewing: 0, quoted: 0, ordered: 0, done: 0, closed: 0 });
  });

  test('finds a job by its reference, or the customer’s name, email, phone or postcode', async () => {
    const { jobs } = await json<InboxBody>(await api('/jobs', { cookie: owner }));
    const names = async (q: string) =>
      (await json<InboxBody>(await api(`/jobs?q=${encodeURIComponent(q)}`, { cookie: owner }))).jobs.map((j) => j.customer.name);
    expect(await names('patel')).toEqual(['Asha Patel']);
    expect(await names('n1 2ab')).toEqual(['Ben Okafor']);
    expect(await names('cara@')).toEqual(['Cara Liu']);
    expect(await names('07700')).toEqual(['Ben Okafor']);
    expect(await names(jobs[2].reference)).toEqual(['Asha Patel']);
    // What is typed is matched as typed.
    expect(await names('%')).toEqual([]);
    expect(await names('_')).toEqual([]);
    // Never another company's.
    expect(await names('Dan')).toEqual([]);
  });

  test('a search narrows the counts as well as the jobs', async () => {
    const { counts } = await json<InboxBody>(await api('/jobs?q=patel', { cookie: owner }));
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(1);
  });

  test('pages on from where the last page ended', async () => {
    const { jobs } = await json<InboxBody>(await api('/jobs', { cookie: owner }));
    const mark = encodeURIComponent(`${jobs[0].createdAt}~${jobs[0].id}`);
    const after = await json<InboxBody>(await api(`/jobs?after=${mark}`, { cookie: owner }));
    expect(after.jobs.map((j) => j.customer.name)).toEqual(['Ben Okafor', 'Asha Patel']);
    expect(after.next).toBeNull();
    expect((await api('/jobs?after=yesterday', { cookie: owner })).status).toBe(400);
  });

  test('misses no job when several arrived in the same millisecond', async () => {
    const shop = await company('Same Moment Glass', 'SM');
    for (const [i, name] of ['One', 'Two', 'Three'].entries()) {
      const customer = await shop.db.insert('customers', { name });
      await shop.db.insert('jobs', { reference: `SM-${1001 + i}`, customer_id: customer.id });
    }
    await env.DB.prepare('UPDATE jobs SET created_at = ? WHERE company_id = ?').bind('2026-01-01T00:00:00.000Z', shop.id).run();
    const seen: string[] = [];
    let after: { createdAt: string; id: string } | undefined;
    for (let page = await shop.db.jobs.inbox({ limit: 1 }); page.length > 0; page = await shop.db.jobs.inbox({ after, limit: 1 })) {
      seen.push(page[0].customer.name);
      after = { createdAt: page[0].createdAt, id: page[0].id };
    }
    expect(seen.sort()).toEqual(['One', 'Three', 'Two']);
  });

  test('a stage that is not one is refused', async () => {
    expect((await api('/jobs?stage=bogus', { cookie: owner })).status).toBe(400);
  });
});

describe('a job', () => {
  test('holds the customer, each shower as it now stands, its files and its timeline', async () => {
    const { jobs } = await json<InboxBody>(await api('/jobs?q=Asha', { cookie: owner }));
    const response = await api(`/jobs/${jobs[0].id}`, { cookie: owner });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await json<JobBody>(response);
    expect(body.job.reference).toBe(jobs[0].reference);
    expect(body.customer).toMatchObject({ name: 'Asha Patel', email: 'asha@example.test' });
    expect(body.designs).toHaveLength(1);
    expect(body.designs[0].revision.number).toBe(1);
    expect(body.designs[0].revision.computed.panels).toHaveLength(2);
    expect(body.designs[0].revision.document.design.panels).toHaveLength(2);
    expect(body.files.map((f) => [f.kind, f.name, f.contentType])).toEqual([
      ['drawing', 'plan-view.png', 'image/png'],
      ['photo', 'left-wall.jpg', 'image/jpeg'],
    ]);
    expect(body.events[0]).toMatchObject({ type: 'received', actorKind: 'customer' });
  });

  test('another company’s job is not there', async () => {
    const { jobs } = await json<InboxBody>(await api('/jobs', { cookie: rival }));
    expect((await api(`/jobs/${jobs[0].id}`, { cookie: owner })).status).toBe(404);
  });

  test('moving it to another stage goes on its timeline, with who moved it', async () => {
    const { jobs } = await json<InboxBody>(await api('/jobs?q=Ben', { cookie: owner }));
    const moved = await api(`/jobs/${jobs[0].id}`, { cookie: owner, method: 'PATCH', body: JSON.stringify({ stage: 'reviewing' }) });
    expect(moved.status).toBe(200);
    const body = await json<JobBody>(await api(`/jobs/${jobs[0].id}`, { cookie: owner }));
    expect(body.job.stage).toBe('reviewing');
    expect(body.events.at(-1)).toMatchObject({
      type: 'stage_changed',
      actorKind: 'staff',
      actor: { email: 'owner@cs.example' },
      data: { from: 'new', to: 'reviewing' },
    });
    const listed = await json<InboxBody>(await api('/jobs?stage=reviewing', { cookie: owner }));
    expect(listed.jobs.map((j) => j.customer.name)).toEqual(['Ben Okafor']);
    expect(listed.counts.reviewing).toBe(1);

    // Moving it to where it already is changes nothing.
    await api(`/jobs/${jobs[0].id}`, { cookie: owner, method: 'PATCH', body: JSON.stringify({ stage: 'reviewing' }) });
    const again = await json<JobBody>(await api(`/jobs/${jobs[0].id}`, { cookie: owner }));
    expect(again.events.filter((e) => e.type === 'stage_changed')).toHaveLength(1);
  });

  test('a stage that is not one is refused', async () => {
    const { jobs } = await json<InboxBody>(await api('/jobs', { cookie: owner }));
    const response = await api(`/jobs/${jobs[0].id}`, { cookie: owner, method: 'PATCH', body: JSON.stringify({ stage: 'cut' }) });
    expect(response.status).toBe(400);
  });

  test('another company’s job cannot be moved, or written on', async () => {
    const { jobs } = await json<InboxBody>(await api('/jobs', { cookie: rival }));
    const id = jobs[0].id;
    expect((await api(`/jobs/${id}`, { cookie: owner, method: 'PATCH', body: JSON.stringify({ stage: 'closed' }) })).status).toBe(404);
    expect((await post(`/jobs/${id}/notes`, { text: 'Taken over' }, { cookie: owner })).status).toBe(404);
    const theirsNow = await json<JobBody>(await api(`/jobs/${id}`, { cookie: rival }));
    expect(theirsNow.job.stage).toBe('new');
    expect(theirsNow.events.map((e) => e.type)).toEqual(['received']);
  });

  test('a note goes on the timeline with who wrote it', async () => {
    const { jobs } = await json<InboxBody>(await api('/jobs?q=Cara', { cookie: owner }));
    const added = await post(`/jobs/${jobs[0].id}/notes`, { text: '  Rang Cara, tray goes in on Friday.  ' }, { cookie: owner });
    expect(added.status).toBe(201);
    const body = await json<JobBody>(await api(`/jobs/${jobs[0].id}`, { cookie: owner }));
    expect(body.events.at(-1)).toMatchObject({
      type: 'note',
      actor: { email: 'owner@cs.example' },
      data: { text: 'Rang Cara, tray goes in on Friday.' },
    });
  });

  test.each([['an empty note', '   '], ['a note too long to be one', 'x'.repeat(4001)], ['something that is not text', 42]])(
    '%s is refused',
    async (_, text) => {
      const { jobs } = await json<InboxBody>(await api('/jobs', { cookie: owner }));
      expect((await post(`/jobs/${jobs[0].id}/notes`, { text }, { cookie: owner })).status).toBe(400);
    }
  );
});

describe('a job’s files', () => {
  test('come back as they were stored, for its company’s staff alone', async () => {
    const { jobs } = await json<InboxBody>(await api('/jobs?q=Asha', { cookie: owner }));
    const { files } = await json<JobBody>(await api(`/jobs/${jobs[0].id}`, { cookie: owner }));
    const drawing = files.find((f) => f.name === 'plan-view.png');
    const response = await api(`/files/${drawing?.id}`, { cookie: owner });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual(PNG_BYTES);

    expect((await api(`/files/${drawing?.id}`, { cookie: rival })).status).toBe(404);
    expect((await api(`/files/${drawing?.id}`)).status).toBe(401);
  });

  test('a file that belongs to no job is not served', async () => {
    const draft = await ours.db.insert('drafts', {
      designer_id: (await ours.db.find('designers'))[0].id,
      resume_token_hash: 'hash-of-a-draft',
      document: createDocument(designFromTemplate('walk-in')),
      format_version: 1,
      expires_at: '2099-01-01T00:00:00.000Z',
    });
    const file = await ours.db.insert('files', {
      draft_id: draft.id,
      kind: 'photo',
      storage_key: `${ours.id}/drafts/${draft.id}/a.jpg`,
      content_type: 'image/jpeg',
      size_bytes: 3,
    });
    await env.FILES.put(file.storage_key, new Uint8Array([1, 2, 3]));
    expect((await api(`/files/${file.id}`, { cookie: owner })).status).toBe(404);
  });
});

describe('the team', () => {
  interface TeamBody {
    members: { id: string; email: string; name: string | null; role: string }[];
    changes?: { action: string; by: { email: string } | null; data: Record<string, unknown> }[];
  }
  const team = async (cookie: string) => json<TeamBody>(await api('/team', { cookie }));
  const memberId = async (email: string) => (await team(owner)).members.find((m) => m.email === email)?.id ?? 'mem_none';
  const setRole = (id: string, role: string, cookie: string) => api(`/team/${id}`, { cookie, method: 'PATCH', body: JSON.stringify({ role }) });
  const remove = (id: string, cookie: string) => api(`/team/${id}`, { cookie, method: 'DELETE' });
  let sam: string;

  test('an owner puts someone on the team, who can then sign in', async () => {
    const added = await post('/team', { email: ' Sam.Staff@CS.example ', name: ' Sam   Staff ', role: 'staff' }, { cookie: owner });
    expect(added.status).toBe(201);
    const body = await json<{ member: { email: string; name: string; role: string }; emailed: boolean }>(added);
    expect(body.member).toMatchObject({ email: 'sam.staff@cs.example', name: 'Sam Staff', role: 'staff' });
    // There is no mail in the tests, and the answer says so.
    expect(body.emailed).toBe(false);

    sam = await signIn('sam.staff@cs.example');
    expect(await json(await api('/me', { cookie: sam }))).toMatchObject({ role: 'staff', company: { name: 'Custom Showers' } });
    const { changes } = await team(owner);
    expect(changes?.[0]).toMatchObject({
      action: 'member_added',
      by: { email: 'owner@cs.example' },
      data: { email: 'sam.staff@cs.example', role: 'staff' },
    });
  });

  test('nobody is added twice, and a refused change is not on record', async () => {
    const before = (await team(owner)).changes?.length;
    const again = await post('/team', { email: 'sam.staff@cs.example', role: 'owner' }, { cookie: owner });
    expect(again.status).toBe(409);
    expect((await team(owner)).changes?.length).toBe(before);
    expect((await team(owner)).members.find((m) => m.email === 'sam.staff@cs.example')?.role).toBe('staff');
  });

  test('a bad address or role is refused', async () => {
    expect((await post('/team', { email: 'not an address' }, { cookie: owner })).status).toBe(400);
    expect((await post('/team', { email: 'x@cs.example', role: 'boss' }, { cookie: owner })).status).toBe(400);
    expect((await setRole(await memberId('sam.staff@cs.example'), 'boss', owner)).status).toBe(400);
  });

  test('staff can see the team, but neither change it nor see its changes', async () => {
    const seen = await team(sam);
    expect(seen.members.map((m) => m.email)).toEqual(expect.arrayContaining(['owner@cs.example', 'sam.staff@cs.example']));
    expect(seen.changes).toBeUndefined();
    const id = await memberId('sam.staff@cs.example');
    expect((await post('/team', { email: 'x@cs.example' }, { cookie: sam })).status).toBe(403);
    expect((await setRole(id, 'owner', sam)).status).toBe(403);
    expect((await remove(await memberId('owner@cs.example'), sam)).status).toBe(403);
  });

  test('the last owner can neither stop being one nor be taken off', async () => {
    const id = await memberId('owner@cs.example');
    const demoted = await setRole(id, 'staff', owner);
    expect(demoted.status).toBe(409);
    expect((await json<{ error: string }>(demoted)).error).toBe('last_owner');
    expect((await remove(id, owner)).status).toBe(409);
    expect(await json(await api('/me', { cookie: owner }))).toMatchObject({ role: 'owner' });
  });

  test('an owner can make someone else an owner, who can hand it back', async () => {
    const id = await memberId('sam.staff@cs.example');
    expect((await setRole(id, 'owner', owner)).status).toBe(200);
    // The new role holds at once, on the session Sam already has.
    expect((await team(sam)).changes).toBeDefined();
    expect((await setRole(id, 'staff', sam)).status).toBe(200);
    const { changes } = await team(owner);
    expect(changes?.slice(0, 2).map((c) => [c.action, c.by?.email, c.data.from, c.data.to])).toEqual([
      ['role_changed', 'sam.staff@cs.example', 'owner', 'staff'],
      ['role_changed', 'owner@cs.example', 'staff', 'owner'],
    ]);
  });

  test('another company’s people can be neither seen nor changed', async () => {
    const theirTeam = await team(rival);
    const ourIds = (await team(owner)).members.map((m) => m.id);
    expect(theirTeam.members.map((m) => m.email)).toContain('owner@bg.example');
    expect(theirTeam.members.some((m) => ourIds.includes(m.id))).toBe(false);
    const theirOwner = theirTeam.members.find((m) => m.email === 'owner@bg.example');
    expect((await setRole(theirOwner?.id ?? '', 'staff', owner)).status).toBe(404);
    expect((await remove(theirOwner?.id ?? '', owner)).status).toBe(404);
  });

  test('taking someone off the team signs them out of it at once', async () => {
    const id = await memberId('sam.staff@cs.example');
    expect((await remove(id, owner)).status).toBe(200);
    expect((await api('/me', { cookie: sam })).status).toBe(401);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE company_id = ? AND user_id = (SELECT id FROM users WHERE email = ?)')
      .bind(ours.id, 'sam.staff@cs.example').first<{ n: number }>())?.n).toBe(0);
    const { members, changes } = await team(owner);
    expect(members.map((m) => m.email)).not.toContain('sam.staff@cs.example');
    expect(changes?.[0]).toMatchObject({ action: 'member_removed', data: { email: 'sam.staff@cs.example', role: 'staff' } });
    // Off every team, they cannot ask for a link.
    expect((await json<{ link?: string }>(await post('/sign-in', { email: 'sam.staff@cs.example' }))).link).toBeUndefined();
    expect((await remove(id, owner)).status).toBe(404);
  });

  test('a company can add only so many people a day', async () => {
    const shop = await company('Busy Glass', 'BZ');
    await addMember(env, shop.id, 'owner@bz.example', 'owner');
    const boss = await signIn('owner@bz.example');
    for (let i = 0; i < ADDS_PER_DAY; i++) {
      await shop.db.insert('audit_log', { action: 'member_added', data: { email: `p${i}@bz.example` } });
    }
    expect((await post('/team', { email: 'one-too-many@bz.example' }, { cookie: boss })).status).toBe(429);
  });

  test('the email says who added them and as what, and opens the sign-in page with their address', () => {
    const message = addedToTeamEmail('SetOut <hello@setout.example>', 'sam@cs.example', {
      company: 'Custom Showers',
      by: 'Owner <b>',
      byEmail: 'owner@cs.example',
      role: 'staff',
      link: 'https://app.test/sign-in?email=sam%40cs.example',
    });
    expect(message.subject).toBe('You have been added to Custom Showers on SetOut');
    expect(message.to).toEqual(['sam@cs.example']);
    expect(message.reply_to).toBe('owner@cs.example');
    expect(message.html).toContain('Owner &lt;b&gt; has added you to Custom Showers on SetOut, as a member of staff.');
    expect(message.html).toContain('https://app.test/sign-in?email=sam%40cs.example');
    // A name that ends in s reads well: no possessives.
    expect(message.html).not.toContain('’s');
    // A sign-in link would run out long before some people open this.
    expect(message.html).not.toContain('token=');
  });
});

describe('checking a shower', () => {
  interface Checked {
    job: { id: string };
    designs: { id: string; revision: { number: number; checked_at: string | null; checkedBy: { email: string } | null } }[];
    events: { type: string; actor: { email: string } | null; data: Record<string, unknown> }[];
  }
  const jobFor = async (name: string) => {
    const { jobs } = await json<InboxBody>(await api(`/jobs?q=${encodeURIComponent(name)}`, { cookie: owner }));
    return json<Checked>(await api(`/jobs/${jobs[0].id}`, { cookie: owner }));
  };
  const check = (jobId: string, designId: string, revision: unknown, cookie = owner) =>
    post(`/jobs/${jobId}/designs/${designId}/check`, { revision }, { cookie });
  const uncheck = (jobId: string, designId: string, cookie = owner) =>
    api(`/jobs/${jobId}/designs/${designId}/check`, { cookie, method: 'DELETE' });

  test('staff mark a shower as checked, and the job says who and when', async () => {
    const before = await jobFor('Cara');
    const design = before.designs[0];
    expect(design.revision).toMatchObject({ checked_at: null, checkedBy: null });
    expect((await check(before.job.id, design.id, design.revision.number)).status).toBe(200);

    const after = await jobFor('Cara');
    expect(after.designs[0].revision.checked_at).toBeTruthy();
    expect(after.designs[0].revision.checkedBy).toMatchObject({ email: 'owner@cs.example' });
    expect(after.events.at(-1)).toMatchObject({
      type: 'revision_checked',
      actor: { email: 'owner@cs.example' },
      data: { designId: design.id, revision: 1 },
    });
    // Checking it again changes nothing.
    expect((await check(before.job.id, design.id, design.revision.number)).status).toBe(200);
    expect((await jobFor('Cara')).events.filter((e) => e.type === 'revision_checked')).toHaveLength(1);
  });

  test('only the revision the shower stands at can be checked', async () => {
    const job = await jobFor('Asha');
    const design = job.designs[0];
    for (const wrong of [design.revision.number + 1, String(design.revision.number), null]) {
      const refused = await check(job.job.id, design.id, wrong);
      expect(refused.status).toBe(409);
      expect((await json<{ error: string }>(refused)).error).toBe('stale');
    }
    expect((await jobFor('Asha')).designs[0].revision.checked_at).toBeNull();
  });

  test('a shower that cannot be made cannot be checked', async () => {
    const [sample] = await ours.db.find('design_revisions', { limit: 1 });
    const customer = await ours.db.insert('customers', { name: 'Ida Wide' });
    const job = await ours.db.insert('jobs', { reference: 'CS-9901', customer_id: customer.id });
    const design = await ours.db.insert('designs', { job_id: job.id, current_revision: 1 });
    await ours.db.insert('design_revisions', {
      design_id: design.id,
      number: 1,
      document: sample.document,
      format_version: sample.format_version,
      engine_version: sample.engine_version,
      ruleset_version: sample.ruleset_version,
      computed: { ...sample.computed, blockingIssues: ['The door is wider than its hinges can carry.'] },
      author_kind: 'customer',
    });
    const refused = await check(job.id, design.id, 1);
    expect(refused.status).toBe(409);
    expect((await json<{ error: string }>(refused)).error).toBe('cannot_be_made');
  });

  test('a check can be taken back, and that goes on the timeline too', async () => {
    const job = await jobFor('Cara');
    const design = job.designs[0];
    expect((await uncheck(job.job.id, design.id)).status).toBe(200);
    const after = await jobFor('Cara');
    expect(after.designs[0].revision).toMatchObject({ checked_at: null, checkedBy: null });
    expect(after.events.at(-1)).toMatchObject({ type: 'revision_unchecked', actor: { email: 'owner@cs.example' } });
  });

  test('nobody checks another company’s shower', async () => {
    const ourJob = await jobFor('Cara');
    const { jobs } = await json<InboxBody>(await api('/jobs', { cookie: rival }));
    const theirJob = await json<Checked>(await api(`/jobs/${jobs[0].id}`, { cookie: rival }));
    expect((await check(theirJob.job.id, theirJob.designs[0].id, 1)).status).toBe(404);
    expect((await uncheck(theirJob.job.id, theirJob.designs[0].id)).status).toBe(404);
    // Nor a shower named under a job it is not on.
    expect((await check(ourJob.job.id, theirJob.designs[0].id, 1)).status).toBe(404);
    expect((await check(theirJob.job.id, ourJob.designs[0].id, 1)).status).toBe(404);
    expect((await check(ourJob.job.id, ourJob.designs[0].id, 1, rival)).status).toBe(404);
  });
});

describe('changing a shower', () => {
  interface Editor {
    config: { brand: { name: string }; rules: unknown };
    job: { id: string; reference: string; customer: string | null };
    design: { id: string };
    revision: { number: number; document: { format: number; design: { heightMm: number; panels: unknown[] } } };
    templateId: string | null;
  }
  interface Saved {
    job: { id: string };
    designs: {
      id: string;
      revision: { id: string; number: number; author_kind: string; reason: string | null; checked_at: string | null; computed: { heightMm: number } };
    }[];
    files: { kind: string; name: string; revisionId: string | null }[];
    events: { type: string; actor: { email: string } | null; data: Record<string, unknown> }[];
  }
  let jobId = '';
  let designId = '';
  const editorFor = async (cookie = owner) => api(`/jobs/${jobId}/designs/${designId}/editor`, { cookie });
  const save = (body: unknown, cookie = owner) => post(`/jobs/${jobId}/designs/${designId}/revisions`, body, { cookie });
  const changed = (editor: Editor, heightMm: number) => ({
    ...editor.revision.document,
    design: { ...editor.revision.document.design, heightMm },
  });

  beforeAll(async () => {
    await enquire(ours, 'Eve Editor', 'eve@example.test', 'EV1 1AA');
    const { jobs } = await json<InboxBody>(await api('/jobs?q=Eve', { cookie: owner }));
    jobId = jobs[0].id;
    const job = await json<Saved>(await api(`/jobs/${jobId}`, { cookie: owner }));
    designId = job.designs[0].id;
  });

  test('staff open a shower with its company’s designer and the revision it stands at', async () => {
    const response = await editorFor();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const editor = await json<Editor>(response);
    expect(editor.config.brand.name).toBe('Custom Showers');
    expect(editor.config.rules).toBeTruthy();
    expect(editor.job).toMatchObject({ id: jobId, customer: 'Eve Editor' });
    expect(editor.revision.number).toBe(1);
    expect(editor.revision.document.design.panels).toHaveLength(2);
    expect(editor.templateId).toBe('alcove-panel-door');
    expect((await editorFor(rival)).status).toBe(404);
    expect((await api(`/jobs/${jobId}/designs/${designId}/editor`)).status).toBe(401);
  });

  test('a change is saved as the next revision, worked out again here, with its drawings', async () => {
    const editor = await json<Editor>(await editorFor());
    const response = await save({
      basedOn: 1,
      document: changed(editor, 1950),
      // Whatever a browser says the sizes are is not even read.
      computed: { heightMm: 9999 },
      reason: '  Surveyed:   the tray is   50mm lower. ',
      attachments: [{ filename: 'plan-view.png', content: PNG, kind: 'drawing' }],
    });
    expect(response.status).toBe(201);
    expect(await json(response)).toMatchObject({ revision: 2, drawings: 1 });

    const job = await json<Saved>(await api(`/jobs/${jobId}`, { cookie: owner }));
    const now = job.designs[0].revision;
    expect(now).toMatchObject({ number: 2, author_kind: 'staff', reason: 'Surveyed: the tray is 50mm lower.', checked_at: null });
    expect(now.computed.heightMm).toBe(1950);
    expect(job.files.filter((f) => f.revisionId === now.id).map((f) => [f.kind, f.name])).toEqual([['drawing', 'plan-view.png']]);
    expect(job.events.at(-1)).toMatchObject({
      type: 'revision_saved',
      actor: { email: 'owner@cs.example' },
      data: { designId, revision: 2, reason: 'Surveyed: the tray is 50mm lower.' },
    });
    // Revision 1 is as the customer sent it.
    const [first] = await ours.db.find('design_revisions', { where: { design_id: designId, number: 1 } });
    expect(first.author_kind).toBe('customer');
  });

  test('a change made from an older revision is refused, not saved over a newer one', async () => {
    const editor = await json<Editor>(await editorFor());
    expect(editor.revision.number).toBe(2);
    const stale = await save({ basedOn: 1, document: changed(editor, 1900), reason: 'From an old copy' });
    expect(stale.status).toBe(409);
    expect((await json<{ error: string }>(stale)).error).toBe('stale');
  });

  test('a change needs a reason, must change something, and must be a design', async () => {
    const editor = await json<Editor>(await editorFor());
    const codes = async (body: unknown) => {
      const response = await save(body);
      return [response.status, (await json<{ error: string }>(response)).error];
    };
    expect(await codes({ basedOn: 2, document: changed(editor, 1900), reason: '   ' })).toEqual([400, 'reason_needed']);
    expect(await codes({ basedOn: 2, document: editor.revision.document, reason: 'Nothing really' })).toEqual([400, 'unchanged']);
    expect(await codes({ basedOn: 2, document: { format: 1, design: 'a bath' }, reason: 'Broken' })).toEqual([422, 'invalid_design']);
    expect(
      await codes({ basedOn: 2, document: changed(editor, 1900), reason: 'Bad file', attachments: [{ filename: 'x.png', content: btoa('not a picture'), kind: 'drawing' }] })
    ).toEqual([400, 'unsupported_file']);
    expect((await json<Saved>(await api(`/jobs/${jobId}`, { cookie: owner }))).designs[0].revision.number).toBe(2);
  });

  test('another company’s shower can be neither opened nor changed', async () => {
    const editor = await json<Editor>(await editorFor());
    expect((await save({ basedOn: 2, document: changed(editor, 1900), reason: 'Not ours' }, rival)).status).toBe(404);
    expect((await json<Saved>(await api(`/jobs/${jobId}`, { cookie: owner }))).designs[0].revision.number).toBe(2);
  });
});
