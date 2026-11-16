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
import { applyCutOverrides } from '../lib/cut-overrides';
import { sendEmail } from '../lib/email';
import { fromLine, mailIsSetUp } from '../lib/notify';
import {
  CONFIRMATION_BRAND,
  confirmationCsp,
  confirmedEmail,
  extrasOf,
  extrasPence,
  formPage,
  notFoundPage,
  readAnswers,
  summarise,
  thankYouPage,
  type OrderSummary,
  type PayAmount,
  type ExtraLine,
  type DeliveryAddress,
  type PayView,
  type Posted,
} from '../lib/order-confirmation';
import { createJobCheckout, jobPrice, mayStartPayment, paymentSettings, standingOf } from '../lib/job-payments';
import { StripeError } from '../lib/stripe';
import { termsFor, type TermsOfSale } from '../lib/terms-of-sale';
import { deliveryWindow, leadWorkingDaysOf, type DeliveryWindow } from '../lib/delivery-date';

export const confirmation = new Hono<{ Bindings: Env }>();

type Ctx = Context<{ Bindings: Env }>;

function nonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

function page(c: Ctx, html: (nonce: string) => string, status: 200 | 400 | 403 | 404 | 409 | 502 = 200): Response {
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
  /** The terms of sale shown in section 6: the company's own, or the default. */
  terms: TermsOfSale;
  /** The dates a delivery may be asked for, from today in London and the company's lead time. */
  window: DeliveryWindow;
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
    // The weight is of the glass as it will be cut, override and all. The
    // cut size itself is never shown.
    spec: applyCutOverrides(revision.computed, await db.find('cut_overrides', { where: { design_id: design.id } }), revision.document.design),
    finishes: settings.finishes,
    handles: settings.handles,
  });
  const companySettings = (await db.company())?.settings ?? {};
  const terms = await termsFor(companySettings);
  const window = deliveryWindow(new Date(), leadWorkingDaysOf(companySettings));
  return { db, link, job, summary, revisionId: revision.id, designerId: designer?.id ?? null, terms, window };
}

/**
 * The extras the customer chose when they confirmed through this link, from
 * the answers saved on the job's timeline. None before they confirm.
 */
async function confirmedAnswers(found: Opened): Promise<Record<string, unknown> | null> {
  if (!found.link.confirmed_at) return null;
  const events = await found.db.find('job_events', { where: { job_id: found.job.id, type: 'order_confirmed' } });
  const mine = events.filter((e) => (e.data as Record<string, unknown>).confirmationId === found.link.id).pop();
  return mine ? (mine.data as Record<string, unknown>) : null;
}

async function confirmedExtras(found: Opened): Promise<ExtraLine[]> {
  return extrasOf(await confirmedAnswers(found));
}

/** The delivery address the customer confirmed, if it is whole. */
function addressOf(answers: Record<string, unknown> | null): DeliveryAddress | null {
  const a = answers?.delivery_address as Partial<DeliveryAddress> | undefined;
  if (!a || typeof a.line1 !== 'string' || !a.line1 || typeof a.town !== 'string' || typeof a.postcode !== 'string') return null;
  return { line1: a.line1, line2: typeof a.line2 === 'string' ? a.line2 : '', town: a.town, postcode: a.postcode };
}

/**
 * Where paying stands for this job, as its page shows it. The price is the
 * job's quote; with no quote, or with what to charge still undecided, there
 * is nothing to pay and the page says so.
 */
