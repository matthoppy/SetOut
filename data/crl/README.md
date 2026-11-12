# CRL UK/Europe shower hardware and seals catalogue

Import-ready extract of C.R. Laurence frameless shower hardware and shower seals, built on 11 November 2026 (America/Lima) for Matt’s SetOut app.

The catalogue is meant to be handed to Claude Code for database import. One CSV row is one CRL catalogue number (SKU), including finish. The JSON file nests the same data by product family, with finish variants inside each family.

Matt uses **10 mm glass** on almost everything, and for sliding systems he only uses CRL’s **Serenity** range. Those facts are flagged in the data (`compatible_10mm`, and Serenity kits/parts are under Shower Door Kits) but the extract is the full shower-hardware tree, not a 10 mm / Serenity-only subset.

## Files

| Path | What it is |
| --- | --- |
| `crl_shower_catalogue.csv` | **Import file.** 2,443 rows, one per SKU + finish. UTF-8 with header. |
| `crl_shower_catalogue.json` | Same data nested by product family (618 families), plus a `meta` block. |
| `images/` | Main product photo per SKU, named `{SKU}.gif` (2,442 files). One SKU has no photo (see below). |
| `fabrication/` | 18 specification/install PDFs and 53 extra product images linked from offer pages. |
| `source-pdfs/SDH17UKA.pdf` | Official UK Shower Door Hardware brochure (31 pp, A4). |
| `source-pdfs/MBL18UK.pdf` | Official UK Matte Black shower range brochure (20 pp, A4). |
| `pdf-text/` | Plain-text extracts of those two UK brochures. |
| `scripts/` | Crawler and tidy-up scripts, if you need to refresh the extract. |
| `cache/` | Raw showline HTML (not required for import; omitted from the zip). |

## Where the data came from

The intended storefront is the **UK/Europe site**:

- https://www.crlaurence.co.uk — UK Smart Glazier account (Matt’s trade login)
- https://www.crl.eu — Europe Magento store, English catalogue under `/en/`

From this environment both sites return **HTTP 403** (BunnyCDN bot challenge) for HTML, sitemaps, and media. Public product data was therefore taken from the Australia showline app, which uses the **same GroupIDs, ProductIDs, SKUs, specifications, finishes and product images** as the UK catalogue:

- Category tree root: GroupID `39326` — Frameless Shower Door and Bath Accessories
- Member lists: `POST https://www.crlaurence.com.au/crlapps/showline/showline.aspx` (`Action=getMembers`)
- Product pages: `https://www.crlaurence.com.au/crlapps/showline/offerpage.aspx?ProductID={id}&GroupID={model}&ModelID={model}`

Every row also has the matching **UK** offer-page URL, which is the right place to read trade prices once signed in:

```
https://www.crlaurence.co.uk/crlapps/showline/offerpage.aspx?Productid={product_id}&GroupID={model_id}&ModelID={model_id}
```

UK brochure PDFs were downloaded from CRL’s public Azure catalogue library (same files the UK site links to):

- https://azure.crlaurence.com/adv/catalog_library/catalogs/SDH17UKA/L5012%20–%20UK%20Shower%20Hardware%20SDH17UKA%20LR.pdf
- https://azure.crlaurence.com/adv/catalog_library/catalogs/MBL18UK/MBL18UK.pdf

The full SD21 frameless shower catalogue exists as a flipbook at https://catalogs.crlaurence.com/SD21-Frameless-Shower-Hardware/ but a single downloadable PDF was not available from a public URL that this environment could reach.

Shower **cleaning products** (GroupID `58041`) were excluded as out of scope. Nothing was added to a cart, ordered, or sent to CRL.

## Prices — not in this file

**No sell prices are included.** Logged-out offer pages do not show a price (the Australia dataLayer value is `-1`). UK Smart Glazier net prices, VAT treatment (ex/inc), and trade units appear only after signing in at crlaurence.co.uk.

To fill `price`, `price_vat` and confirm `price_unit`:

1. Sign in to Matt’s UK Smart Glazier account at https://www.crlaurence.co.uk
2. Open each row’s `product_page_url_uk` (or use CRL Quick Pricing if that is enabled on the account)
3. Record the figure exactly as shown, plus whether it is ex VAT or inc VAT, and the unit (each / pair / length / kit / pack)

`price_currency` is pre-set to `GBP`. `price` and `price_vat` are left blank on purpose.

## Coverage (after de-duplicating cross-listed SKUs)

