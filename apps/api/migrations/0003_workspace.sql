-- ---------------------------------------------------------------------------
-- Signing in to the workspace
-- ---------------------------------------------------------------------------
--
-- Staff sign in with a link emailed to them. There are no passwords. A person
-- is one user, whatever companies they belong to, and a membership says which
-- companies those are and as what. Nobody signs up: an owner, or SetOut, adds
-- people to a company, and only they can ask for a link.
--
-- Tokens are never stored, only their SHA-256 hashes, so neither a copy of the
-- database nor anyone reading it can sign in as anyone.

-- The people who work for the companies on SetOut. Platform-wide: one row per
-- person, whatever companies they belong to.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  -- Lower-cased, so an address is one person however it is typed.
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_signed_in_at TEXT
) STRICT;

-- Who works for which company, and as what. A company table: it belongs to
-- the company, and the company can see and change it.
CREATE TABLE memberships (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  -- 'owner' or 'staff'. Checked by the data layer, so a role can be added
  -- without rebuilding the table.
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  UNIQUE (company_id, user_id)
) STRICT;

-- A signed-in member's companies are found from their user. Like a site key,
-- this is how a request comes to belong to a company.
CREATE INDEX memberships_by_user ON memberships (user_id);

-- A sign-in link that has been emailed. It works once, for fifteen minutes.
CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
) STRICT;

-- How many links an address has asked for lately, so it cannot be flooded.
CREATE INDEX login_tokens_by_email ON login_tokens (email, created_at);

-- A signed-in browser, and the company it is working in.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  company_id TEXT REFERENCES companies (id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
) STRICT;

CREATE INDEX sessions_by_user ON sessions (user_id);
