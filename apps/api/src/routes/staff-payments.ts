/**
 * Customer payments for a job, for a company's staff: raise a Stripe invoice
 * for a trade customer's whole order, in the company's own Stripe account.
 *
 * Retail customers pay up front from their order confirmation page instead.
 * Where the job stands is part of the job (GET /jobs/:id, "payment").
 *
 * Only for the company JOB_PAYMENTS_COMPANY names, with a test key unless
 * live payments are allowed, once the invoice terms are set, for a job with
 * an agreed price and nothing paid or out yet.
 */

import { Hono } from 'hono';
import type { Session } from '../db/auth';
import { companyDb } from '../db/company-db';
import { createJobInvoice, jobPrice, mayStartPayment, paymentSettings, standingOf } from '../lib/job-payments';
import { StripeError } from '../lib/stripe';

type Bindings = { Bindings: Env; Variables: { session: Session } };

export const staffPayments = new Hono<Bindings>();

const PRIVATE = { 'Cache-Control': 'no-store' };

const PRICE_WORDS: Record<string, string> = {
  no_quote: 'This job has no sent or accepted quote, so there is no price to invoice.',
  quote_expired: 'The quote has run out. Send a new one first.',
  quote_empty: 'The quote has no total.',
  not_gbp: 'Only quotes in pounds can be invoiced.',
  quote_has_vat: 'The quote has VAT on it, and VAT is not charged (Stripe Tax is off). Write a quote with no VAT first.',
};

staffPayments.post('/jobs/:id/payments/invoice', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  const job = await db.get('jobs', c.req.param('id'));
  if (!job) return c.json({ error: 'not_found', message: 'There is no such job.' }, 404, PRIVATE);

  const found = paymentSettings(c.env, session.companyId);
  if (!found.ok) return c.json({ error: 'payments_off', message: 'Payments are not set up for this company.' }, 409, PRIVATE);
  const { taxMode, invoiceDays } = found.settings;
  if (!taxMode) return c.json({ error: 'undecided', message: 'Whether quotes include VAT has not been set yet (JOB_PAYMENTS_TAX_BEHAVIOR).' }, 409, PRIVATE);
  if (!invoiceDays) return c.json({ error: 'undecided', message: 'The invoice terms have not been set yet (JOB_PAYMENTS_INVOICE_DAYS).' }, 409, PRIVATE);

  const requested = (await c.req.json().catch(() => ({}))) as { send?: unknown };
  const send = requested.send !== false;

  const [customer, quotes, payments] = await Promise.all([
    db.get('customers', job.customer_id),
    db.find('quotes', { where: { job_id: job.id } }),
    db.find('job_payments', { where: { job_id: job.id } }),
  ]);
  if (!customer) return c.json({ error: 'no_customer', message: 'This job has no customer.' }, 409, PRIVATE);
  if (send && !customer.email) return c.json({ error: 'no_email', message: 'The customer has no email address to send the invoice to.' }, 409, PRIVATE);
  if (taxMode !== 'none' && !(job.site_postcode ?? customer.postcode)) {
    return c.json({ error: 'no_address', message: 'Stripe Tax needs the delivery postcode to work out VAT.' }, 409, PRIVATE);
  }
  const standing = standingOf(payments);
  if (!mayStartPayment(standing) || standing.openCheckout) {
    return c.json({ error: 'already_paying', message: 'This job is already paid, or has a payment or invoice open.' }, 409, PRIVATE);
  }
  const price = jobPrice(quotes, taxMode);
  if ('missing' in price) return c.json({ error: price.missing, message: PRICE_WORDS[price.missing] }, 409, PRIVATE);

  const payment = await db.insert('job_payments', {
    job_id: job.id,
    kind: 'invoice',
    method: 'invoice',
    status: 'pending',
    quote_id: price.quote.id,
    tax_behavior: taxMode,
    amount_pence: price.amountPence,
    currency: 'GBP',
    created_by: session.userId,
  });
  try {
    const made = await createJobInvoice({ settings: { ...found.settings, taxMode, invoiceDays }, job, customer, payment, send });
    await db.batch((batch) => {
      batch.update('job_payments', payment.id, {
        status: made.status === 'paid' ? 'paid' : 'open',
        stripe_invoice_id: made.invoiceId,
        stripe_customer_id: made.customerId,
        hosted_invoice_url: made.hostedInvoiceUrl,
      });
      batch.insert('job_events', {
        job_id: job.id,
        type: 'invoice_created',
        actor_kind: 'staff',
        actor_id: session.userId,
        data: { paymentId: payment.id, amountPence: price.amountPence, taxMode, days: invoiceDays, sent: send, quoteNumber: price.quote.number },
      });
    });
    return c.json({ paymentId: payment.id, invoiceId: made.invoiceId, hostedInvoiceUrl: made.hostedInvoiceUrl, amountPence: price.amountPence }, 201, PRIVATE);
  } catch (error) {
    // Nothing kept that Stripe did not make. A retry uses new idempotency keys.
    await db.remove('job_payments', payment.id);
    console.error(JSON.stringify({ message: 'invoice failed', job: job.id, reason: error instanceof Error ? error.message : String(error) }));
    if (!(error instanceof StripeError)) throw error;
    return c.json({ error: 'stripe_failed', message: 'Stripe did not make the invoice. Check the Stripe dashboard before trying again.' }, 502, PRIVATE);
  }
});