async function payView(env: Env, found: Opened, confirmPath: string, options: { returned?: boolean; error?: string | null } = {}): Promise<PayView> {
  const { db, job, link } = found;
  const settings = paymentSettings(env, db.companyId);
  if (!settings.ok || !settings.settings.taxMode) return { kind: 'not_open' };
  const { taxMode } = settings.settings;
  const [payments, quotes] = await Promise.all([
    db.find('job_payments', { where: { job_id: job.id }, orderBy: { column: 'created_at' } }),
    db.find('quotes', { where: { job_id: job.id } }),
  ]);
  const standing = standingOf(payments);
  if (standing.state === 'refunded') return { kind: 'refunded' };
  if (standing.state === 'paid' || standing.state === 'partially_refunded') return { kind: 'paid', paidPence: standing.paidTotalPence };
  if (standing.openInvoice?.hosted_invoice_url) return { kind: 'invoice', invoiceUrl: standing.openInvoice.hosted_invoice_url, failed: standing.openInvoice.status === 'failed' };
  // Back from Stripe before its message: say so, rather than offer to pay again.
  if (options.returned && (standing.openCheckout || payments.some((p) => p.method === 'checkout' && p.status === 'pending'))) return { kind: 'processing' };

  const price = jobPrice(quotes, taxMode);
  if ('missing' in price) return { kind: 'no_price' };
  // Once confirmed, the extras chosen are part of what is paid.
  const extras = await confirmedExtras(found);
  const amount: PayAmount = { pence: price.amountPence + extrasPence(extras), packagePence: price.amountPence, extras, vat: taxMode === 'none' ? 'none' : taxMode === 'inclusive' ? 'included' : 'added' };
  if (!link.confirmed_at) return { kind: 'confirm_first', amount };
  const action = `${confirmPath}/pay`;
  if (standing.state === 'payment_failed' && !options.error) return { kind: 'failed', action, amount };
  return { kind: 'ready', action, amount, error: options.error ?? null };
}

/** The order, as the customer reads it: the form, or the thank-you once confirmed, with paying. */
confirmation.get('/:token', async (c) => {
  const found = await open(c.env, c.req.param('token'));
  if (!found) return page(c, notFoundPage, 404);
  const pay = await payView(c.env, found, c.req.path, { returned: c.req.query('paid') === '1' });
  if (found.link.confirmed_at) return page(c, (n) => thankYouPage(found.summary, n, pay));
  return page(c, (n) => formPage(found.summary, c.req.path, { values: {}, error: null }, n, pay, found.terms, found.window));
});

/**
 * Start Checkout and send the customer to Stripe. The caller has already
 * checked this post came from the page and that the order is confirmed.
 * A session still open is used again rather than starting a second.
 * If Checkout fails, the confirmation is kept and the thank-you is shown
 * with an error and a Pay button to try again.
 */
async function startCheckout(c: Ctx, found: Opened, confirmPath: string): Promise<Response> {
  const back = () => c.redirect(confirmPath, 303);
  const view = await payView(c.env, found, confirmPath);
  if (view.kind !== 'ready' && view.kind !== 'failed') return back();
  const settings = paymentSettings(c.env, found.db.companyId);
  if (!settings.ok || !settings.settings.taxMode) return back();
  const taxMode = settings.settings.taxMode;
  const { db, job } = found;
  const [payments, quotes, customer] = await Promise.all([
    db.find('job_payments', { where: { job_id: job.id } }),
    db.find('quotes', { where: { job_id: job.id } }),
    db.get('customers', job.customer_id),
  ]);
  const standing = standingOf(payments);
  if (!mayStartPayment(standing)) return back();
  if (standing.openCheckout?.stripe_checkout_url) return c.redirect(standing.openCheckout.stripe_checkout_url, 303);
  const price = jobPrice(quotes, taxMode);
  if ('missing' in price) return back();
  // The quote, plus the extras the customer chose when confirming, at the
  // page's prices. Nothing the browser sends now changes what is charged.
  const answers = await confirmedAnswers(found);
  const extras = extrasOf(answers);
  const amountPence = price.amountPence + extrasPence(extras);

  // A session that ran out with no message from Stripe yet is closed here.
  const stale = payments.filter((p) => p.method === 'checkout' && p.status === 'pending');
  let payment;
  try {
    await db.batch((batch) => {
      for (const old of stale) batch.update('job_payments', old.id, { status: 'expired', stripe_checkout_url: null });
    });
    payment = await db.insert('job_payments', {
      job_id: job.id,
      kind: 'full',
      method: 'checkout',
      status: 'pending',
      quote_id: price.quote.id,
      tax_behavior: taxMode,
      amount_pence: amountPence,
      currency: 'GBP',
    });
  } catch {
    // Another press, a moment ago, is opening one.
    return back();
  }

  try {
    const session = await createJobCheckout({
      settings: { ...settings.settings, taxMode },
      job,
      customer,
      payment,
      packagePence: price.amountPence,
      extras,
      deliveryAddress: addressOf(answers),
      deliveryName: typeof answers?.signed_name === 'string' ? answers.signed_name : null,
      returnUrl: `${new URL(c.req.url).origin}${confirmPath}`,
    });
    await db.batch((batch) => {
      batch.update('job_payments', payment.id, { stripe_checkout_session_id: session.id, stripe_checkout_url: session.url, expires_at: session.expiresAt });
      batch.insert('job_events', {
        job_id: job.id,
        type: 'checkout_started',
        actor_kind: 'customer',
        data: {
          paymentId: payment.id,
          kind: 'full',
          amountPence,
          quotePence: price.amountPence,
          extras: extras.map((e) => ({ key: e.key, quantity: e.quantity, unitPence: e.unitPence })),
          taxMode,
          quoteNumber: price.quote.number,
        },
      });
    });
    return c.redirect(session.url, 303);
  } catch (error) {
    await db.remove('job_payments', payment.id);
    console.error(JSON.stringify({ message: 'checkout failed', job: job.id, reason: error instanceof Error ? error.message : String(error) }));
    if (!(error instanceof StripeError)) throw error;
    const pay = await payView(c.env, found, confirmPath, {
      error: `We couldn't open the payment page just now. Please try again in a few minutes, or email ${CONFIRMATION_BRAND.email}.`,
    });
    return page(c, (n) => thankYouPage(found.summary, n, pay), 502);
  }
}

