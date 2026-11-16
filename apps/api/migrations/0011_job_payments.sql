-- ---------------------------------------------------------------------------
-- A customer paying for their job, through the company's own Stripe account
-- ---------------------------------------------------------------------------
--
-- Not SetOut's own billing (subscriptions, 0008): this is money a company's
-- customer pays the company for a shower, through Stripe Checkout from the
-- order confirmation page (the whole order, up front), or a Stripe invoice
-- staff raise for a trade customer.
--
-- One row per attempt to take money: a Checkout session or an invoice. The
-- amount asked for is in pence, from the job's quote, never from a browser.
-- Stripe's webhook says what happened to it; the browser coming back from
-- Stripe never does. Every change is also written on the job's timeline.
--
-- VAT: with Stripe Tax off (the default; Custom Showers is not VAT
-- registered) the quote's total is what the customer pays and no tax is sent
-- to Stripe. With it on, Stripe Tax works out VAT on the address shipped to.

CREATE TABLE job_payments (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  -- 'full' (Checkout, the whole order) or 'invoice' (the whole order, for trade).
  kind TEXT NOT NULL,
  -- 'checkout' or 'invoice'.
  method TEXT NOT NULL,
  -- 'pending', 'open', 'paid', 'failed', 'expired', 'void', 'refunded' or
  -- 'partially_refunded'. Checked by the data layer.
  status TEXT NOT NULL DEFAULT 'pending',
  -- The quote it was priced from.
  quote_id TEXT,
  -- 'none' with Stripe Tax off: amount_pence is exactly what is paid. With it
  -- on, 'inclusive' or 'exclusive': whether amount_pence already has VAT in it.
  tax_behavior TEXT NOT NULL,
  -- What was asked for, in pence (before Stripe Tax adds VAT to an exclusive amount).
  amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
  -- What Stripe says was charged in all, and the tax in it, once paid.
  amount_total_pence INTEGER CHECK (amount_total_pence >= 0),
  tax_pence INTEGER CHECK (tax_pence >= 0),
  amount_refunded_pence INTEGER NOT NULL DEFAULT 0 CHECK (amount_refunded_pence >= 0),
  currency TEXT NOT NULL DEFAULT 'GBP',
  stripe_checkout_session_id TEXT,
  -- The page the customer pays on, while the session is open.
  stripe_checkout_url TEXT,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  stripe_customer_id TEXT,
  hosted_invoice_url TEXT,
  -- When an open Checkout session stops working.
  expires_at TEXT,
  paid_at TEXT,
  -- The member of staff who raised an invoice.
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id)
) STRICT;

CREATE INDEX job_payments_by_job ON job_payments (company_id, job_id, created_at);
CREATE UNIQUE INDEX job_payments_by_session ON job_payments (company_id, stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX job_payments_by_invoice ON job_payments (company_id, stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;
CREATE INDEX job_payments_by_intent ON job_payments (company_id, stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- At most one open Checkout session per job, so two presses of "Pay" in two
-- tabs cannot start two payments.
CREATE UNIQUE INDEX job_payments_one_open_checkout ON job_payments (company_id, job_id) WHERE method = 'checkout' AND status = 'pending';

-- The company's Stripe messages that have been handled, so one delivered
-- twice is handled once. Kept apart from SetOut's own (stripe_events): they
-- come from a different Stripe account, to a different endpoint.
CREATE TABLE job_stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
