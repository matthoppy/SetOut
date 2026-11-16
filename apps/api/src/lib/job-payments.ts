/**
 * A company's customers paying for their job, through the company's own
 * Stripe account. Not SetOut's own billing (billing.ts): that charges a
 * company for SetOut, with SetOut's key. This takes a customer's money for a
 * shower, with JOB_STRIPE_SECRET_KEY, for the one company JOB_PAYMENTS_COMPANY
 * names.
 *
 * Two ways in, both for the whole order, up front:
 *
 *   Checkout     the customer presses "Pay securely" on their order
 *                confirmation page, once they have confirmed, and pays on
 *                Stripe's own page.
 *   Invoice      staff raise a Stripe invoice for a trade customer, who pays
 *                it on Stripe's hosted invoice page.
 *
 * What to charge always comes from the job's quote, in pence, never from the
 * browser, and nothing here makes up a price: a job with no quote cannot be
 * paid for.
 *
 * VAT. Stripe Tax is off unless JOB_PAYMENTS_STRIPE_TAX is "on". Off (the
 * default: Custom Showers is not VAT registered), the quote's total is
 * exactly what the customer pays and nothing about tax is sent to Stripe. A
 * quote that has VAT in it is then not a price anyone can pay, because a
 * business that is not registered must not charge VAT. On, Stripe Tax works
 * out the VAT (automatic_tax, tax code txcd_99999999, General - Tangible
 * Goods) on the billing address, and JOB_PAYMENTS_TAX_BEHAVIOR says
 * whether quotes include it.
 *
 * Only Stripe's webhook says a payment happened (job-payments-webhook.ts).
 *
 * Every call to Stripe takes the function that sends it, so tests hand in a
 * stand-in and nothing in them ever reaches Stripe.
 */

import type { CompanyDb } from '../db/company-db';
import type { CustomerRow, JobPaymentRow, JobRow, PaymentKind, PaymentStatus, PaymentTaxMode, QuoteRow, TaxBehavior } from '../db/tables';
import { formEncode, StripeError, type Params } from './stripe';

const API = 'https://api.stripe.com/v1';

/** Stripe's product tax code for General - Tangible Goods. Only sent with Stripe Tax on. */
export const TAX_CODE = 'txcd_99999999';

/** How long a Checkout session stays open: Stripe's shortest, so a stale one is not paid by surprise. */
export const CHECKOUT_MINUTES = 30;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface PaymentSettings {
  companyId: string;
  secretKey: string;
  /** Whether Stripe Tax works out VAT. Off by default. */
  stripeTax: boolean;
  /**
   * How payments are taxed: 'none' with Stripe Tax off; with it on, whether
   * quotes include VAT, or null while that is undecided (nobody can pay).
   */
  taxMode: PaymentTaxMode | null;
  /** Days a trade invoice has. Null until Matt decides. */
  invoiceDays: number | null;
  bankTransfer: boolean;
  live: boolean;
}

/** Why payments are not on for a deploy, for the log and for staff. Never shown to a customer. */
export type PaymentsOff = 'off' | 'no_key' | 'live_key_refused' | 'bad_key';

type PaymentEnv = Pick<
  Env,
  | 'JOB_PAYMENTS_COMPANY'
  | 'JOB_PAYMENTS_STRIPE_TAX'
  | 'JOB_PAYMENTS_TAX_BEHAVIOR'
  | 'JOB_PAYMENTS_INVOICE_DAYS'
  | 'JOB_PAYMENTS_BANK_TRANSFER'
  | 'JOB_PAYMENTS_ALLOW_LIVE'
  | 'JOB_STRIPE_SECRET_KEY'
>;

export function parseTaxBehavior(value: string | undefined): TaxBehavior | null {
  const text = (value ?? '').trim().toLowerCase();
  return text === 'inclusive' || text === 'exclusive' ? text : null;
}

