-- ---------------------------------------------------------------------------
-- Supplier kinds, a default of each kind, and an optional SKU on a cost
-- ---------------------------------------------------------------------------
--
-- A company may have several suppliers of glass and of hardware. It names a
-- default of each kind. A new quote takes its cost from that default's
-- price for the line, sells at cost plus the company's markup (kept in
-- companies.settings, 100% until set otherwise), and otherwise starts from
-- the price book as before. Existing and sent quotes are not changed: their
-- lines already stand as they were written.
--
-- kind is 'glass', 'hardware' or 'other', checked by the data layer.
-- Existing suppliers, added before kinds existed, are 'other' and not the
-- default, so a quote already in the world is not quietly repriced.
--
-- sku is the supplier's own number. Empty is allowed. A later CRL catalogue
-- can be imported with a SKU and, until it is matched, a SetOut key of the
-- form sku:….

ALTER TABLE suppliers ADD COLUMN kind TEXT NOT NULL DEFAULT 'other';
ALTER TABLE suppliers ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1));

CREATE INDEX suppliers_by_kind ON suppliers (company_id, kind);
-- At most one default of each kind.
CREATE UNIQUE INDEX suppliers_one_default_per_kind ON suppliers (company_id, kind) WHERE is_default = 1;

ALTER TABLE supplier_prices ADD COLUMN sku TEXT;
CREATE UNIQUE INDEX supplier_prices_sku ON supplier_prices (company_id, supplier_id, sku) WHERE sku IS NOT NULL;
