-- ---------------------------------------------------------------------------
-- Signing up, plans and subscriptions
-- ---------------------------------------------------------------------------
--
-- A shower company can now make its own account. Someone types the company's
-- name, their own and their email address, and is emailed a link. Nothing is
-- made until the link is used: no company, no user. What was typed waits here.
--
-- Billing is written and switched off. Its tables are here so that turning it
-- on is a setting and not a migration.
--
-- This migration only adds tables, so the code before it keeps working.

-- A sign-up that is waiting for its link to be used. Platform-wide: it
-- belongs to no company, because there is not one yet.
CREATE TABLE signups (
  -- The hash of the link's token. The token itself is never stored.
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  person_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  -- A hash of the network address it came from, to count by. Never the address.
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  -- The company it made, once used.
  company_id TEXT REFERENCES companies (id)
) STRICT;

-- How many links an address has asked for lately, how many came from one
-- place, and how many there were in all today.
CREATE INDEX signups_by_email ON signups (email, created_at);
CREATE INDEX signups_by_ip ON signups (ip_hash, created_at);
CREATE INDEX signups_by_time ON signups (created_at);

-- The plans SetOut offers. Platform-wide. Kept as rows, not code, so a price
-- can be set without a deploy. A company's plan is the id in companies.plan.
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- What it costs a month, in pence, before VAT. Shown to owners; Stripe's
  -- own price is what is charged.
  monthly_price_pence INTEGER NOT NULL DEFAULT 0 CHECK (monthly_price_pence >= 0),
  -- How many designs a month it includes. Empty means no limit.
  enquiries_per_month INTEGER CHECK (enquiries_per_month IS NULL OR enquiries_per_month >= 0),
  -- Stripe's id for the price it is charged as. Empty for a plan nobody pays for.
  stripe_price_id TEXT UNIQUE,
  -- Whether an owner may choose it on the billing page. A plan that is not
  -- offered can still be given to a company by SetOut.
  offered INTEGER NOT NULL DEFAULT 0 CHECK (offered IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- Free accounts, by arrangement: Custom Showers and Brennan Glass.
INSERT INTO plans (id, name, monthly_price_pence, enquiries_per_month, stripe_price_id, offered, position, created_at, updated_at)
VALUES ('free', 'Free', 0, NULL, NULL, 0, 0, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z');

-- A company's subscription: its plan, where it stands with Stripe, and when
-- its trial and its paid period end. One per company.
CREATE TABLE subscriptions (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  plan_id TEXT REFERENCES plans (id),
  -- 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete',
  -- 'incomplete_expired' or 'paused': Stripe's own words. Checked by the data
  -- layer.
  status TEXT NOT NULL DEFAULT 'trialing',
  -- Stripe's customer. This is how a webhook comes to belong to a company,
  -- as a site key is for the designer.
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  trial_ends_at TEXT,
  current_period_ends_at TEXT,
  -- 1 when it is set to stop at the end of the period.
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  -- When a payment last failed. Empty once one has gone through.
  payment_failed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  UNIQUE (company_id)
) STRICT;

-- Stripe's messages that have been handled, so one delivered twice is
-- handled once. Platform-wide.
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