export function parseInvoiceDays(value: string | undefined): number | null {
  const text = (value ?? '').trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const days = Number(text);
  return days >= 1 && days <= 365 ? days : null;
}

/**
 * The deploy's payment settings, for this company. A live key is refused
 * unless JOB_PAYMENTS_ALLOW_LIVE is "on", and anything that is not a Stripe
 * secret or restricted key is refused outright.
 */
export function paymentSettings(env: PaymentEnv, companyId: string): { ok: true; settings: PaymentSettings } | { ok: false; reason: PaymentsOff } {
  const company = (env.JOB_PAYMENTS_COMPANY ?? '').trim();
  if (!company || company !== companyId) return { ok: false, reason: 'off' };
  const key = env.JOB_STRIPE_SECRET_KEY ?? '';
  if (!key) return { ok: false, reason: 'no_key' };
  const test = /^(sk|rk)_test_[A-Za-z0-9]+$/.test(key);
  const live = /^(sk|rk)_live_[A-Za-z0-9]+$/.test(key);
  if (!test && !live) return { ok: false, reason: 'bad_key' };
  if (live && env.JOB_PAYMENTS_ALLOW_LIVE !== 'on') return { ok: false, reason: 'live_key_refused' };
  const stripeTax = env.JOB_PAYMENTS_STRIPE_TAX === 'on';
  return {
    ok: true,
    settings: {
      companyId: company,
      secretKey: key,
      stripeTax,
      taxMode: stripeTax ? parseTaxBehavior(env.JOB_PAYMENTS_TAX_BEHAVIOR) : 'none',
      invoiceDays: parseInvoiceDays(env.JOB_PAYMENTS_INVOICE_DAYS),
      bankTransfer: env.JOB_PAYMENTS_BANK_TRANSFER === 'on',
      live,
    },
  };
}

/** Whether a webhook may be handled at all: payments on for some company, with a webhook secret. */
export function webhookCompany(env: Pick<Env, 'JOB_PAYMENTS_COMPANY' | 'JOB_STRIPE_WEBHOOK_SECRET'>): string | null {
  const company = (env.JOB_PAYMENTS_COMPANY ?? '').trim();
  return company && env.JOB_STRIPE_WEBHOOK_SECRET ? company : null;
}

// ---------------------------------------------------------------------------
// The price, from the quote
// ---------------------------------------------------------------------------

export type PriceMissing = 'no_quote' | 'quote_expired' | 'quote_empty' | 'not_gbp' | 'quote_has_vat';

export interface JobPrice {
  quote: QuoteRow;
  /** What Stripe is asked for, in pence: the whole order. */
  amountPence: number;
}

/**
 * The job's agreed price: its latest accepted quote, or failing that its
 * latest sent quote that has not run out. A draft is never a price.
 *
 *   none        the quote's total is what is paid. A quote with VAT on it
 *               is refused: with Stripe Tax off, no VAT is charged.
 *   inclusive   the quote's total; Stripe Tax finds the VAT in it.
 *   exclusive   the quote's subtotal; Stripe Tax adds the VAT on top.
 */
export function jobPrice(quotes: QuoteRow[], taxMode: PaymentTaxMode, now = new Date()): JobPrice | { missing: PriceMissing } {
  const byNewest = [...quotes].sort((a, b) => b.number - a.number);
  const accepted = byNewest.find((q) => q.status === 'accepted');
  const sent = byNewest.find((q) => q.status === 'sent');
  const quote = accepted ?? sent;
  if (!quote) return { missing: 'no_quote' };
  if (!accepted && quote.valid_until && Date.parse(quote.valid_until) < now.getTime()) return { missing: 'quote_expired' };
  if (quote.currency.toUpperCase() !== 'GBP') return { missing: 'not_gbp' };
  if (taxMode === 'none' && quote.vat_pence > 0) return { missing: 'quote_has_vat' };
  const amountPence = taxMode === 'exclusive' ? quote.subtotal_pence : quote.total_pence;
  if (!Number.isInteger(amountPence) || amountPence <= 0) return { missing: 'quote_empty' };
  return { quote, amountPence };
}

