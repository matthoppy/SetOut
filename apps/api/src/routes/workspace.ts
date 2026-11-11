/**
 * The workspace's routes.
 *
 * Called by the workspace, from SetOut's own address, by signed-in staff. A
 * request is tied to a company by its session and by nothing it says: the
 * session names the person, and the company they are working in is checked
 * against their memberships every time.
 *
 * The session is a cookie that only this address is sent, that scripts on
 * the page cannot read, and that other websites cannot make the browser
 * send with a change. Every change must also come from the workspace's own
 * pages.
 */

import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import {
  companiesOf,
  endSession,
  issueSignInLink,
  normaliseEmail,
  redeemSignInLink,
  resolveSession,
  SESSION_DAYS,
  switchCompany,
  type Session,
} from '../db/auth';
import { companyDb } from '../db/company-db';
import { usersByIds } from '../db/platform';
import { JOB_STAGES, type JobStage } from '../db/tables';
import { sendEmail } from '../lib/email';
import { fromLine, mailIsSetUp } from '../lib/notify';
import { signInEmail } from '../lib/sign-in-email';

type Bindings = { Bindings: Env; Variables: { session: Session } };

export const workspace = new Hono<Bindings>();

/** Only this address is sent it, only over HTTPS, and no script can read it. */
export const SESSION_COOKIE = '__Host-setout_session';

const PRIVATE = { 'Cache-Control': 'no-store' };

// A change must come from the workspace's own pages. With the cookie sent only
// on same-site requests, this is the second of two locks against another
// website making a signed-in browser do something.
workspace.use('*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.header('origin') !== new URL(c.req.url).origin) {
    return c.json({ error: 'wrong_origin', message: 'That request did not come from the workspace.' }, 403);
  }
  await next();
});

// ---------------------------------------------------------------------------
// Signing in
// ---------------------------------------------------------------------------

/**
 * Ask for a sign-in link. The answer is the same whether or not the address
 * belongs to anyone, and takes the same time, so it says nothing about who
 * has an account.
 */
workspace.post('/sign-in', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { email?: unknown } | null;
  const email = normaliseEmail(body?.email);
  if (!email) return c.json({ error: 'invalid_email', message: 'That does not look like an email address.' }, 400);

  const token = await issueSignInLink(c.env, email);
  if (token) {
    const base = c.env.APP_HOST ? `https://${c.env.APP_HOST}` : new URL(c.req.url).origin;
    const link = `${base}/sign-in?token=${token}`;
    const mail = { apiKey: c.env.RESEND_API_KEY, from: c.env.EMAIL_FROM };
    if (mailIsSetUp(mail)) {
      c.executionCtx.waitUntil(
        sendEmail(mail.apiKey, signInEmail(fromLine('SetOut', mail.from), email, link)).catch((error: unknown) => {
          console.error(JSON.stringify({ message: 'sign-in email failed', reason: error instanceof Error ? error.message : String(error) }));
        })
      );
    } else if (c.env.ENVIRONMENT === 'local') {
      // On a developer's own machine there is no mail, so the link comes back
      // in the answer. Nowhere else does it.
      return c.json({ ok: true, link }, 202, PRIVATE);
    }
  }
  return c.json({ ok: true }, 202, PRIVATE);
});

/** Use a sign-in link: the browser that does is signed in. */
workspace.post('/sign-in/verify', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { token?: unknown } | null;
  const session = await redeemSignInLink(c.env, body?.token);
  if (!session) {
    return c.json(
      { error: 'link_not_valid', message: 'That link has been used or has run out. Ask for a new one.' },
      400,
      PRIVATE
    );
  }
  setCookie(c, SESSION_COOKIE, session.token, {
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: SESSION_DAYS * 86_400,
  });
  return c.json({ ok: true }, 200, PRIVATE);
});

// ---------------------------------------------------------------------------
// Everything below needs a signed-in member of staff
// ---------------------------------------------------------------------------