CRL lists the same catalogue number under more than one heading (for example a hinge under both “Adjustable Hinges” and “Prima Series”). The CSV has **one row per SKU**. Additional headings are in `also_listed_under` (547 SKUs).

| Top category | SKUs |
| --- | ---: |
| Shower Door Hinges and Parts | 917 |
| Glass Clamps, Brackets and Clips | 359 |
| Pull Handles and Knobs | 246 |
| Towel Bars | 244 |
| Shower Door Kits (incl. Serenity, Hydroslide, Cambridge, Velare, Cabo, etc.) | 194 |
| Headers and Support Bars | 182 |
| Accessories and installation supplies | 131 |
| Wipes and Seals | 94 |
| U-Channels, Thresholds and miscellaneous | 65 |
| Shower Door Hinge Kits | 8 |
| Tub enclosure / older sliding hardware | 3 |
| **Total** | **2,443** |

Field fill rates:

| Field | Rows with a value | Notes |
| --- | ---: | --- |
| Finish | 2,221 / 2,443 (91%) | From the offer-page variant table / official finish name. A few accessories still have a blank finish when CRL did not name one. |
| Image file | 2,442 / 2,443 | Missing: `CAMS1SB` (Cambridge satin-brass replacement stopper). The published image URL 404s. |
| Glass thickness | 1,528 / 2,443 (63%) | Only when the page stated it. |
| Compatible with 10 mm glass | yes 1,340 / no 143 / blank 960 | Blank means the page did not give a thickness range. |
| Cut-outs required | yes 1,499 / no 9 / blank 935 | Blank means the page did not say. Not guessed. |
| Hole diameter (mm) | 494 | From “Hole Diameter Required” and similar page wording, plus Serenity pull (see below). |
| Hole count | only when the page said so | Left blank rather than assumed (a back-to-back knob still uses one hole through the glass). |
| Linked fabrication file | 1,182 | Local path in `fabrication/`. Many of the extra “symbol” images are installation photos, not dimensioned templates. |
| Price | 0 | Trade login required (see above). |

### Serenity (the sliding system Matt uses)

Deluxe 180° kits for 8–10 mm glass (`SER78*` and `AUSER78*`) and the Senior kit for 12 mm only (`SRSER78*`, `PCSRSER78`) are included, with accessory kits, header bars, rollers, stoppers, pulls, guides and L-seals.

