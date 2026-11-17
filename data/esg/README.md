# ESG price list (Brennan Glass, 3 March 2026)

Trade costs issued by ESG Group Ltd to Brennan Glass on 3 March 2026, forwarded
to Custom Showers by Ronan Brennan on 31 March 2026. They are a rough guide
for Custom Showers’ costs until ESG confirms the same rates apply. They are
plus VAT, and the covering email said the list is “based on agreed volume”.

`brennan-glass-03.03.2026.csv` is in the import format used by
`POST /api/workspace/settings/suppliers/:id/import` and by
`scripts/seed-suppliers.mjs`. Costs are in pounds, ex-VAT.

Enduroshield is by the square metre (the PDF header said L/M; Jemma Cadd’s
email of 3 March 2026 corrected that). Polishing stays a linear metre.

What this list does not yet do:

- Shape category surcharges (categories 1/2/3 are not defined on the page) are
  recorded but not applied automatically.
- The heading is “up to 2800 × 4800” but oversize starts at 4000mm; that gap
  is unresolved.
- 4mm and 5mm float, and the acoustic laminates, have no SetOut key yet,
  because the designer quotes toughened glass in the types it offers. They are
  stored under a `sku:` key until they are matched.
- 8mm and 12mm toughened are not on this list.
- Screen print and back paint have no prices.
- Polish quantity on a new quote is the perimeter of the cut rectangle, not
  the true shaped edge length.
- Site delivery is on the list for the record; a new quote does not add
  delivery by itself.

Do not load these figures into `price_list` (the selling-price book). They
are supplier costs. The seed script writes them to `supplier_prices` on the
ESG supplier. The script only prints SQL, and it refuses to run for
production.
