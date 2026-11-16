-- ---------------------------------------------------------------------------
-- A customer confirming their order
-- ---------------------------------------------------------------------------
--
-- Before glass is cut, the customer is sent a link to a page that shows what
-- will be made, asks how the glass can be taken off the van and whether they
-- want any extras, and has them tick that the sizes are theirs and type their
-- name. As with a quote, the link is long, random and never stored: only its
-- hash is.
--
-- Their answers are written on the job's timeline, as an order_confirmed
-- job event. This table holds only the link and when it was used, so that
-- opening it again shows the thank-you rather than the form.

CREATE TABLE order_confirmations (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  -- The hash of the customer's link. A new link for the same job replaces it.
  link_token_hash TEXT NOT NULL UNIQUE,
  -- The member of staff who made the link.
  created_by TEXT,
  -- Set once, when the customer confirms.
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id)
) STRICT;

CREATE INDEX order_confirmations_by_job ON order_confirmations (company_id, job_id);

-- A confirmation is what the customer agreed to. Once given, whatever the code
-- above does, the database refuses to change it or give it a second time.
CREATE TRIGGER order_confirmations_are_never_edited_once_confirmed
BEFORE UPDATE ON order_confirmations
WHEN OLD.confirmed_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'A confirmed order is never changed. Make a new link.');
END;
