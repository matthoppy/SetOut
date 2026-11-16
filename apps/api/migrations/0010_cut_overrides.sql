-- ---------------------------------------------------------------------------
-- A different deduction for one pane of one job
-- ---------------------------------------------------------------------------
--
-- The cut size comes from the company's rules: so much off the width at a
-- wall channel, so much off the height for the bottom channel. Sometimes one
-- job needs something else, such as when the customer supplied no rake
-- measurement (Matt, 16 November 2026: CS-1001, 8mm off the width and 5mm off
-- the height instead of the standard 10 and 5). Staff set it here, with a
-- reason, and the cut size is then worked out from it instead of the rule.
--
-- One per pane of a shower. It is never shown to the customer. Who set it and
-- when is kept here and written on the job's timeline.

CREATE TABLE cut_overrides (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  design_id TEXT NOT NULL,
  -- The pane's id within the shower, such as 'p1'.
  pane_id TEXT NOT NULL,
  -- Taken off what was measured, in whole millimetres, in place of the rule's.
  width_deduction_mm INTEGER NOT NULL CHECK (width_deduction_mm BETWEEN 0 AND 200),
  height_deduction_mm INTEGER NOT NULL CHECK (height_deduction_mm BETWEEN 0 AND 200),
  -- Why. Required.
  reason TEXT NOT NULL CHECK (length(trim(reason)) >= 3),
  -- The revision of the shower it was set against, so a later change to the
  -- shower can be flagged.
  revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
  -- The member of staff who set it last.
  set_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  UNIQUE (company_id, design_id, pane_id),
  FOREIGN KEY (company_id, job_id) REFERENCES jobs (company_id, id),
  FOREIGN KEY (company_id, design_id) REFERENCES designs (company_id, id)
) STRICT;

CREATE INDEX cut_overrides_by_job ON cut_overrides (company_id, job_id);
