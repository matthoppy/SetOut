-- ---------------------------------------------------------------------------
-- Quotes, and the prices a company has used before
-- ---------------------------------------------------------------------------
--
-- A quote prices a job's showers as they stood when it was written. Staff
-- draft it, and while it is a draft they can change anything in it. Once it is
-- sent it is what the customer was offered, so nothing in it may change again:
-- the database refuses it. A customer accepts it with a link that is long,
-- random and never stored, only its hash, as with a sign-in link.

CREATE TABLE quotes (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  -- Quote 1, 2 and so on, for this job.
  number INTEGER NOT NULL CHECK (number >= 1),
  -- 'draft', 'sent', 'accepted' or 'withdrawn'. Checked by the data layer.
  status TEXT NOT NULL DEFAULT 'draft',
  -- What is priced: [{ key, description, quantity, unit, unitPricePence }].
  lines TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(lines)),
  -- The revision of each shower it prices: [{ designId, revisionId, number }].
  priced TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(priced)),
  -- A few words to the customer, shown with the quote.
  note TEXT,
  currency TEXT NOT NULL DEFAULT 'GBP',
  -- VAT in hundredths of a percent: 2000 is 20%.
  vat_rate_bp INTEGER NOT NULL DEFAULT 2000 CHECK (vat_rate_bp BETWEEN 0 AND 10000),
  -- Worked out from the lines on the server, in pence.
  subtotal_pence INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_pence >= 0),
  vat_pence INTEGER NOT NULL DEFAULT 0 CHECK (vat_pence >= 0),
  total_pence INTEGER NOT NULL DEFAULT 0 CHECK (total_pence >= 0),
  -- How long it stands once sent, and the day that comes to.
  valid_days INTEGER NOT NULL DEFAULT 30 CHECK (valid_days BETWEEN 1 AND 365),
  valid_until TEXT,
  -- The hash of the customer's link. Set when it is sent.
  link_token_hash TEXT UNIQUE,
  created_by TEXT,
  sent_by TEXT,
  sent_at TEXT,
  accepted_at TEXT,
  -- The name the customer typed to accept it.
  accepted_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  UNIQUE (company_id, job_id, number),
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id)
) STRICT;

CREATE INDEX quotes_by_job ON quotes (company_id, job_id);

-- What a customer was sent is what they were offered. Whatever the code
-- above does, the database refuses to change it afterwards. Only what
-- happens to it may be added: accepted, or withdrawn.
CREATE TRIGGER quotes_are_never_edited_once_sent
BEFORE UPDATE OF company_id, id, job_id, number, lines, priced, note, currency, vat_rate_bp,
  subtotal_pence, vat_pence, total_pence, valid_days, valid_until, created_by, created_at
ON quotes
WHEN OLD.status <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'A sent quote is never edited. Write a new one.');
END;

-- The price a company last sent for each thing it quotes, so the next quote
-- starts from it: glass of a kind by the square metre, a make of hinge in a
-- finish, a handle, channel by the metre, fitting.
CREATE TABLE price_list (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  -- What it is the price of, such as 'glass:10:clear' or 'hinge:geneva:chrome'.
  key TEXT NOT NULL,
  unit TEXT NOT NULL,
  unit_price_pence INTEGER NOT NULL CHECK (unit_price_pence >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  UNIQUE (company_id, key)
) STRICT;
