-- ---------------------------------------------------------------------------
-- What was done to a company's account, and by whom
-- ---------------------------------------------------------------------------
--
-- Who was put on a company's team, taken off it, or given another role. An
-- owner can see it, so nobody is added or removed without trace. A row is
-- never edited, and stays when the person or membership it is about has gone,
-- so it keeps their address in its data.

CREATE TABLE audit_log (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  -- The user who did it. Null when SetOut did it. Not a link, because what a
  -- person did stays on record after they have gone.
  actor_id TEXT,
  -- 'member_added', 'member_removed' or 'role_changed'.
  action TEXT NOT NULL,
  -- What it was done to, such as a membership's id.
  target_id TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id)
) STRICT;

-- Newest first, and how many people a company has added today.
CREATE INDEX audit_log_by_time ON audit_log (company_id, created_at);
