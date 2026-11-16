/**
 * A customer confirming their order, on the page their link opens.
 *
 * Public, like a quote: whoever holds the link can see that one job's order
 * summary and confirm it, and nothing else. The link is the only thing that
 * ties a request to a company. It answers on the designer's address, the
 * public one, never where staff sign in, and the link never travels on as a
 * referrer to anywhere else.
 *
 * The answers are written on the job's timeline as an order_confirmed event,
 * with what the customer was shown, and the workshop is emailed. Opening the
 * link again shows the thank-you.
 */

import { Hono, type Context } from 'hono';
import { companyDb, type CompanyDb } from '../db/company-db';
import { resolveConfirmationLink, type DesignerSettings } from '../db/platform';
import type { Row } from '../db/tables';
import { sendEmail } from '../lib/email';
import { fromLine, mailIsSetUp } from '../lib/notify';
import {
  confirmationCsp,
  confirmedEmail,
  formPage,
  notFoundPage,
  readAnswers,
  summarise,
  thankYouPage,
  type OrderSummary,
  type Posted,
} from '../lib/order-confirmation';

export const confirmation = new Hono<{ Bindings: Env }>();

type Ctx = Context<{ Bindings: Env }>;

function nonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

function page(c: Ctx, html: (nonce: string) => string, status: 200 | 400 | 403 | 404 = 200): Response {
  const n = nonce();
  return c.html(html(n), status, {
    'Content-Security-Policy': confirmationCsp(n),
    'Cache-Control': 'no-store',
    // Same-origin, not no-referrer: the link never travels to another site,
    // and the browser still says where the form was posted from.
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  });
}

interface Opened {
  db: CompanyDb;
  link: Row<'order_confirmations'>;
  job: Row<'jobs'>;
  summary: OrderSummary;
  revisionId: string;
  designerId: string | null;
}

/**
 * The job behind a link, and what its customer is shown. Null for a link that
 * opens nothing, or a job with no shower saved yet.
 *
 * TODO: a job with several showers shows only the first. Confirmation links
 * are for single-shower supply orders for now.
 */
async function open(env: Env, token: string): Promise<Opened | null> {
  const found = await resolveConfirmationLink(env, token);
  if (!found) return null;
  const db = companyDb(env, found.companyId);
  const link = await db.get('order_confirmations', found.confirmationId);
  const job = link ? await db.get('jobs', link.job_id) : null;
  if (!link || !job) return null;
  const [customer, designs] = await Promise.all([
    db.get('customers', job.customer_id),
    db.find('designs', { where: { job_id: job.id }, orderBy: { column: 'position' } }),
  ]);
  const design = designs[0];
  if (!design) return null;
  const [revision] = await db.find('design_revisions', { where: { design_id: design.id, number: design.current_revision }, limit: 1 });
  if (!revision) return null;
  const designer = job.designer_id ? await db.get('designers', job.designer_id) : (await db.find('designers', { limit: 1 }))[0] ?? null;
  const settings = (designer?.config ?? {}) as DesignerSettings;
  const summary = summarise({
    reference: job.reference,
    customerName: customer?.name ?? null,
    postcode: job.site_postcode ?? customer?.postcode ?? null,
    design: revision.document.design,
    spec: revision.computed,
    finishes: settings.finishes,
    handles: settings.handles,
  });
  return { db, link, job, summary, revisionId: revision.id, designerId: designer?.id ?? null };
}

/** The order, as the customer reads it: the form, or the thank-you once confirmed. */
confirmation.get('/:token', async (c) => {
  const found = await open(c.env, c.req.param('token'));
  if (!found) return page(c, notFoundPage, 404);
  if (found.link.confirmed_at) return page(c, (n) => thankYouPage(found.summary, n));
  return page(c, (n) => formPage(found.summary, c.req.path, { values: {}, error: null }, n));
});

/**
 * Confirm the order. A mistake comes back with the answers kept and the first
 * problem shown. Confirming twice changes nothing: the second is sent to the
 * thank-you, and the database refuses a second confirmation outright.
 */
confirmation.post('/:token', async (c) => {
  // From this page only. A form post says its origin; where a browser sends
  // "null" instead, it still says whether the post came from the same site.
  const origin = c.req.header('origin');
  const sameSite = origin === new URL(c.req.url).origin || ((!origin || origin === 'null') && c.req.header('sec-fetch-site') === 'same-origin');
  if (!sameSite) return page(c, notFoundPage, 403);
  const found = await open(c.env, c.req.param('token'));
  if (!found) return page(c, notFoundPage, 404);
  const { db, link, job, summary } = found;
  const done = () => c.redirect(c.req.path, 303);
  if (link.confirmed_at) return done();

  const raw = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const values: Posted = {};
  for (const [key, value] of Object.entries(raw)) if (typeof value === 'string') values[key] = value;

  const read = readAnswers(job.reference, values);
  if ('error' in read) {
    return page(c, (n) => formPage(summary, c.req.path, { values, error: read.error }, n), 400);
  }
  const { answers } = read;
  try {
    await db.batch((batch) => {
      batch.update('order_confirmations', link.id, { confirmed_at: answers.submitted_at });
      batch.insert('job_events', {
        job_id: job.id,
        type: 'order_confirmed',
        actor_kind: 'customer',
        data: { ...answers, confirmationId: link.id, revisionId: found.revisionId, shown: Object.fromEntries(summary.rows) },
      });
    });
  } catch {
    // Confirmed a moment ago, from another press or another tab.
    return done();
  }

  // Tell the workshop, on the addresses its designer sends enquiries to.
  // Nothing is sent where mail is not set up (EMAIL_FROM and RESEND_API_KEY).
  const mail = { apiKey: c.env.RESEND_API_KEY, from: c.env.EMAIL_FROM };
  const designer = found.designerId ? await db.get('designers', found.designerId) : null;
  const to = designer?.notify_emails ?? [];
  if (mailIsSetUp(mail) && to.length > 0) {
    const company = await db.company();
    const appBase = c.env.APP_HOST ? `https://${c.env.APP_HOST}` : new URL(c.req.url).origin;
    const message = confirmedEmail(fromLine(company?.name ?? 'SetOut', mail.from), to, {
      reference: job.reference,
      answers,
      jobLink: `${appBase}/jobs/${job.id}`,
    });
    const record = (type: string, data: Record<string, unknown>) =>
      db.insert('job_events', { job_id: job.id, type, actor_kind: 'system', data: { to: 'company', what: 'order_confirmed', ...data } });
    c.executionCtx.waitUntil(
      sendEmail(mail.apiKey, message)
        .then(() => record('email_sent', {}))
        .catch((error: unknown) => record('email_failed', { reason: error instanceof Error ? error.message : String(error) }))
        .catch(() => undefined)
    );
  }
  return done();
});
