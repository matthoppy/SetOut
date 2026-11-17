/**
 * Sending a customer their installation sheets, for a company's staff.
 *
 * A supply-only customer's own fitter has only the sheet and its fitting
 * guide to go on, so nothing reaches the customer that a member of staff has
 * not looked over. It takes two steps. Approving records what was looked
 * over: every shower on the job, checked, at the revision it stands at, with
 * the address and installation comments as they then read. Sending emails
 * the customer a link to read and print it, and is refused if anything the
 * approval covers has changed since: approve it again first.
 *
 * A new approval replaces one that was never sent. A sent one stays on
 * record, and its link keeps opening what was sent.
 */

import { Hono } from 'hono';
import type { Session } from '../db/auth';
import { companyDb, type CompanyDb } from '../db/company-db';
import { hashResumeToken, newInstallationToken } from '../db/platform';
import type { CoveredRevision, InstallationSheetRow, Row } from '../db/tables';
import { sendEmail } from '../lib/email';
import { installationEmail } from '../lib/installation-email';
import { fromLine, mailIsSetUp } from '../lib/notify';

type Bindings = { Bindings: Env; Variables: { session: Session } };

export const staffInstallation = new Hono<Bindings>();

const PRIVATE = { 'Cache-Control': 'no-store' };
const NO_JOB = { error: 'not_found', message: 'There is no such job.' } as const;

type Problem = { error: string; message: string };

/** A job's showers, in order, each with the revision it stands at. */
async function showersOf(db: CompanyDb, jobId: string) {
  const designs = await db.find('designs', { where: { job_id: jobId }, orderBy: { column: 'position' } });
  const revisions = await Promise.all(
    designs.map((d) => db.find('design_revisions', { where: { design_id: d.id, number: d.current_revision }, limit: 1 }))
  );
  return designs.flatMap((design, i) => (revisions[i][0] ? [{ design, revision: revisions[i][0] }] : []));
}

const showerName = (label: string, i: number, count: number) =>
  label && label !== 'Shower' ? label : count > 1 ? `Shower ${i + 1}` : 'the shower';

/** Where the glass goes and what the fitters are told, as the job now has them. */
async function detailsOf(db: CompanyDb, job: Row<'jobs'>) {
  const customer = await db.get('customers', job.customer_id);
  const clean = (text: string | null | undefined) => (text ?? '').trim() || null;
  return {
    customer,
    address: clean(job.site_address ?? customer?.address),
    postcode: clean(job.site_postcode ?? customer?.postcode),
    notes: clean(job.install_notes),
  };
}

/** Why the job's sheets cannot be approved as things stand, or null if they can. */
function approvalBlocker(showers: Awaited<ReturnType<typeof showersOf>>): Problem | null {
  if (showers.length === 0) return { error: 'no_shower', message: 'This job has no shower yet, so it has no installation sheet.' };
  const unchecked = showers.findIndex(({ revision }) => !revision.checked_at);
  if (unchecked >= 0) {
    return {
      error: 'not_checked',
      message: `Check ${showerName(showers[unchecked].design.label, unchecked, showers.length)} on the job page before approving its installation sheet.`,
    };
  }
  // Sliding door sizes are not confirmed against a job yet (Sliding.tsx), so
  // a sliding shower's sheet does not go to a customer's own fitter.
  const sliding = showers.findIndex(({ revision }) => revision.computed.sliding);
  if (sliding >= 0) {
    return {
      error: 'sliding',
      message: `${showerName(showers[sliding].design.label, sliding, showers.length)} has a sliding door, whose sizes are not confirmed yet, so its sheet cannot go to a customer.`,
    };
  }
  return null;
}

/** What has changed since a sheet was approved, or null if nothing has. */
function changedSince(
  sheet: InstallationSheetRow,
  showers: Awaited<ReturnType<typeof showersOf>>,
  details: { address: string | null; postcode: string | null; notes: string | null }
): Problem | null {
  const covered = new Map(sheet.covers.map((c) => [c.designId, c]));
  const moved =
    showers.length !== covered.size ||
    showers.some(({ design, revision }) => covered.get(design.id)?.revisionId !== revision.id || !revision.checked_at);
  if (moved) return { error: 'stale', message: 'A shower has changed since this sheet was approved. Look it over and approve it again.' };
  if (details.address !== sheet.address || details.postcode !== sheet.postcode || details.notes !== sheet.notes) {
    return { error: 'stale', message: 'The address or the installation comments have changed since this sheet was approved. Approve it again.' };
  }
  return null;
}

/** A sheet as the workspace shows it: never the hash of its link. */
function present(sheet: InstallationSheetRow) {
  const { link_token_hash: _, ...rest } = sheet;
  return rest;
}

async function latestOn(db: CompanyDb, jobId: string) {
  const [sheet] = await db.find('installation_sheets', { where: { job_id: jobId }, orderBy: { column: 'created_at', direction: 'desc' }, limit: 1 });
  return sheet ?? null;
}

/** Where the job's sheets stand: the last approval, whether it still holds, and what stands in the way of approving. */
staffInstallation.get('/jobs/:id/installation-sheet', async (c) => {
  const db = companyDb(c.env, c.get('session').companyId);
  const job = await db.get('jobs', c.req.param('id'));
  if (!job) return c.json(NO_JOB, 404, PRIVATE);
  const [sheet, showers, details] = await Promise.all([latestOn(db, job.id), showersOf(db, job.id), detailsOf(db, job)]);
  return c.json(
    {
      sheet: sheet && present(sheet),
      // Only an approval not yet sent can go stale; a sent one is what was sent.
      changed: sheet && !sheet.sent_at ? changedSince(sheet, showers, details) : null,
      blocker: approvalBlocker(showers),
      customerEmail: details.customer?.email ?? null,
    },
    200,
    PRIVATE
  );
});

