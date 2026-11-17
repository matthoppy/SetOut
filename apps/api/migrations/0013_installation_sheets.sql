-- ---------------------------------------------------------------------------
-- Installation sheets sent to a customer
-- ---------------------------------------------------------------------------
--
-- A supply-only customer's own fitter has only the installation sheet and its
-- fitting guide to go on (Matt, 17 November 2026: "add it to set out so it
-- can be checked before it's sent out to the clients"). So a sheet reaches a
-- customer in two steps. A member of staff approves it: every shower on the
-- job checked, at the revision each stands at, with the address and the
-- installation comments as they then read. Then it is sent: the customer is
-- emailed a link to read and print it. Sending is refused if anything it
-- covers has changed since it was approved.
--
-- As with a quote, the link is long, random and never stored: only its hash.

CREATE TABLE installation_sheets (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  -- The revision of each shower it covers: [{ designId, revisionId, number }].
  covers TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(covers)),
  -- Where the glass goes and the installation comments, as approved.
  address TEXT,
  postcode TEXT,
  notes TEXT,
  approved_by TEXT,
  approved_at TEXT NOT NULL,
  -- Set when it is sent.
  link_token_hash TEXT UNIQUE,
  sent_by TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id)
) STRICT;

CREATE INDEX installation_sheets_by_job ON installation_sheets (company_id, job_id);

-- What was approved is what was looked over. Whatever the code above does,
-- the database refuses to change it: a change is a new approval.
CREATE TRIGGER installation_sheets_approval_is_never_edited
BEFORE UPDATE OF company_id, id, job_id, covers, address, postcode, notes, approved_by, approved_at, created_at
ON installation_sheets
BEGIN
  SELECT RAISE(ABORT, 'An approved installation sheet is never edited. Approve it again.');
END;

-- What the customer was sent is what they were sent.
CREATE TRIGGER installation_sheets_are_never_edited_once_sent
BEFORE UPDATE ON installation_sheets
WHEN OLD.sent_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'A sent installation sheet is never changed. Approve and send a new one.');
END;
