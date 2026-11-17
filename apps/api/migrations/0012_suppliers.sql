-- ---------------------------------------------------------------------------
-- Suppliers and their price lists
-- ---------------------------------------------------------------------------
--
-- A company can have several suppliers of glass (a toughener, say) and
-- several of hardware, and can name a default of each kind. A supplier's
-- price list holds what it charges the company (the cost). A new quote
-- works out a selling price from that cost and the company's markup, unless
-- a line has a selling price of its own, and otherwise starts from the
-- company's price book (price_list) as before.
--
-- A quote, and a job, can name which glass and hardware suppliers they use.
-- Each line of a quote also keeps the supplier, the list and the cost it
-- was priced from, so a later change to a list cannot change a quote already
-- sent.

CREATE TABLE suppliers (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  -- 'glass', 'hardware' or 'other'. Checked by the data layer.
  kind TEXT NOT NULL,
  -- The company's account number with this supplier, if it has one.
  account_ref TEXT,
  notes TEXT,
  -- 1 if this is the company's default supplier of this kind.
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id)
) STRICT;

CREATE INDEX suppliers_by_kind ON suppliers (company_id, kind, active);
-- At most one default of each kind, even among suppliers that have been switched off.
CREATE UNIQUE INDEX suppliers_one_default_per_kind ON suppliers (company_id, kind) WHERE is_default = 1;

CREATE TABLE supplier_price_lists (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  name TEXT NOT NULL,
  -- 'draft', 'active' or 'superseded'. Checked by the data layer.
  status TEXT NOT NULL DEFAULT 'draft',
  -- When the list starts and stops being the one to use, as UTC dates (the
  -- day only). Empty means it is not limited.
  effective_from TEXT,
  effective_to TEXT,
  currency TEXT NOT NULL DEFAULT 'GBP',
  -- 0: prices are plus VAT. 1: VAT is already in the prices.
  vat_included INTEGER NOT NULL DEFAULT 0 CHECK (vat_included IN (0, 1)),
  -- Where the prices came from, such as a file name or an email.
  source TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, supplier_id) REFERENCES suppliers (company_id, id)
) STRICT;

CREATE INDEX supplier_price_lists_by_supplier ON supplier_price_lists (company_id, supplier_id, status);
-- One active list at a time for each supplier. An older list is marked superseded.
CREATE UNIQUE INDEX supplier_price_lists_one_active ON supplier_price_lists (company_id, supplier_id) WHERE status = 'active';

CREATE TABLE supplier_price_items (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  -- The SetOut quote key, such as 'glass:10:clear' or 'hinge:gen044:chrome'.
  -- Empty when the item is known only by the supplier's own number, as with
  -- a CRL catalogue row not yet matched to a finish.
  key TEXT,
  -- The supplier's own number or SKU.
  sku TEXT,
  description TEXT NOT NULL,
  unit TEXT NOT NULL,
  -- What the supplier charges, in pence, before VAT if the list is plus VAT.
  cost_pence INTEGER NOT NULL CHECK (cost_pence >= 0),
  -- A selling price that stands in place of cost plus markup. Empty means
  -- the company's markup is applied.
  sell_pence INTEGER CHECK (sell_pence IS NULL OR sell_pence >= 0),
  -- Rules that apply when this item is used: { minAreaM2, notes, and any
  -- surcharge percentages that are recorded but not yet applied automatically }.
  rules TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(rules)),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  FOREIGN KEY (company_id, list_id) REFERENCES supplier_price_lists (company_id, id)
) STRICT;

CREATE INDEX supplier_price_items_by_list ON supplier_price_items (company_id, list_id);
CREATE UNIQUE INDEX supplier_price_items_key ON supplier_price_items (company_id, list_id, key) WHERE key IS NOT NULL;
CREATE UNIQUE INDEX supplier_price_items_sku ON supplier_price_items (company_id, list_id, sku) WHERE sku IS NOT NULL;

-- Which suppliers a job or a quote uses. Empty means the company's default
-- of that kind. A sent quote also keeps the supplier on each line, and these
-- columns on the quote itself may not change once it is sent.
ALTER TABLE jobs ADD COLUMN glass_supplier_id TEXT;
ALTER TABLE jobs ADD COLUMN hardware_supplier_id TEXT;
ALTER TABLE quotes ADD COLUMN glass_supplier_id TEXT;
ALTER TABLE quotes ADD COLUMN hardware_supplier_id TEXT;

DROP TRIGGER quotes_are_never_edited_once_sent;
CREATE TRIGGER quotes_are_never_edited_once_sent
BEFORE UPDATE OF company_id, id, job_id, number, lines, priced, note, currency, vat_rate_bp,
  subtotal_pence, vat_pence, total_pence, valid_days, valid_until, created_by, created_at,
  glass_supplier_id, hardware_supplier_id
ON quotes
WHEN OLD.status <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'A sent quote is never edited. Write a new one.');
END;
