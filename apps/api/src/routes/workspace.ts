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
import { JOB_STAGES, ROLES, type JobStage, type Role } from '../db/tables';
import { ADDS_PER_DAY, addToTeam, changeRole, removeFromTeam, teamChanges, teamOf } from '../db/team';
import { sendEmail } from '../lib/email';
import { fromLine, mailIsSetUp } from '../lib/notify';
import { signInEmail } from '../lib/sign-in-email';
import { addedToTeamEmail } from '../lib/team-email';

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
// The team
// ---------------------------------------------------------------------------

const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);

/** Only an owner may change the team. The role is read from the membership on every request. */
const ownersOnly = createMiddleware<Bindings>(async (c, next) => {
  if (c.get('session').role !== 'owner') {
    return c.json({ error: 'owners_only', message: 'Only an owner can change the team.' }, 403, PRIVATE);
  }
  await next();
});

const LAST_OWNER = {
  error: 'last_owner',
  message: 'A company needs at least one owner. Make someone else an owner first.',
} as const;
const NO_MEMBER = { error: 'not_found', message: 'That person is not on the team.' } as const;

/** Everyone on the team. Owners also see the latest changes to it. */
staff.get('/team', async (c) => {
  const session = c.get('session');
  const [members, changes] = await Promise.all([
    teamOf(c.env, session.companyId),
    session.role === 'owner' ? teamChanges(c.env, session.companyId) : null,
  ]);
  return c.json({ members, ...(changes ? { changes } : {}) }, 200, PRIVATE);
});

/** Put someone on the team, and email them to say so. */
staff.post('/team', ownersOnly, async (c) => {
  const session = c.get('session');
  const body = (await c.req.json().catch(() => null)) as { email?: unknown; name?: unknown; role?: unknown } | null;
  const email = normaliseEmail(body?.email);
  if (!email) return c.json({ error: 'invalid_email', message: 'That does not look like an email address.' }, 400, PRIVATE);
  const role = body?.role ?? 'staff';
  if (!isRole(role)) return c.json({ error: 'invalid_role', message: 'A person is an owner or staff.' }, 400, PRIVATE);
  const name = typeof body?.name === 'string' ? body.name.replace(/\s+/g, ' ').trim().slice(0, 100) || null : null;

  const result = await addToTeam(c.env, session.companyId, session.userId, { email, name, role });
  if (!result.ok) {
    return result.reason === 'already_on_team'
      ? c.json({ error: 'already_on_team', message: 'That person is already on the team.' }, 409, PRIVATE)
      : c.json(
          { error: 'too_many_today', message: `A company can add up to ${ADDS_PER_DAY} people a day. Please try again tomorrow.` },
          429,
          PRIVATE
        );
  }

  const mail = { apiKey: c.env.RESEND_API_KEY, from: c.env.EMAIL_FROM };
  let emailed = false;
  if (mailIsSetUp(mail)) {
    const base = c.env.APP_HOST ? `https://${c.env.APP_HOST}` : new URL(c.req.url).origin;
    const message = addedToTeamEmail(fromLine('SetOut', mail.from), email, {
      company: session.companyName,
      by: session.name ?? session.email,
      byEmail: session.email,
      role,
      link: `${base}/sign-in?email=${encodeURIComponent(email)}`,
    });
    c.executionCtx.waitUntil(
      sendEmail(mail.apiKey, message).catch((error: unknown) => {
        console.error(JSON.stringify({ message: 'team email failed', reason: error instanceof Error ? error.message : String(error) }));
      })
    );
    emailed = true;
  }
  return c.json({ ok: true, member: result.member, emailed }, 201, PRIVATE);
});

/** Make someone an owner, or staff. */
staff.patch('/team/:id', ownersOnly, async (c) => {
  const session = c.get('session');
  const body = (await c.req.json().catch(() => null)) as { role?: unknown } | null;
  if (!isRole(body?.role)) return c.json({ error: 'invalid_role', message: 'A person is an owner or staff.' }, 400, PRIVATE);
  const result = await changeRole(c.env, session.companyId, session.userId, c.req.param('id'), body.role);
  if (result === 'not_found') return c.json(NO_MEMBER, 404, PRIVATE);
  if (result === 'last_owner') return c.json(LAST_OWNER, 409, PRIVATE);
  return c.json({ ok: true, role: body.role }, 200, PRIVATE);
});

