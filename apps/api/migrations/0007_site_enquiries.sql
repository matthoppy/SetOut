-- ---------------------------------------------------------------------------
-- A shower company asks to start using SetOut
-- ---------------------------------------------------------------------------
--
-- Sent from the get-started form on SetOut's own site. It belongs to the
-- platform, not to a company: whoever sent it is not a company yet. Until
-- there is a platform admin, these are read here and in the email each one
-- sends.

CREATE TABLE site_enquiries (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  -- Roughly how many showers a month, as one of the form's bands, such as
  -- '5-20'. Null when they did not say.
  showers_per_month TEXT,
  message TEXT,
  -- 'passed', 'not_run' or 'not_configured'. One that failed is never stored.
  bot_check TEXT NOT NULL,
  -- 1 when the form was sent faster than a person fills one in.
  sent_quickly INTEGER NOT NULL DEFAULT 0,
  -- What happened to the email that tells SetOut: 'sending', 'sent',
  -- 'failed' or 'not_set_up'.
  email_status TEXT NOT NULL,
  -- Why, when it failed.
  email_detail TEXT,
  created_at TEXT NOT NULL
) STRICT;

-- How many one address has sent lately, so the form cannot be used to flood.
CREATE INDEX site_enquiries_by_email ON site_enquiries (email, created_at);

-- Newest first, and how many have arrived today from everyone.
CREATE INDEX site_enquiries_by_time ON site_enquiries (created_at);