- Deluxe Serenity (`SER78`): 8–10 mm monolithic toughened glass, max door **762 mm** wide or **40 kg**. `compatible_10mm` = yes.
- Senior Serenity (`SRSER78`): **12 mm only**. `compatible_10mm` = no.
- Glass fabrication: holes are required in both the door and the fixed panel. U-channel or clamps for the fixed panel are sold separately.
- Thru-glass pull hole: **46–50 mm** (CRL also writes 1-7/8\"–2\" / 47–50 mm). Source: product-page copy and the Deluxe Serenity installation instructions (AVDB3149). The install PDF itself sits on the EU CDN and could not be downloaded here, so **roller / track-holder hole sizes and edge distances are not in this file** — they are on the template/formula packed with the kit and on that install sheet.
- A 90° return uses `SER90*` (or `AUSER90*`) plus wall track holders.

### Glass cut-outs more generally

- **Hinges** (Geneva, Pinnacle, Vienna, Melbourne, Prima, etc.): almost always “Cut-Out Required. Use only the template included with this hinge. Cut-out dimensions may not match other brands.” The page includes “glass fabrication dimensions” with the product; the exact notch millimetres are **not printed on the offer page**. Capacity (two-hinge / three-hinge weight and door width) is in `capacity_notes`, `max_door_width_mm` and `max_door_weight_kg` when stated. Melbourne is explicitly a simple rectangular cut-out.
- **Handles, knobs, towel bars**: typically a **12 mm** diameter hole (sometimes 16, 19 or 22 mm; some transom hardware is 16–19 mm). Taken from “Hole Diameter Required” on the product page.
- **Clamps / some clips**: often hole-in-glass; some are no-drill / clamp-on — only marked `cutouts_required=no` when the page said so.
- **U-channels, most vinyl/polycarbonate seals, drip rails**: usually slip over or butt the glass with **no cut-out**. The field is left **blank** unless the page said so, rather than inferred.
- Do not use another brand’s cut-out; CRL is explicit about this.

## CSV / JSON fields

| Field | Meaning |
| --- | --- |
| `category` | Top shower-hardware heading (hinges, seals, kits, …). |
| `category_path` | Full breadcrumb, most specific heading used as the primary path. |
| `also_listed_under` | Other CRL headings that list the same SKU, separated by ` \| `. |
| `product_family` | Offer-page family title (one hinge model, one seal profile, one kit, …). |
| `product_name` | Finish-specific name. |
| `sku` | CRL catalogue number (e.g. `GEN074CH`, `SER78MBL`, `SDK160MBL`). |
| `product_id` / `model_id` | CRL showline IDs, used in the offer-page URL. |
| `finish` | e.g. Polished Chrome, Brushed Nickel, Matte Black, Brushed Brass PVD. |
| `price` | Left blank. |
| `price_currency` | `GBP`. |
| `price_vat` | Left blank (ex or inc VAT, once priced). |
| `price_unit` / `unit` | `each`, `pair`, `length`, `kit`, or `pack`, from the product title. |
| `price_notes` | How to obtain the trade price. |
| `glass_thickness` | As written on the page (often imperial and metric). |
| `glass_thickness_min_mm` / `max_mm` | Parsed millimetre range when it could be read cleanly. |
| `compatible_10mm` | `yes` / `no` if a range was parsed; otherwise blank. |
| `dimensions` | Lengths, centre-to-centre, section sizes when stated. |
| `max_door_width_mm` / `max_door_weight_kg` | Standard (usually two-hinge or kit) limit. Full two-/three-hinge figures stay in `capacity_notes`. |
| `cutouts_required` | `yes`, `no`, or blank if the page did not say. |
| `cutout_summary` / `fabrication_details` | Quoted or closely paraphrased page wording. |
| `hole_diameter_mm` | Glass hole diameter in mm (and a short note if it varies by size). |
| `hole_count` | Only when the page stated a count. |
| `notch_size` / `edge_distance` | Only when a sized notch or edge/CTC figure was in the text. |
| `fabrication_source` | Where the cut-out notes came from. |
| `fabrication_pdf_urls` / `fabrication_files` | Remote URL and local path under `fabrication/`. |
| `image_url` / `image_file` | Remote product image and local `images/{SKU}.gif`. |
| `product_page_url_uk` | Canonical UK offer page (use this for prices). |
| `product_page_url_au` | Australia offer page the extract was taken from. |
| `bullet_points`, `product_details`, `additional_information`, `important_notes`, `catalog_references` | Offer-page copy, kept for import and search. |

Empty cells mean “not stated,” not “not applicable,” except where `cutouts_required=no` is explicit.

## What is still missing, and why

1. **UK trade prices and VAT** — hidden until the Smart Glazier account is signed in on crlaurence.co.uk. Same offer-page URLs will show them.
2. **Exact hinge (and most clamp) cut-out millimetres** — CRL only publishes “use the template in the box.” Dimensioned drawings live in that template, in the full SD21 / CRL23R catalogues, and sometimes in install PDFs that were not reachable here.
3. **Serenity roller / track-holder hole layout** — confirmed as required; diameters, counts and edge distances are on the AVDB3149 install sheet (EU CDN blocked). The pull hole (46–50 mm) is recorded.
4. **CAMS1SB product photo** — the image URL on the offer page returns 404.
5. **Finish on 222 SKUs** — mostly accessory/spare parts where CRL did not name a finish on the variant table.
6. **Glass thickness / 10 mm flag on ~40% of rows** — typically seals, some channels, screws, gaskets and spares, where the page never stated a thickness. Do not assume 10 mm compatibility.
7. **`cutouts_required` blank on 935 rows** — mostly seals, channels, headers, spares and fittings. Many of these need no glass cut-out, but that was not written on the page, so it was left blank.
8. **Europe-only lines** such as Bellagio, Trento, Altea and Velare **are included** when they appeared in the shared showline tree. A small number of UK-only or EU-only items that are not in that tree may be absent; the UK/EU storefronts could not be crawled directly.
9. **SDH17UKA is a 31-page UK highlights brochure**, not the complete price book. The showline tree is the complete heading list that was reachable.

## Refreshing later

`scripts/crawl_crl.py` walks the showline tree and caches HTML under `cache/`. `scripts/finalize_catalogue.py` de-duplicates SKUs and rebuilds the CSV/JSON. A later pass can fill prices by opening `product_page_url_uk` while logged in as the UK trade account. Do not place or submit orders from a crawl.