/** The tax a line is sent to Stripe with: nothing at all with Stripe Tax off. */
function lineTax(taxMode: PaymentTaxMode): { tax_behavior?: TaxBehavior } {
  return taxMode === 'none' ? {} : { tax_behavior: taxMode };
}

// ---------------------------------------------------------------------------
// Where a job stands
// ---------------------------------------------------------------------------

export type JobPaymentState = 'unpaid' | 'checkout_open' | 'payment_failed' | 'invoice_sent' | 'paid' | 'partially_refunded' | 'refunded';

const PAID: PaymentStatus[] = ['paid', 'partially_refunded', 'refunded'];

export interface PaymentStanding {
  state: JobPaymentState;
  /** Charged in all, as Stripe reported it. */
  paidTotalPence: number;
  taxPence: number;
  refundedPence: number;
  /** How many payments were taken for the job: more than one is a duplicate to refund. */
  paidCount: number;
  /** An invoice the customer can still pay, if there is one. */
  openInvoice: JobPaymentRow | null;
  /** A Checkout session still open, if there is one. */
  openCheckout: JobPaymentRow | null;
}

export function standingOf(payments: JobPaymentRow[], now = new Date()): PaymentStanding {
  const paid = payments.filter((p) => PAID.includes(p.status));
  const paidTotalPence = paid.reduce((sum, p) => sum + (p.amount_total_pence ?? p.amount_pence), 0);
  const taxPence = paid.reduce((sum, p) => sum + (p.tax_pence ?? 0), 0);
  const refundedPence = payments.reduce((sum, p) => sum + p.amount_refunded_pence, 0);
  const openInvoice = [...payments].reverse().find((p) => p.method === 'invoice' && (p.status === 'open' || p.status === 'failed') && p.hosted_invoice_url) ?? null;
  const openCheckout =
    [...payments].reverse().find((p) => p.method === 'checkout' && p.status === 'pending' && p.expires_at && Date.parse(p.expires_at) > now.getTime()) ?? null;
  const newest = [...payments].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];

  let state: JobPaymentState = 'unpaid';
  if (paid.length > 0 && refundedPence > 0) state = refundedPence >= paidTotalPence ? 'refunded' : 'partially_refunded';
  else if (paid.length > 0) state = 'paid';
  else if (openInvoice) state = openInvoice.status === 'failed' ? 'payment_failed' : 'invoice_sent';
  else if (newest?.status === 'failed') state = 'payment_failed';
  else if (openCheckout) state = 'checkout_open';
  return { state, paidTotalPence, taxPence, refundedPence, paidCount: paid.length, openInvoice, openCheckout };
}

/** Whether a new payment may be started: nothing paid yet, and no invoice out. */
export const mayStartPayment = (standing: PaymentStanding) => standing.paidCount === 0 && !standing.openInvoice;

// ---------------------------------------------------------------------------
// Talking to Stripe
// ---------------------------------------------------------------------------

async function stripePost<T>(secretKey: string, path: string, params: Params, idempotencyKey: string, send: typeof fetch): Promise<T> {
  const response = await send(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      // A retry of the same request makes nothing twice.
      'Idempotency-Key': idempotencyKey,
    },
    body: formEncode(params).toString(),
  });
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!response.ok) {
    // Stripe's own words are for the log, never for the page.
    throw new StripeError(`Stripe answered ${response.status}. ${body.error?.message ?? ''}`.trim().slice(0, 300), response.status);
  }
  return body as T;
}

const metadataFor = (settings: PaymentSettings, job: JobRow, payment: JobPaymentRow) => ({
  company_id: settings.companyId,
  job_id: job.id,
  job_ref: job.reference,
  payment_kind: 'full',
  payment_id: payment.id,
  quote_id: payment.quote_id ?? '',
});

