-- SetOut foundations: companies and the work they receive.
--
-- Conventions, which every later migration keeps:
--
--   * Every table a company owns starts its primary key, and every index,
--     with company_id. A row cannot be found without saying whose it is.
--     The only exceptions are the two keys that say which company a request
--     belongs to in the first place: a designer's site key and a draft's
--     resume token.
--   * A row that points at another row points at (company_id, id), never at
--     id alone. The database itself then refuses a job in one company whose
--     customer is in another.
--   * Ids are unguessable text with a prefix that says what they are
--     (job_..., cus_...). Each company also has its own readable references.
--   * Sizes are whole millimetres. Money is whole pence. Times are UTC, as
--     ISO 8601 text.
--   * The design document and worked-out sizes are JSON. Anything filtered or
--     sorted by is a real column.
--
-- Tables for sign-in, pricing, quotes and orders arrive with the steps that
-- use them.

-- ---------------------------------------------------------------------------
-- Platform
-- ---------------------------------------------------------------------------

CREATE TABLE companies (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  -- Short name for readable job references: CS gives CS-1001.
  reference_prefix TEXT NOT NULL UNIQUE,
  next_job_number INTEGER NOT NULL DEFAULT 1001 CHECK (next_job_number >= 1),
  status TEXT NOT NULL DEFAULT 'active',
  plan TEXT NOT NULL DEFAULT 'free',
  currency TEXT NOT NULL DEFAULT 'GBP',
  branding TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(branding)),
  settings TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(settings)),
  features TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(features)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- What each company used each month. Counted from the first day, so plan
-- limits have something to read when billing arrives.
CREATE TABLE usage_monthly (
  company_id TEXT NOT NULL REFERENCES companies (id),
  month TEXT NOT NULL,
  enquiries INTEGER NOT NULL DEFAULT 0 CHECK (enquiries >= 0),
  quotes_sent INTEGER NOT NULL DEFAULT 0 CHECK (quotes_sent >= 0),
  PRIMARY KEY (company_id, month)
) STRICT;

-- ---------------------------------------------------------------------------
-- Company set-up
-- ---------------------------------------------------------------------------

-- Each embedded designer. The site key is safe to publish: it says which
-- company a designer belongs to and nothing more.
CREATE TABLE designers (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  site_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  -- Websites allowed to show this designer, as a JSON list of origins.
  allowed_origins TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(allowed_origins)),
  -- Theme, layouts offered, required steps, estimate on or off.
  config TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config)),
  notify_emails TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(notify_emails)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id)
) STRICT;

-- A company's changes to the default making rules. A new version is a new
-- row; a design revision records the version it was made under.
CREATE TABLE rulesets (
  company_id TEXT NOT NULL REFERENCES companies (id),
  version INTEGER NOT NULL CHECK (version >= 1),
  overrides TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(overrides)),
  note TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (company_id, version)
) STRICT;

-- ---------------------------------------------------------------------------
-- Work
-- ---------------------------------------------------------------------------

CREATE TABLE customers (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  postcode TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id)
) STRICT;

CREATE INDEX customers_by_email ON customers (company_id, email);

-- The spine: one enquiry through to a fitted shower.
CREATE TABLE jobs (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  reference TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  designer_id TEXT,
  stage TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'designer',
  assigned_to TEXT,
  site_address TEXT,
  site_postcode TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  UNIQUE (company_id, reference),
  FOREIGN KEY (company_id, customer_id) REFERENCES customers (company_id, id),
  FOREIGN KEY (company_id, designer_id) REFERENCES designers (company_id, id)
) STRICT;

CREATE INDEX jobs_by_stage ON jobs (company_id, stage, created_at);
CREATE INDEX jobs_by_customer ON jobs (company_id, customer_id);

-- One shower within a job. A job can hold several.
CREATE TABLE designs (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Shower',
  position INTEGER NOT NULL DEFAULT 1 CHECK (position >= 1),
  -- The number of the newest revision. 0 until the first is saved.
  current_revision INTEGER NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id)
) STRICT;

CREATE INDEX designs_by_job ON designs (company_id, job_id, position);

-- Every saved version of a design. Never edited in place: an edit is a new
-- revision, with who made it and why.
CREATE TABLE design_revisions (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  design_id TEXT NOT NULL,
  number INTEGER NOT NULL CHECK (number >= 1),
  -- The design document, exactly as it was checked.
  document TEXT NOT NULL CHECK (json_valid(document)),
  -- The three versions that say how the sizes below were worked out.
  format_version INTEGER NOT NULL CHECK (format_version >= 1),
  engine_version TEXT NOT NULL,
  ruleset_version INTEGER NOT NULL CHECK (ruleset_version >= 0),
  -- The sizes the server's own engine worked out. Never the browser's.
  computed TEXT NOT NULL CHECK (json_valid(computed)),
  author_kind TEXT NOT NULL,
  author_id TEXT,
  reason TEXT,
  -- Staff sign-off. An order can only be made from a checked revision.
  checked_by TEXT,
  checked_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  UNIQUE (company_id, design_id, number),
  FOREIGN KEY (company_id, design_id) REFERENCES designs (company_id, id)
) STRICT;

-- The database refuses a change to what a revision says, whatever the code
-- above it does. Sign-off is the only thing that may be added afterwards.
CREATE TRIGGER design_revisions_are_never_edited
BEFORE UPDATE OF company_id, id, design_id, number, document, format_version,
  engine_version, ruleset_version, computed, author_kind, author_id, reason, created_at
ON design_revisions
BEGIN
  SELECT RAISE(ABORT, 'A design revision is never edited. Save a new revision.');
END;

-- Unfinished designs from the designer, so closing the phone loses nothing.
-- Only a hash of the resume token is stored.
CREATE TABLE drafts (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  designer_id TEXT NOT NULL,
  resume_token_hash TEXT NOT NULL UNIQUE,
  document TEXT NOT NULL CHECK (json_valid(document)),
  format_version INTEGER NOT NULL CHECK (format_version >= 1),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, designer_id) REFERENCES designers (company_id, id)
) STRICT;

CREATE INDEX drafts_by_expiry ON drafts (company_id, expires_at);

-- Photos, measuring photos, drawings and PDFs. The bytes are in file storage
-- under the company's own folder; this is the record of them.
CREATE TABLE files (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  job_id TEXT,
  revision_id TEXT,
  draft_id TEXT,
  kind TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  UNIQUE (company_id, storage_key),
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id),
  FOREIGN KEY (company_id, revision_id) REFERENCES design_revisions (company_id, id),
  FOREIGN KEY (company_id, draft_id) REFERENCES drafts (company_id, id)
) STRICT;

CREATE INDEX files_by_job ON files (company_id, job_id);
CREATE INDEX files_by_draft ON files (company_id, draft_id);

-- The job's timeline. Every change of state writes one, and the job page,
-- outbound webhooks and later connections all read the same events.
CREATE TABLE job_events (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  type TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_id TEXT,
  data TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id)
) STRICT;

CREATE INDEX job_events_by_job ON job_events (company_id, job_id, created_at);
