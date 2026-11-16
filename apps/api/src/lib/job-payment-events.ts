/**
 * What the company's Stripe messages change on a job.
 *
 * Stripe's webhook is the only thing that says money moved. Each message is
 * tied to one of the job's payments, by the Checkout session, the invoice or
 * the payment it is about (and failing those, by the payment id SetOut put in
 * its metadata), and only then is anything written: the payment's row, and a
 * line on the job's timeline in the same batch.
 *
 * A message about something SetOut did not start is left alone, and said so
 * to Stripe, so that it stops sending it.
 */

import { companyDb, type CompanyDb } from '../db/company-db';
import type { JobPaymentRow, RowChanges } from '../db/tables';

type Loose = Record<string, unknown>;

export interface StripeMessage {
  id: string;
  type: string;
  livemode: boolean;
  object: Loose;
}

/** A webhook's body, read only as far as needed. Null if it is not one of Stripe's events. */
export function readMessage(body: string): StripeMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const event = parsed as Loose;
  const data = event.data as Loose | undefined;
  if (typeof event.id !== 'string' || !/^evt_[A-Za-z0-9_]{1,250}$/.test(event.id)) return null;
  if (typeof event.type !== 'string' || !data || typeof data.object !== 'object' || data.object === null) return null;
  return { id: event.id, type: event.type, livemode: event.livemode === true, object: data.object as Loose };
}

export type Handled =
  | { outcome: 'recorded'; jobId: string; paymentId: string | null; event: string }
  | { outcome: 'ignored'; reason: string };

const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const pence = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null);
const idOf = (value: unknown): string | null => text(value) ?? (value && typeof value === 'object' ? text((value as Loose).id) : null);
const metadataOf = (object: Loose): Loose => (object.metadata && typeof object.metadata === 'object' ? (object.metadata as Loose) : {});

/** The tax on an invoice, however this account's API version says it. */
function invoiceTax(invoice: Loose): number | null {
  const direct = pence(invoice.tax);
  if (direct !== null) return direct;
  for (const key of ['total_taxes', 'total_tax_amounts']) {
    const list = invoice[key];
    if (Array.isArray(list)) return list.reduce((sum: number, t: unknown) => sum + (pence((t as Loose)?.amount) ?? 0), 0);
  }
  return null;
}

/** The payment an invoice was paid with, where Stripe says. */
function invoiceIntent(invoice: Loose): string | null {
  const direct = idOf(invoice.payment_intent);
  if (direct) return direct;
  const payments = (invoice.payments as Loose | undefined)?.data;
  if (Array.isArray(payments)) {
    for (const p of payments) {
      const intent = idOf(((p as Loose)?.payment as Loose | undefined)?.payment_intent);
      if (intent) return intent;
    }
  }
  return null;
}

async function byColumn(db: CompanyDb, column: 'stripe_checkout_session_id' | 'stripe_invoice_id' | 'stripe_payment_intent_id' | 'stripe_customer_id', value: string | null) {
  if (!value) return null;
  const rows = await db.find('job_payments', { where: { [column]: value }, orderBy: { column: 'created_at', direction: 'desc' }, limit: 1 });
  return rows[0] ?? null;
}

/** The payment a message is about, checked against the metadata SetOut sent with it. */
async function paymentFor(db: CompanyDb, companyId: string, object: Loose, found: JobPaymentRow | null): Promise<JobPaymentRow | null> {
  const metadata = metadataOf(object);
  if (text(metadata.company_id) && metadata.company_id !== companyId) return null;
  if (found) return found;
  const paymentId = text(metadata.payment_id);
  const row = paymentId ? await db.get('job_payments', paymentId) : null;
  if (row && text(metadata.job_id) && row.job_id !== metadata.job_id) return null;
  return row;
}

async function write(
  db: CompanyDb,
  payment: JobPaymentRow,
  changes: RowChanges<'job_payments'>,
  event: string,
  data: Loose,
  extra: { type: string; data: Loose }[] = []
): Promise<Handled> {
  await db.batch((batch) => {
    if (Object.keys(changes).length > 0) batch.update('job_payments', payment.id, changes);
    batch.insert('job_events', {
      job_id: payment.job_id,
      type: event,
      actor_kind: 'system',
      data: { paymentId: payment.id, kind: payment.kind, method: payment.method, currency: payment.currency, ...data },
    });
    for (const more of extra) batch.insert('job_events', { job_id: payment.job_id, type: more.type, actor_kind: 'system', data: { paymentId: payment.id, ...more.data } });
  });
  return { outcome: 'recorded', jobId: payment.job_id, paymentId: payment.id, event };
}