export interface CheckoutInput {
  settings: PaymentSettings & { taxMode: PaymentTaxMode };
  job: JobRow;
  customer: CustomerRow | null;
  payment: JobPaymentRow;
  /**
   * The quote's part of the payment, in pence, and the extras chosen on the
   * confirmation page, each its own line. Without them, the payment's whole
   * amount is one line.
   */
  packagePence?: number;
  extras?: { key: string; description: string; quantity: number; unitPence: number }[];
  /**
   * Where the glass goes, as the customer confirmed it on our page. Stripe
   * does not ask again: it rides on the session and payment as metadata, and
   * as the payment's shipping details, with no Stripe customer made for it.
   */
  deliveryAddress?: { line1: string; line2: string; town: string; postcode: string } | null;
  /** Who the delivery is for, when the job's customer has no name. */
  deliveryName?: string | null;
  /** Where the customer comes back to: the confirmation page. */
  returnUrl: string;
  now?: Date;
}

/**
 * Start paying for the whole order on Stripe's own page. Answers with the
 * session's id, the address to send the browser to, and when it stops working.
 *
 * Payment methods are left to the Dashboard (Link and dynamic payment
 * methods on): payment_method_types is never set. Tax is only sent with
 * Stripe Tax on.
 */
export async function createJobCheckout(input: CheckoutInput, send: typeof fetch = fetch): Promise<{ id: string; url: string; expiresAt: string }> {
  const { settings, job, customer, payment } = input;
  const now = input.now ?? new Date();
  const expires = Math.floor(now.getTime() / 1000) + CHECKOUT_MINUTES * 60 + 60;
  const name = `${job.reference}, made-to-measure shower glass`;
  const address = input.deliveryAddress ?? null;
  const metadata = {
    ...metadataFor(settings, job, payment),
    ...(address
      ? { delivery_line1: address.line1, delivery_line2: address.line2, delivery_town: address.town, delivery_postcode: address.postcode }
      : {}),
  };
  const shipName = (customer?.name || input.deliveryName || '').trim();
  const shipping =
    address && shipName
      ? { name: shipName, address: { line1: address.line1, ...(address.line2 ? { line2: address.line2 } : {}), city: address.town, postal_code: address.postcode, country: 'GB' } }
      : null;
  const taxed = settings.taxMode !== 'none';
  const extras = input.extras ?? [];
  const extrasTotal = extras.reduce((sum, e) => sum + e.quantity * e.unitPence, 0);
  const packagePence = input.packagePence ?? payment.amount_pence - extrasTotal;
  if (packagePence <= 0 || packagePence + extrasTotal !== payment.amount_pence) throw new StripeError('The lines do not add up to the payment.', 500);
  const line = (unitPence: number, quantity: number, lineName: string, key: string) => ({
    quantity,
    price_data: {
      currency: 'gbp',
      unit_amount: unitPence,
      ...lineTax(settings.taxMode),
      product_data: { name: lineName, ...(taxed ? { tax_code: TAX_CODE } : {}), metadata: { job_ref: job.reference, line: key } },
    },
  });
  const session = await stripePost<{ id?: string; url?: string; expires_at?: number }>(
    settings.secretKey,
    '/checkout/sessions',
    {
      mode: 'payment',
      currency: 'gbp',
      client_reference_id: job.id,
      line_items: [line(packagePence, 1, name, 'order'), ...extras.map((e) => line(e.unitPence, e.quantity, e.description, e.key))],
      // With Stripe Tax on, VAT is worked out on the billing address, which
      // Stripe then always asks for. The delivery address is never asked for
      // again: the customer gave it on the confirmation page.
      ...(taxed ? { automatic_tax: { enabled: true }, billing_address_collection: 'required' } : {}),
      customer_email: customer?.email ?? undefined,
      customer_creation: 'always',
      metadata,
      payment_intent_data: { metadata, description: name, ...(shipping ? { shipping } : {}) },
      expires_at: expires,
      success_url: `${input.returnUrl}?paid=1`,
      cancel_url: `${input.returnUrl}?cancelled=1`,
    },
    `setout-checkout-${payment.id}`,
    send
  );
  if (typeof session.id !== 'string' || typeof session.url !== 'string' || !session.url.startsWith('https://checkout.stripe.com/')) {
    throw new StripeError('Stripe gave no page to pay on.', 502);
  }
  const expiresAt = new Date((session.expires_at ?? expires) * 1000).toISOString();
  return { id: session.id, url: session.url, expiresAt };
}