const signedIn = createMiddleware<Bindings>(async (c, next) => {
  const session = await resolveSession(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return c.json({ error: 'signed_out', message: 'Please sign in.' }, 401, PRIVATE);
  c.set('session', session);
  await next();
});

const staff = new Hono<Bindings>();
staff.use('*', signedIn);

/** Who is signed in, the company they are working in, and their others. */
staff.get('/me', async (c) => {
  const session = c.get('session');
  const company = await companyDb(c.env, session.companyId).company();
  return c.json(
    {
      user: { id: session.userId, email: session.email, name: session.name },
      role: session.role,
      company: company && {
        id: company.id,
        name: company.name,
        referencePrefix: company.reference_prefix,
        branding: company.branding,
      },
      companies: await companiesOf(c.env, session.userId),
    },
    200,
    PRIVATE
  );
});

/** Work in another of one's companies. */
staff.post('/company', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { companyId?: unknown } | null;
  const companyId = typeof body?.companyId === 'string' ? body.companyId : '';
  if (!(await switchCompany(c.env, c.get('session'), companyId))) {
    return c.json({ error: 'not_found', message: 'You are not on that company’s team.' }, 404, PRIVATE);
  }
  return c.json({ ok: true }, 200, PRIVATE);
});

staff.post('/sign-out', async (c) => {
  await endSession(c.env, c.get('session'));
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
  return c.json({ ok: true }, 200, PRIVATE);
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

const isStage = (v: unknown): v is JobStage => typeof v === 'string' && (JOB_STAGES as readonly string[]).includes(v);
const PAGE = 50;

/**
 * Where the next page of the inbox starts: the last job listed, as when it
 * arrived and its id, since jobs can arrive in the same millisecond.
 */
const PAGE_MARK = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z)~(job_[0-9A-HJKMNP-TV-Z]{26})$/;

/**
 * The inbox: the company's jobs, newest first, with how many are at each
 * stage. A search narrows both the jobs and the counts.
 */
staff.get('/jobs', async (c) => {
  const db = companyDb(c.env, c.get('session').companyId);
  const stage = c.req.query('stage');
  if (stage !== undefined && stage !== '' && !isStage(stage)) {
    return c.json({ error: 'invalid_stage', message: 'There is no such stage.' }, 400, PRIVATE);
  }
  const page = c.req.query('after');
  const mark = page ? PAGE_MARK.exec(page) : null;
  if (page && !mark) {
    return c.json({ error: 'invalid_page', message: 'That page of jobs could not be found.' }, 400, PRIVATE);
  }
  const search = c.req.query('q') || undefined;
  const jobs = await db.jobs.inbox({
    stage: isStage(stage) ? stage : undefined,
    search,
    after: mark ? { createdAt: mark[1], id: mark[2] } : undefined,
    limit: PAGE,
  });
  const last = jobs.at(-1);
  return c.json(
    {
      jobs,
      counts: await db.jobs.stageCounts(search),
      next: jobs.length === PAGE && last ? `${last.createdAt}~${last.id}` : null,
    },
    200,
    PRIVATE
  );
});

/** Drawings first, then the photos that back up a measurement, then the rest. */
const FILE_ORDER = ['drawing', 'measuring_photo', 'photo', 'pdf', 'other'];

/** What a stored file is called, from where it is stored: after its folder and its random prefix. */
function fileName(storageKey: string): string {
  const last = storageKey.slice(storageKey.lastIndexOf('/') + 1);
  return last.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/, '');
}