/** Take someone off the team. They are signed out of it at once. */
staff.delete('/team/:id', ownersOnly, async (c) => {
  const session = c.get('session');
  const result = await removeFromTeam(c.env, session.companyId, session.userId, c.req.param('id'));
  if (result === 'not_found') return c.json(NO_MEMBER, 404, PRIVATE);
  if (result === 'last_owner') return c.json(LAST_OWNER, 409, PRIVATE);
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
  const staffIds = [
    ...new Set([
      ...events.filter((e) => e.actor_kind === 'staff' && e.actor_id).map((e) => e.actor_id as string),
      ...revisions.flatMap(([r]) => (r?.checked_by ? [r.checked_by] : [])),
    ]),
  ];
  const people = await usersByIds(c.env, c.get('session').companyId, staffIds);

  return c.json(
    {
      job,
      customer,
      designs: designs.map((design, i) => {
        const revision = revisions[i][0] ?? null;
        return {
          ...design,
          revision: revision && {
            ...revision,
            checkedBy: revision.checked_by ? (people[revision.checked_by] ?? null) : null,
          },
        };
      }),
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

/**
 * Mark the shower's current revision as checked: a member of staff has looked
 * over its sizes and is happy for it to be made. Only a checked revision can
 * become a making sheet or an order. The revision the person looked at is
 * named, so a design that changed in the meantime is never checked unseen.
 */
staff.post('/jobs/:id/designs/:designId/check', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  const body = (await c.req.json().catch(() => null)) as { revision?: unknown } | null;
  const found = await currentRevision(db, c.req.param('id'), c.req.param('designId'));
  if (!found) return c.json({ error: 'not_found', message: 'There is no such shower on this job.' }, 404, PRIVATE);
  const { job, design, revision } = found;
  if (body?.revision !== revision.number) {
    return c.json(
      { error: 'stale', message: 'This shower has changed since you opened it. Look it over again before checking it.' },
      409,
      PRIVATE
    );
  }
  if (revision.computed.blockingIssues.length > 0) {
    return c.json(
      { error: 'cannot_be_made', message: 'This shower cannot be made as drawn, so it cannot be checked.' },
      409,
      PRIVATE
    );
  }
  if (revision.checked_at) return c.json({ ok: true, checkedAt: revision.checked_at }, 200, PRIVATE);
  const at = new Date().toISOString();
  await db.batch((batch) => {
    batch.update('design_revisions', revision.id, { checked_by: session.userId, checked_at: at });
    batch.insert('job_events', {
      job_id: job.id,
      type: 'revision_checked',
      actor_kind: 'staff',
      actor_id: session.userId,
      data: { designId: design.id, label: design.label, revision: revision.number },
    });
  });
  return c.json({ ok: true, checkedAt: at }, 200, PRIVATE);
});

/** Take back a check, when something is found that needs another look. */
staff.delete('/jobs/:id/designs/:designId/check', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  const found = await currentRevision(db, c.req.param('id'), c.req.param('designId'));
  if (!found) return c.json({ error: 'not_found', message: 'There is no such shower on this job.' }, 404, PRIVATE);
  const { job, design, revision } = found;
  if (!revision.checked_at) return c.json({ ok: true }, 200, PRIVATE);
  await db.batch((batch) => {
    batch.update('design_revisions', revision.id, { checked_by: null, checked_at: null });
    batch.insert('job_events', {
      job_id: job.id,
      type: 'revision_unchecked',
      actor_kind: 'staff',
      actor_id: session.userId,
      data: { designId: design.id, label: design.label, revision: revision.number },
    });
  });
  return c.json({ ok: true }, 200, PRIVATE);
});

/** A job's shower and the revision it now stands at, or null if either is not this company's. */
async function currentRevision(db: ReturnType<typeof companyDb>, jobId: string, designId: string) {
  const job = await db.get('jobs', jobId);
  if (!job) return null;
  const design = await db.get('designs', designId);
  if (!design || design.job_id !== job.id) return null;
  const [revision] = await db.find('design_revisions', { where: { design_id: design.id, number: design.current_revision }, limit: 1 });
  return revision ? { job, design, revision } : null;
}

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