export interface InvoiceInput {
  settings: PaymentSettings & { taxMode: PaymentTaxMode; invoiceDays: number };
  job: JobRow;
  customer: CustomerRow;
  payment: JobPaymentRow;
  /** Email the invoice from Stripe as well as making it. */
  send: boolean;
}

/**
 * Raise a Stripe invoice for a trade customer's whole order: make the Stripe
 * customer, make the invoice, add the one line, finalise it and, if asked,
 * have Stripe email it. Answers with what the job keeps.
 */
export async function createJobInvoice(
  input: InvoiceInput,
  send: typeof fetch = fetch
): Promise<{ invoiceId: string; customerId: string; hostedInvoiceUrl: string | null; status: string }> {
  const { settings, job, customer, payment } = input;
  const key = settings.secretKey;
  const metadata = metadataFor(settings, job, payment);
  const taxed = settings.taxMode !== 'none';

  const address = { line1: customer.address ?? job.site_address ?? undefined, postal_code: job.site_postcode ?? customer.postcode ?? undefined, country: 'GB' };
  const made = await stripePost<{ id?: string }>(
    key,
    '/customers',
    {
      email: customer.email ?? undefined,
      name: customer.name,
      address,
      shipping: { name: customer.name, address },
      metadata: { company_id: settings.companyId, job_id: job.id, job_ref: job.reference },
    },
    `setout-customer-${payment.id}`,
    send
  );
  if (typeof made.id !== 'string') throw new StripeError('Stripe made no customer.', 502);
  const customerId = made.id;

  // The job's reference shows on the invoice; metadata never does.
  const description = `${job.reference}: made-to-measure shower glass`;
  const invoice = await stripePost<{ id?: string }>(
    key,
    '/invoices',
    {
      customer: customerId,
      currency: 'gbp',
      collection_method: 'send_invoice',
      days_until_due: settings.invoiceDays,
      ...(taxed ? { automatic_tax: { enabled: true } } : {}),
      pending_invoice_items_behavior: 'exclude',
      description,
      metadata,
      ...(settings.bankTransfer
        ? {
            payment_settings: {
              payment_method_types: ['card', 'customer_balance'],
              payment_method_options: { customer_balance: { funding_type: 'bank_transfer', bank_transfer: { type: 'gb_bank_transfer' } } },
            },
          }
        : {}),
    },
    `setout-invoice-${payment.id}`,
    send
  );
  if (typeof invoice.id !== 'string') throw new StripeError('Stripe made no invoice.', 502);

  await stripePost(
    key,
    '/invoiceitems',
    {
      customer: customerId,
      invoice: invoice.id,
      currency: 'gbp',
      amount: payment.amount_pence,
      description,
      ...lineTax(settings.taxMode),
      ...(taxed ? { tax_code: TAX_CODE } : {}),
      metadata,
    },
    `setout-invoice-item-${payment.id}`,
    send
  );

  let final = await stripePost<{ id?: string; hosted_invoice_url?: string | null; status?: string }>(
    key,
    `/invoices/${encodeURIComponent(invoice.id)}/finalize`,
    { auto_advance: true },
    `setout-invoice-finalize-${payment.id}`,
    send
  );
  if (input.send) {
    final = await stripePost(key, `/invoices/${encodeURIComponent(invoice.id)}/send`, {}, `setout-invoice-send-${payment.id}`, send);
  }
  const hosted = typeof final.hosted_invoice_url === 'string' && final.hosted_invoice_url.startsWith('https://') ? final.hosted_invoice_url : null;
  return { invoiceId: invoice.id, customerId, hostedInvoiceUrl: hosted, status: String(final.status ?? 'open') };
}