/** Everything about one job: the customer, each shower as it now stands, its files and its timeline. */
staff.get('/jobs/:id', async (c) => {
  const db = companyDb(c.env, c.get('session').companyId);
  const job = await db.get('jobs', c.req.param('id'));
  if (!job) return c.json({ error: 'not_found', message: 'There is no such job.' }, 404, PRIVATE);

  const [customer, designs, files, events] = await Promise.all([
    db.get('customers', job.customer_id),
    db.find('designs', { where: { job_id: job.id }, orderBy: { column: 'position' } }),
    db.find('files', { where: { job_id: job.id }, orderBy: { column: 'created_at' } }),
    db.find('job_events', { where: { job_id: job.id }, orderBy: { column: 'created_at' }, limit: 500 }),
  ]);
  const revisions = await Promise.all(
    designs.map((d) => db.find('design_revisions', { where: { design_id: d.id, number: d.current_revision }, limit: 1 }))
  );
  // Who did what, for the timeline. Staff are named; nobody else's id is.
  const staffIds = [...new Set(events.filter((e) => e.actor_kind === 'staff' && e.actor_id).map((e) => e.actor_id as string))];
  const people = await usersByIds(c.env, c.get('session').companyId, staffIds);

  return c.json(
    {
      job,
      customer,
      designs: designs.map((design, i) => ({ ...design, revision: revisions[i][0] ?? null })),
      files: [...files]
        .sort(
          (a, b) =>
            FILE_ORDER.indexOf(a.kind) - FILE_ORDER.indexOf(b.kind) ||
            a.created_at.localeCompare(b.created_at) ||
            fileName(a.storage_key).localeCompare(fileName(b.storage_key))
        )
        .map((f) => ({
        id: f.id,
        kind: f.kind,
        name: fileName(f.storage_key),
        contentType: f.content_type,
        sizeBytes: f.size_bytes,
        revisionId: f.revision_id,
        createdAt: f.created_at,
      })),
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        actorKind: e.actor_kind,
        actor: e.actor_id ? (people[e.actor_id] ?? null) : null,
        data: e.data,
        createdAt: e.created_at,
      })),
    },
    200,
    PRIVATE
  );
});

/** Move a job to another stage. The timeline says who moved it, from where and to where. */
staff.patch('/jobs/:id', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  const body = (await c.req.json().catch(() => null)) as { stage?: unknown } | null;
  if (!isStage(body?.stage)) return c.json({ error: 'invalid_stage', message: 'There is no such stage.' }, 400, PRIVATE);
  const job = await db.get('jobs', c.req.param('id'));
  if (!job) return c.json({ error: 'not_found', message: 'There is no such job.' }, 404, PRIVATE);
  if (job.stage !== body.stage) {
    const stage = body.stage;
    await db.batch((batch) => {
      batch.update('jobs', job.id, { stage });
      batch.insert('job_events', {
        job_id: job.id,
        type: 'stage_changed',
        actor_kind: 'staff',
        actor_id: session.userId,
        data: { from: job.stage, to: stage },
      });
    });
  }
  return c.json({ ok: true, stage: body.stage }, 200, PRIVATE);
});

const MAX_NOTE = 4000;

/** Add a note to a job's timeline. */
staff.post('/jobs/:id/notes', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  const body = (await c.req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return c.json({ error: 'empty_note', message: 'A note needs something in it.' }, 400, PRIVATE);
  if (text.length > MAX_NOTE) {
    return c.json({ error: 'note_too_long', message: `A note can be up to ${MAX_NOTE} characters.` }, 400, PRIVATE);
  }
  const job = await db.get('jobs', c.req.param('id'));
  if (!job) return c.json({ error: 'not_found', message: 'There is no such job.' }, 404, PRIVATE);
  const event = await db.insert('job_events', {
    job_id: job.id,
    type: 'note',
    actor_kind: 'staff',
    actor_id: session.userId,
    data: { text },
  });
  return c.json({ ok: true, id: event.id }, 201, PRIVATE);
});

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/**
 * A job's drawing or photo. Only to its company's signed-in staff, never
 * cached anywhere but their own browser, and never anything a browser would
 * run as a page.
 */
staff.get('/files/:id', async (c) => {
  const db = companyDb(c.env, c.get('session').companyId);
  const file = await db.get('files', c.req.param('id'));
  if (!file || !file.job_id) return c.json({ error: 'not_found', message: 'There is no such file.' }, 404, PRIVATE);
  const object = await c.env.FILES.get(file.storage_key);
  if (!object) return c.json({ error: 'not_found', message: 'That file is missing from storage.' }, 404, PRIVATE);
  const name = fileName(file.storage_key).replace(/[^\w.() -]/g, '_');
  return new Response(object.body, {
    headers: {
      'Content-Type': file.content_type,
      'Content-Length': String(object.size),
      'Content-Disposition': `inline; filename="${name}"`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
});

workspace.route('/', staff);
