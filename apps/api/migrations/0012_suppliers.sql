-- ---------------------------------------------------------------------------
-- Who a company buys from, and what each supplier charges
-- ---------------------------------------------------------------------------
--
-- A shower company buys its glass from one toughener or more and its hardware
-- from CRL and others (Matt, 17 November 2026: "do the price book for multi
-- supplier"). Each supplier has its own price list, by the same keys as the
-- company's price book (price_list, 0005): glass:10:clear by the square
-- metre, hinge:gen044:chrome each, and so on. A supplier's price is what the
-- company pays, before VAT; the price book is what it charges. The two are
-- never mixed: a quote is priced from the price book alone, and the price
-- book is filled from a supplier's prices only when an owner says so.
--
-- Only owners see these. Every change is in the audit log.

CREATE TABLE suppliers (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id)
) STRICT;

CREATE TABLE supplier_prices (
  company_id TEXT NOT NULL REFERENCES companies (id),
  id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  -- What it is the price of, as in the price book.
  key TEXT NOT NULL,
  unit TEXT NOT NULL,
  -- What the supplier charges, in pence before VAT.
  cost_pence INTEGER NOT NULL CHECK (cost_pence >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, id),
  UNIQUE (company_id, supplier_id, key),
  FOREIGN KEY (company_id, supplier_id) REFERENCES suppliers (company_id, id)
) STRICT;
