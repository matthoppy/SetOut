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

import { buildSpec, DOCUMENT_FORMAT, DocumentError, ENGINE_VERSION, upgradeDocument } from '@setout/engine';
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
import { designerConfig, optionLabelsFor } from '../lib/designer-config';
import { sendEmail } from '../lib/email';
import { readFiles, RequestError } from '../lib/enquiry';
import { fromLine, mailIsSetUp } from '../lib/notify';
import { signInEmail } from '../lib/sign-in-email';
import { staffQuotes } from './staff-quotes';
import { staffSettings } from './settings';
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

  const [customer, designs, files, events, quotes, labels] = await Promise.all([
    db.get('customers', job.customer_id),
    db.find('designs', { where: { job_id: job.id }, orderBy: { column: 'position' } }),
    db.find('files', { where: { job_id: job.id }, orderBy: { column: 'created_at' } }),
    db.find('job_events', { where: { job_id: job.id }, orderBy: { column: 'created_at' }, limit: 500 }),
    db.find('quotes', { where: { job_id: job.id }, orderBy: { column: 'number' } }),
    optionLabelsFor(db, job),
  ]);
  const revisions = await Promise.all(
    designs.map((d) => db.find('design_revisions', { where: { design_id: d.id, number: d.current_revision }, limit: 1 }))
  );
  // Who did what, for the timeline. Staff are named; nobody else's id is.
  const staffIds = [
    ...new Set([
      ...events.filter((e) => e.actor_kind === 'staff' && e.actor_id).map((e) => e.actor_id as string),
      ...revisions.flatMap(([r]) => (r?.checked_by ? [r.checked_by] : [])),
      ...revisions.flatMap(([r]) => (r?.author_kind === 'staff' && r.author_id ? [r.author_id] : [])),
    ]),
  ];
  const people = await usersByIds(c.env, c.get('session').companyId, staffIds);

  return c.json(
    {
      job,
      customer,
      // What the company calls its finishes and handles, for the sheets.
      labels,
      designs: designs.map((design, i) => {
        const revision = revisions[i][0] ?? null;
        return {
          ...design,
          revision: revision && {
            ...revision,
            checkedBy: revision.checked_by ? (people[revision.checked_by] ?? null) : null,
            changedBy: revision.author_kind === 'staff' && revision.author_id ? (people[revision.author_id] ?? null) : null,
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
      quotes: quotes.map((q) => ({
        id: q.id,
        number: q.number,
        status: q.status,
        totalPence: q.total_pence,
        currency: q.currency,
        createdAt: q.created_at,
        sentAt: q.sent_at,
        validUntil: q.valid_until,
        acceptedAt: q.accepted_at,
        acceptedName: q.accepted_name,
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

staff.route('/', staffQuotes);
staff.route('/', staffSettings);

// ---------------------------------------------------------------------------
// Changing a design
// ---------------------------------------------------------------------------

/**
 * What the staff editor needs to open a shower: the designer the job came
 * from, with its company's options and rules, and the revision the shower
 * stands at. The shower is drawn and worked out exactly as its customer saw it.
 */
staff.get('/jobs/:id/designs/:designId/editor', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  const found = await currentRevision(db, c.req.param('id'), c.req.param('designId'));
  if (!found) return c.json({ error: 'not_found', message: 'There is no such shower on this job.' }, 404, PRIVATE);
  const { job, design, revision } = found;

  const designerId = job.designer_id ?? (await db.find('designers', { limit: 1 }))[0]?.id;
  const config = designerId ? await designerConfig(c.env, session.companyId, designerId) : null;
  if (!config) {
    return c.json({ error: 'no_designer', message: 'This company has no designer to change the shower in.' }, 409, PRIVATE);
  }
  const [[received], customer] = await Promise.all([
    db.find('job_events', { where: { job_id: job.id, type: 'received' }, limit: 1 }),
    db.get('customers', job.customer_id),
  ]);
  return c.json(
    {
      config,
      job: { id: job.id, reference: job.reference, customer: customer?.name ?? null },
      design: { id: design.id, label: design.label },
      revision: { number: revision.number, document: revision.document },
      templateId: typeof received?.data.template === 'string' ? received.data.template : null,
    },
    200,
    PRIVATE
  );
});

/** A reason is asked for every change, for the timeline. */
const MAX_REASON = 500;
/** The plan, the elevation and what was measured, with room to spare. */
const MAX_DRAWINGS = 4;
/** Four drawings as base64, and the design. */
const MAX_REVISION_BYTES = 12 * 1024 * 1024;

/** A value as text with its keys in order, so two designs that say the same thing compare equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Save a changed design as the shower's next revision.
 *
 * The design is checked and worked out again here, with the company's rules,
 * as a customer's is. The request names the revision the change was made
 * from: if someone else saved one since, this is refused rather than lost
 * over theirs. The new revision is not checked, whatever the last one was.
 */
staff.post('/jobs/:id/designs/:designId/revisions', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  if (Number(c.req.header('content-length') ?? 0) > MAX_REVISION_BYTES) {
    return c.json({ error: 'too_large', message: 'That is too much to save at once.' }, 413, PRIVATE);
  }
  const body = (await c.req.json().catch(() => null)) as {
    basedOn?: unknown;
    document?: unknown;
    reason?: unknown;
    attachments?: unknown;
  } | null;
  if (!body) return c.json({ error: 'invalid_request', message: 'The request must be a JSON object.' }, 400, PRIVATE);

  const found = await currentRevision(db, c.req.param('id'), c.req.param('designId'));
  if (!found) return c.json({ error: 'not_found', message: 'There is no such shower on this job.' }, 404, PRIVATE);
  const { job, design, revision } = found;
  if (body.basedOn !== revision.number) {
    return c.json(
      {
        error: 'stale',
        message: `Someone saved revision ${revision.number} of this shower while you were changing it. Open it again to see their change.`,
      },
      409,
      PRIVATE
    );
  }
  const reason = typeof body.reason === 'string' ? body.reason.replace(/\s+/g, ' ').trim() : '';
  if (!reason) return c.json({ error: 'reason_needed', message: 'Say what changed and why, for the timeline.' }, 400, PRIVATE);
  if (reason.length > MAX_REASON) {
    return c.json({ error: 'reason_too_long', message: `Keep the reason to ${MAX_REASON} characters.` }, 400, PRIVATE);
  }

  let document;
  try {
    document = upgradeDocument(body.document);
  } catch (error) {
    if (error instanceof DocumentError) {
      return c.json({ error: 'invalid_design', message: `That design could not be read: ${error.message}` }, 422, PRIVATE);
    }
    throw error;
  }
  if (canonical(document.design) === canonical(revision.document.design)) {
    return c.json({ error: 'unchanged', message: `Nothing has changed since revision ${revision.number}.` }, 400, PRIVATE);
  }
  let drawings;
  try {
    drawings = readFiles(body.attachments, MAX_DRAWINGS).filter((f) => f.kind === 'drawing');
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status, PRIVATE);
    throw error;
  }

  const { context, rulesetVersion } = await db.engineContext();
  const computed = buildSpec(document.design, context);
  const number = revision.number + 1;
  let revisionId = '';
  try {
    await db.batch((batch) => {
      revisionId = batch.insert('design_revisions', {
        design_id: design.id,
        number,
        document,
        format_version: DOCUMENT_FORMAT,
        engine_version: ENGINE_VERSION,
        ruleset_version: rulesetVersion,
        computed,
        author_kind: 'staff',
        author_id: session.userId,
        reason,
      });
      batch.update('designs', design.id, { current_revision: number });
      batch.insert('job_events', {
        job_id: job.id,
        type: 'revision_saved',
        actor_kind: 'staff',
        actor_id: session.userId,
        data: {
          designId: design.id,
          label: design.label,
          revision: number,
          reason,
          warnings: computed.warnings.length,
          blockingIssues: computed.blockingIssues.length,
        },
      });
    });
  } catch (error) {
    // Two people saving from the same revision at once: the database keeps
    // revision numbers unique, so the second is refused here.
    if (/UNIQUE/i.test(error instanceof Error ? error.message : String(error))) {
      return c.json(
        { error: 'stale', message: 'Someone else saved a change to this shower at the same moment. Open it again to see theirs.' },
        409,
        PRIVATE
      );
    }
    throw error;
  }

  // The change is safe. Now its drawings, which the job page shows for it.
  const stored: { key: string; file: (typeof drawings)[number] }[] = [];
  for (const file of drawings) {
    const key = `${session.companyId}/jobs/${job.id}/${crypto.randomUUID()}-${file.filename}`;
    try {
      await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: file.contentType } });
      stored.push({ key, file });
    } catch (error) {
      console.error(JSON.stringify({ message: 'drawing not stored', job: job.id, error: error instanceof Error ? error.message : String(error) }));
    }
  }
  if (stored.length > 0) {
    await db.batch((batch) => {
      for (const { key, file } of stored) {
        batch.insert('files', {
          job_id: job.id,
          revision_id: revisionId,
          kind: 'drawing',
          storage_key: key,
          content_type: file.contentType,
          size_bytes: file.bytes.length,
        });
      }
    });
  }
  return c.json({ ok: true, revision: number, drawings: stored.length }, 201, PRIVATE);
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

const MAX_ADDRESS_LINES = 6;
const MAX_ADDRESS = 300;
const MAX_POSTCODE = 12;
const MAX_INSTALL_NOTES = 2000;

type Tidied = { ok: true; value: string | null | undefined } | { ok: false };

/** An address as lines, each trimmed, blank ones dropped. Missing means unchanged; empty means none. */
function tidyAddress(input: unknown): Tidied {
  if (input === undefined) return { ok: true, value: undefined };
  if (input === null) return { ok: true, value: null };
  if (typeof input !== 'string') return { ok: false };
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const value = lines.join('\n');
  if (lines.length > MAX_ADDRESS_LINES || value.length > MAX_ADDRESS) return { ok: false };
  return { ok: true, value: value || null };
}

function tidyPostcode(input: unknown): Tidied {
  if (input === undefined) return { ok: true, value: undefined };
  if (input === null) return { ok: true, value: null };
  if (typeof input !== 'string') return { ok: false };
  const value = input.replace(/\s+/g, ' ').trim().toUpperCase();
  return value.length > MAX_POSTCODE ? { ok: false } : { ok: true, value: value || null };
}

function tidyNotes(input: unknown): Tidied {
  if (input === undefined) return { ok: true, value: undefined };
  if (input === null) return { ok: true, value: null };
  if (typeof input !== 'string') return { ok: false };
  const value = input.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return value.length > MAX_INSTALL_NOTES ? { ok: false } : { ok: true, value: value || null };
}

/**
 * Where the glass goes and what the fitters are told, for the job's
 * installation sheets. A field left out stays as it is. The timeline says who
 * changed which.
 */
staff.patch('/jobs/:id/installation', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  const body = (await c.req.json().catch(() => null)) as { address?: unknown; postcode?: unknown; notes?: unknown } | null;
  if (!body || typeof body !== 'object') return c.json({ error: 'invalid_request', message: 'Send the address, postcode or comments.' }, 400, PRIVATE);
  const address = tidyAddress(body.address);
  if (!address.ok) {
    return c.json(
      { error: 'invalid_address', message: `An address can be up to ${MAX_ADDRESS_LINES} lines and ${MAX_ADDRESS} characters.` },
      400,
      PRIVATE
    );
  }
  const postcode = tidyPostcode(body.postcode);
  if (!postcode.ok) return c.json({ error: 'invalid_postcode', message: 'That does not look like a postcode.' }, 400, PRIVATE);
  const notes = tidyNotes(body.notes);
  if (!notes.ok) {
    return c.json({ error: 'notes_too_long', message: `The comments can be up to ${MAX_INSTALL_NOTES} characters.` }, 400, PRIVATE);
  }

  const job = await db.get('jobs', c.req.param('id'));
  if (!job) return c.json({ error: 'not_found', message: 'There is no such job.' }, 404, PRIVATE);
  const changes: { site_address?: string | null; site_postcode?: string | null; install_notes?: string | null } = {};
  const changed: ('address' | 'postcode' | 'notes')[] = [];
  if (address.value !== undefined && address.value !== job.site_address) {
    changes.site_address = address.value;
    changed.push('address');
  }
  if (postcode.value !== undefined && postcode.value !== job.site_postcode) {
    changes.site_postcode = postcode.value;
    changed.push('postcode');
  }
  if (notes.value !== undefined && notes.value !== job.install_notes) {
    changes.install_notes = notes.value;
    changed.push('notes');
  }
  if (changed.length > 0) {
    await db.batch((batch) => {
      batch.update('jobs', job.id, changes);
      batch.insert('job_events', {
        job_id: job.id,
        type: 'installation_changed',
        actor_kind: 'staff',
        actor_id: session.userId,
        data: { changed },
      });
    });
  }
  const saved = { ...job, ...changes };
  return c.json(
    { ok: true, installation: { address: saved.site_address, postcode: saved.site_postcode, notes: saved.install_notes } },
    200,
    PRIVATE
  );
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