/**
 * Pay: start a Checkout session on Stripe's own page and send the customer
 * there. Only from this page, only once the order is confirmed, only if the
 * job is not already paid, and only for the whole order as the job's quote says.
 */
confirmation.post('/:token/pay', async (c) => {
  const origin = c.req.header('origin');
  const sameSite = origin === new URL(c.req.url).origin || ((!origin || origin === 'null') && c.req.header('sec-fetch-site') === 'same-origin');
  if (!sameSite) return page(c, notFoundPage, 403);
  const found = await open(c.env, c.req.param('token'));
  if (!found) return page(c, notFoundPage, 404);
  const confirmPath = c.req.path.replace(/\/pay$/, '');
  if (!found.link.confirmed_at) return c.redirect(confirmPath, 303);
  return startCheckout(c, found, confirmPath);
});

/**
 * Confirm the order. A mistake comes back with the answers kept and the first
 * problem shown. Confirming twice changes nothing: the second is sent to the
 * thank-you, and the database refuses a second confirmation outright.
 * When payments are open and there is a price, confirmation then starts
 * Checkout in the same request and sends the customer to Stripe.
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

  const read = readAnswers(job.reference, values, found.terms, new Date(), found.window);
  if ('error' in read) {
    const pay = await payView(c.env, found, c.req.path);
    return page(c, (n) => formPage(summary, c.req.path, { values, error: read.error }, n, pay, found.terms, found.window), 400);
  }
  const { answers } = read;
  try {
    await db.batch((batch) => {
      batch.update('order_confirmations', link.id, { confirmed_at: answers.submitted_at });
      batch.insert('job_events', {
        job_id: job.id,
        type: 'order_confirmed',
        actor_kind: 'customer',
        data: { ...answers, terms_source: found.terms.source, confirmationId: link.id, revisionId: found.revisionId, shown: Object.fromEntries(summary.rows) },
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

  // Payments are open and there is a price: record the confirmation, then
  // open Checkout in this same request. If Checkout fails, the confirmation
  // is kept and the customer is shown a Pay button to try again.
  const confirmed: Opened = { ...found, link: { ...link, confirmed_at: answers.submitted_at } };
  const pay = await payView(c.env, confirmed, c.req.path);
  if (pay.kind === 'ready' || pay.kind === 'failed') return startCheckout(c, confirmed, c.req.path);
  return done();
});