/** If this job was already paid by another payment, a line for staff to refund one. Every payment is for the whole order. */
async function duplicateOf(db: CompanyDb, payment: JobPaymentRow): Promise<{ type: string; data: Loose }[]> {
  const others = await db.find('job_payments', { where: { job_id: payment.job_id } });
  const before = others.filter((p) => p.id !== payment.id && ['paid', 'partially_refunded', 'refunded'].includes(p.status));
  return before.length > 0 ? [{ type: 'payment_duplicate', data: { otherPaymentIds: before.map((p) => p.id) } }] : [];
}

async function markPaid(db: CompanyDb, payment: JobPaymentRow, changes: RowChanges<'job_payments'>, data: Loose): Promise<Handled> {
  if (payment.status === 'paid' || payment.status === 'refunded' || payment.status === 'partially_refunded') {
    return { outcome: 'ignored', reason: 'already_paid' };
  }
  const extra = await duplicateOf(db, payment);
  return write(db, payment, { ...changes, status: 'paid', paid_at: new Date().toISOString(), stripe_checkout_url: null }, 'payment_received', data, extra);
}

/** Do what one of the company's Stripe messages says. */
export async function handleJobPaymentMessage(env: Pick<Env, 'DB'>, companyId: string, message: StripeMessage): Promise<Handled> {
  const db = companyDb(env, companyId);
  const o = message.object;

  switch (message.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const payment = await paymentFor(db, companyId, o, await byColumn(db, 'stripe_checkout_session_id', text(o.id)));
      if (!payment) return { outcome: 'ignored', reason: 'unknown_session' };
      const changes: RowChanges<'job_payments'> = {
        stripe_checkout_session_id: text(o.id) ?? payment.stripe_checkout_session_id,
        stripe_customer_id: idOf(o.customer) ?? payment.stripe_customer_id,
        stripe_payment_intent_id: idOf(o.payment_intent) ?? payment.stripe_payment_intent_id,
      };
      const totalDetails = (o.total_details as Loose | undefined) ?? {};
      if (o.payment_status !== 'paid') {
        // A bank debit or similar: paid later, or not, by another message.
        return write(db, payment, changes, 'payment_processing', { amountTotalPence: pence(o.amount_total) });
      }
      return markPaid(
        db,
        payment,
        { ...changes, amount_total_pence: pence(o.amount_total), tax_pence: pence(totalDetails.amount_tax) },
        { amountTotalPence: pence(o.amount_total), taxPence: pence(totalDetails.amount_tax), amountPence: payment.amount_pence, via: 'checkout' }
      );
    }
    case 'checkout.session.async_payment_failed': {
      const payment = await paymentFor(db, companyId, o, await byColumn(db, 'stripe_checkout_session_id', text(o.id)));
      if (!payment) return { outcome: 'ignored', reason: 'unknown_session' };
      if (payment.status === 'paid') return { outcome: 'ignored', reason: 'already_paid' };
      return write(db, payment, { status: 'failed', stripe_checkout_url: null }, 'payment_failed', { via: 'checkout' });
    }
    case 'checkout.session.expired': {
      const payment = await paymentFor(db, companyId, o, await byColumn(db, 'stripe_checkout_session_id', text(o.id)));
      if (!payment) return { outcome: 'ignored', reason: 'unknown_session' };
      if (payment.status !== 'pending') return { outcome: 'ignored', reason: 'not_open' };
      // The confirmation page lets the customer start again.
      return write(db, payment, { status: 'expired', stripe_checkout_url: null }, 'checkout_expired', {});
    }

    case 'invoice.finalized':
    case 'invoice.sent': {
      const payment = await paymentFor(db, companyId, o, await byColumn(db, 'stripe_invoice_id', text(o.id)));
      if (!payment) return { outcome: 'ignored', reason: 'unknown_invoice' };
      const url = text(o.hosted_invoice_url);
      if (payment.status !== 'pending' && payment.status !== 'open') return { outcome: 'ignored', reason: 'settled' };
      if (payment.status === 'open' && payment.hosted_invoice_url === url) return { outcome: 'ignored', reason: 'unchanged' };
      return write(db, payment, { status: 'open', stripe_invoice_id: text(o.id), hosted_invoice_url: url?.startsWith('https://') ? url : null }, 'invoice_sent', {
        stripe: message.type,
      });
    }
    case 'invoice.paid': {
      const payment = await paymentFor(db, companyId, o, await byColumn(db, 'stripe_invoice_id', text(o.id)));
      if (!payment) return { outcome: 'ignored', reason: 'unknown_invoice' };
      return markPaid(
        db,
        payment,
        {
          stripe_invoice_id: text(o.id) ?? payment.stripe_invoice_id,
          stripe_customer_id: idOf(o.customer) ?? payment.stripe_customer_id,
          stripe_payment_intent_id: invoiceIntent(o) ?? payment.stripe_payment_intent_id,
          amount_total_pence: pence(o.amount_paid),
          tax_pence: invoiceTax(o),
        },
        { amountTotalPence: pence(o.amount_paid), taxPence: invoiceTax(o), amountPence: payment.amount_pence, via: 'invoice' }
      );
    }
    case 'invoice.payment_failed': {
      const payment = await paymentFor(db, companyId, o, await byColumn(db, 'stripe_invoice_id', text(o.id)));
      if (!payment) return { outcome: 'ignored', reason: 'unknown_invoice' };
      if (payment.status === 'paid') return { outcome: 'ignored', reason: 'already_paid' };
      // The invoice stays open: the customer can try again on the same page.
      return write(db, payment, { status: 'failed' }, 'payment_failed', { via: 'invoice' });
    }
    case 'invoice.voided':
    case 'invoice.marked_uncollectible': {
      const payment = await paymentFor(db, companyId, o, await byColumn(db, 'stripe_invoice_id', text(o.id)));
      if (!payment) return { outcome: 'ignored', reason: 'unknown_invoice' };
      if (payment.status === 'paid') return { outcome: 'ignored', reason: 'already_paid' };
      return write(db, payment, { status: 'void', hosted_invoice_url: null }, 'invoice_voided', { stripe: message.type });
    }

    case 'charge.refunded': {
      const found = (await byColumn(db, 'stripe_payment_intent_id', idOf(o.payment_intent))) ?? (await byColumn(db, 'stripe_invoice_id', idOf(o.invoice)));
      const payment = await paymentFor(db, companyId, o, found);
      if (!payment) return { outcome: 'ignored', reason: 'unknown_charge' };
      const refunded = pence(o.amount_refunded) ?? 0;
      if (refunded <= payment.amount_refunded_pence) return { outcome: 'ignored', reason: 'unchanged' };
      const captured = pence(o.amount_captured) ?? pence(o.amount) ?? payment.amount_total_pence ?? payment.amount_pence;
      const whole = o.refunded === true || refunded >= captured;
      return write(db, payment, { status: whole ? 'refunded' : 'partially_refunded', amount_refunded_pence: refunded }, 'payment_refunded', {
        refundedPence: refunded,
        whole,
      });
    }
    case 'credit_note.created': {
      const payment = await paymentFor(db, companyId, o, await byColumn(db, 'stripe_invoice_id', idOf(o.invoice)));
      if (!payment) return { outcome: 'ignored', reason: 'unknown_invoice' };
      // Recorded only: a credit note that refunds money also sends charge.refunded.
      return write(db, payment, {}, 'credit_note', { creditPence: pence(o.total) ?? pence(o.amount), reason: text(o.reason), number: text(o.number) });
    }
    case 'cash_balance.funds_available':
    case 'customer_cash_balance_transaction.created': {
      const payment = await byColumn(db, 'stripe_customer_id', idOf(o.customer));
      if (!payment) return { outcome: 'ignored', reason: 'unknown_customer' };
      // Money on the customer's balance is not the invoice paid. That is invoice.paid.
      return write(db, payment, {}, 'bank_transfer_received', { amountPence: pence(o.net_amount) ?? pence(o.amount), stripe: message.type });
    }
    default:
      return { outcome: 'ignored', reason: 'not_handled' };
  }
}