// ---------------------------------------------------------------------------
// What a job's payments look like to staff
// ---------------------------------------------------------------------------

export interface PaymentView {
  /** Whether this deploy takes payments for this company, and why not. */
  enabled: boolean;
  off: PaymentsOff | null;
  /** What is still to be decided, by setting name. */
  undecided: string[];
  live: boolean;
  stripeTax: boolean;
  taxMode: PaymentTaxMode | null;
  invoiceDays: number | null;
  bankTransfer: boolean;
  /** The agreed price, or why there is none. */
  price: { quoteNumber: number; amountPence: number } | { missing: PriceMissing } | null;
  standing: Omit<PaymentStanding, 'openInvoice' | 'openCheckout'> & { hostedInvoiceUrl: string | null };
  /** Whether staff may raise a trade invoice now, and for how much. */
  canInvoice: { amountPence: number } | null;
  payments: {
    id: string;
    kind: PaymentKind;
    method: string;
    status: PaymentStatus;
    amountPence: number;
    amountTotalPence: number | null;
    taxPence: number | null;
    refundedPence: number;
    taxMode: PaymentTaxMode;
    hostedInvoiceUrl: string | null;
    paidAt: string | null;
    createdAt: string;
  }[];
}

export async function paymentViewFor(env: PaymentEnv, db: CompanyDb, job: JobRow, quotes: QuoteRow[], now = new Date()): Promise<PaymentView> {
  const found = paymentSettings(env, db.companyId);
  const payments = await db.find('job_payments', { where: { job_id: job.id }, orderBy: { column: 'created_at' } });
  const standing = standingOf(payments, now);
  const settings = found.ok ? found.settings : null;
  const undecided = settings ? [...(settings.taxMode ? [] : ['JOB_PAYMENTS_TAX_BEHAVIOR']), ...(settings.invoiceDays ? [] : ['JOB_PAYMENTS_INVOICE_DAYS'])] : [];
  const price = settings?.taxMode ? jobPrice(quotes, settings.taxMode, now) : null;
  const priceView = price ? ('missing' in price ? price : { quoteNumber: price.quote.number, amountPence: price.amountPence }) : null;
  const canInvoice =
    settings?.invoiceDays && price && !('missing' in price) && mayStartPayment(standing) && !standing.openCheckout ? { amountPence: price.amountPence } : null;
  return {
    enabled: found.ok,
    off: found.ok ? null : found.reason,
    undecided,
    live: settings?.live ?? false,
    stripeTax: settings?.stripeTax ?? false,
    taxMode: settings?.taxMode ?? null,
    invoiceDays: settings?.invoiceDays ?? null,
    bankTransfer: settings?.bankTransfer ?? false,
    price: priceView,
    standing: {
      state: standing.state,
      paidTotalPence: standing.paidTotalPence,
      taxPence: standing.taxPence,
      refundedPence: standing.refundedPence,
      paidCount: standing.paidCount,
      hostedInvoiceUrl: standing.openInvoice?.hosted_invoice_url ?? null,
    },
    canInvoice,
    payments: payments.map((p) => ({
      id: p.id,
      kind: p.kind,
      method: p.method,
      status: p.status,
      amountPence: p.amount_pence,
      amountTotalPence: p.amount_total_pence,
      taxPence: p.tax_pence,
      refundedPence: p.amount_refunded_pence,
      taxMode: p.tax_behavior,
      hostedInvoiceUrl: p.hosted_invoice_url,
      paidAt: p.paid_at,
      createdAt: p.created_at,
    })),
  };
}
