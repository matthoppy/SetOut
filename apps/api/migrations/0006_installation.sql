-- ---------------------------------------------------------------------------
-- What the fitters are told
-- ---------------------------------------------------------------------------
--
-- The installation comments printed on a job's installation sheets: how the
-- glass goes in, what to take, how to get in. Written by staff. Where the
-- glass goes is already on the job, as site_address and site_postcode.

ALTER TABLE jobs ADD COLUMN install_notes TEXT;
