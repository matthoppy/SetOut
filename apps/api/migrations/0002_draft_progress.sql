-- Where the customer had got to in an unfinished design: which step, which
-- measuring card and which layout they started from. The design itself is in
-- `document`. This is what the designer needs to put them back where they
-- were on another device.
--
-- Adding a column leaves the previous version of the code working, which
-- every migration must.
ALTER TABLE drafts ADD COLUMN progress TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(progress));