/** Approve the job's sheets as they now stand. */
staffInstallation.post('/jobs/:id/installation-sheet/approve', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  const job = await db.get('jobs', c.req.param('id'));
  if (!job) return c.json(NO_JOB, 404, PRIVATE);
  const [showers, details, existing] = await Promise.all([
    showersOf(db, job.id),
    detailsOf(db, job),
    db.find('installation_sheets', { where: { job_id: job.id } }),
  ]);
  const blocker = approvalBlocker(showers);
  if (blocker) return c.json(blocker, 409, PRIVATE);

  const covers: CoveredRevision[] = showers.map(({ design, revision }) => ({ designId: design.id, revisionId: revision.id, number: revision.number }));
  const approvedAt = new Date().toISOString();
  await db.batch((batch) => {
    // An approval never sent is replaced; a sent one stays on record.
    for (const old of existing) if (!old.sent_at) batch.remove('installation_sheets', old.id);
    batch.insert('installation_sheets', {
      job_id: job.id,
      covers,
      address: details.address,
      postcode: details.postcode,
      notes: details.notes,
      approved_by: session.userId,
      approved_at: approvedAt,
    });
    batch.insert('job_events', {
      job_id: job.id,
      type: 'installation_sheet_approved',
      actor_kind: 'staff',
      actor_id: session.userId,
      data: { covers },
    });
  });
  const sheet = await latestOn(db, job.id);
  return c.json({ ok: true, sheet: sheet && present(sheet) }, 201, PRIVATE);
});

/**
 * Send an approved sheet to the customer. They are emailed a link to read and
 * print it; the link is shown to staff once too, to pass on another way.
 */
staffInstallation.post('/jobs/:id/installation-sheet/:sheetId/send', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  const job = await db.get('jobs', c.req.param('id'));
  if (!job) return c.json(NO_JOB, 404, PRIVATE);
  const sheet = await db.get('installation_sheets', c.req.param('sheetId'));
  if (!sheet || sheet.job_id !== job.id) {
    return c.json({ error: 'not_found', message: 'There is no such installation sheet on this job.' }, 404, PRIVATE);
  }
  if (sheet.sent_at) return c.json({ error: 'already_sent', message: 'This sheet has already been sent.' }, 409, PRIVATE);
  const latest = await latestOn(db, job.id);
  if (latest?.id !== sheet.id) {
    return c.json({ error: 'stale', message: 'This sheet has been approved again since. Send the latest one.' }, 409, PRIVATE);
  }
  const [showers, details] = await Promise.all([showersOf(db, job.id), detailsOf(db, job)]);
  const changed = changedSince(sheet, showers, details);
  if (changed) return c.json(changed, 409, PRIVATE);
  const customer = details.customer;
  if (!customer?.email) {
    return c.json({ error: 'no_email', message: 'The customer has no email address to send the sheet to.' }, 409, PRIVATE);
  }

  const token = newInstallationToken();
  const sentAt = new Date().toISOString();
  let sent: InstallationSheetRow | null;
  try {
    sent = await db.update('installation_sheets', sheet.id, { link_token_hash: await hashResumeToken(token), sent_by: session.userId, sent_at: sentAt });
  } catch (error) {
    // Sent by someone else at the same moment: the database refuses a second send.
    if (/never changed/.test(error instanceof Error ? error.message : String(error))) {
      return c.json({ error: 'already_sent', message: 'This sheet has already been sent.' }, 409, PRIVATE);
    }
    throw error;
  }
  if (!sent) return c.json({ error: 'not_found', message: 'There is no such installation sheet on this job.' }, 404, PRIVATE);
  await db.insert('job_events', {
    job_id: job.id,
    type: 'installation_sheet_sent',
    actor_kind: 'staff',
    actor_id: session.userId,
    data: { sheetId: sheet.id, to: customer.email },
  });

  // The customer's link opens on the designer's address, the public one, so
  // nothing about staff sign-in is ever near it.
  const base = c.env.DESIGNER_HOST ? `https://${c.env.DESIGNER_HOST}` : new URL(c.req.url).origin;
  const link = `${base}/i/${token}`;
  const mail = { apiKey: c.env.RESEND_API_KEY, from: c.env.EMAIL_FROM };
  let emailed = false;
  if (mailIsSetUp(mail)) {
    const [company, designer] = await Promise.all([db.company(), job.designer_id ? db.get('designers', job.designer_id) : Promise.resolve(null)]);
    const message = installationEmail(fromLine(company?.name ?? 'SetOut', mail.from), customer.email, {
      company: company?.name ?? 'SetOut',
      reference: job.reference,
      customerName: customer.name,
      showers: sheet.covers.length,
      link,
      replyTo: designer?.notify_emails[0] ?? null,
    });
    const record = (type: string, data: Record<string, unknown>) =>
      db.insert('job_events', { job_id: job.id, type, actor_kind: 'system', data: { to: 'customer', what: 'installation_sheet', ...data } });
    c.executionCtx.waitUntil(
      sendEmail(mail.apiKey, message)
        .then(() => record('email_sent', {}))
        .catch((error: unknown) => record('email_failed', { reason: error instanceof Error ? error.message : String(error) }))
        .catch(() => undefined)
    );
    emailed = true;
  } else {
    await db.insert('job_events', {
      job_id: job.id,
      type: 'email_not_sent',
      actor_kind: 'system',
      data: { to: 'customer', what: 'installation_sheet', reason: 'Mail is not set up here.' },
    });
  }
  return c.json({ ok: true, sheet: present(sent), link, emailed }, 200, PRIVATE);
});
