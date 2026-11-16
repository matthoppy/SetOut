# CRL deductions: Matt's reference, and what SetOut takes from it

Matt sent the file below on 14 November 2026 ("these are more deduction, keep
everything that i have taught you but just add the stuff from here"). It is
kept here whole, as the reference for anything SetOut makes later. Where it
and Matt's own rules differ, Matt's rules stand: they are SetOut's standard,
and each company can change its own in Settings.

## What SetOut does with it

**Already in SetOut, and the file agrees.** The 2mm silicone joint and the
12mm off a pane butting in at a corner. 25kg/m² for 10mm glass. The 8mm at
the hinge side of a door hung on the wall (CRL Europe's Geneva and Bellagio
figure). About 5mm for an h seal (PCC10) and a clear angle (P12LJ), CRL's
4.7mm. 17mm under a door with the P990WS wipe over the SDT980 threshold. No
deduction for a support bar. Bellagio not in 12mm glass, and its 2500mm
height limit. Geneva's and Bellagio's door limits. Bellagio's cut-outs from
CRL Europe's drawings. Every Serenity number (OW/2 + 22, H − 5, H − 8, the
51mm overlap, the header OW − 25 and its holes, the 3mm wall gaps).

**Added from it (engines 0.13.0 and 0.13.1).**

- Two fixed panes siliconed together in line now share the silicone joint, a
  millimetre off each with the 2mm joint (§6, 180° square-cut). Until now
  they met with no gap.
- Serenity: the track holder holes are 12mm, as CRL's newest manual (Rev D)
  gives them. The door's stopper is set so it closes about 6mm off the wall
  for the L-seal (DK98L), and the glass sizes do not change (§8).

**Where the file differs, Matt's rule stays.**

| | The file (CRL) | SetOut, Matt's rule |
| --- | --- | --- |
| Fixed glass in U-channel at the wall | 5 regular, 6 deep | 10 |
| Fixed glass in U-channel, top | 5 regular, 6 deep | 0, or 10 to the ceiling |
| Glass on clamps at the wall | 2 to 5 by clamp | 3 |
| Door hung in line from glass | Geneva 4, Bellagio 8 with seals or 3 without, others 5 | 3 (Matt, 11 November 2026) |
| Bubble seal, handle side, both ways | 6 (UK brochure 6 to 8) | 9 |
| Hinges from the top and bottom | 203 to the centre | 250 to the near edge of the cut-out, the same at both ends (Matt, 16 November 2026) |
| A pane butting in at a corner | t + 1.5 | t + 2 = 12 |

**Where the file's sources disagree with each other.** Bellagio's wall hinge
(BEL344) fitted without seals: CRL North America's template book gives 2mm,
with a cut-out 54 deep. CRL Europe's own BEL344 drawing, which Custom Showers'
hinges come with (`docs/hinge-templates/crl-europe-bel344-bellagio-wall.png`),
gives 3mm and 52 deep. SetOut keeps CRL Europe's.

**CRL's suggested gaps sheet (AVDB3078).** Matt sent CRL's own sheet, the
source of the seal and sweep gaps below; it is saved in `docs/seals/`. Its
gaps are the ones below. What it adds: the U with a 90° fin comes for 12mm
glass too (PC1200, 22mm), which SetOut now orders on 12mm; the clear angle
(P12LJ) is used at the hinge side as well as the strike side; the H-jamb can
go on the door at its hinge side; and on 8mm glass the wipe (P956WS) leaves
10mm, 16mm over the threshold, which SetOut now takes off 8mm doors (Matt, 16 November 2026: "yeah thats fine for 8mm doors"; engine 0.15.0).

**Which runs through at a door corner: answered by Matt, 15 November 2026,** "It's usually the front side that runs through but they will be able to change that if they want". The front stays SetOut's standard; a company can choose the return in Settings, and its team can choose either for a shower (engine 0.14.0). Where the return runs through, a door closes beside it onto P090SJ (PCJ8 on 8mm glass). The question, as it was put:
Every one of CRL's 90° door parts is drawn with the panel at the corner
running through to the outside corner and the door beside it: the 90°
glass-to-glass hinges (the door 6mm off the panel's inside face; Bellagio 8
with seals, 3 without) and P090SJ, CRL's 90° strike seal that snaps onto that
panel (4.7mm). SetOut runs the door through in front, as at its other
corners, and tucks the panel in behind it, 12mm short, with PC1090 capping
the panel's edge, its fin along the door (CRL gives PC1090 a 20mm gap, drawn
its own way). A 700 door hung on the wall and closing on an 800 return:
SetOut now, door 687 and return 778; CRL's way, door 677 and return 790. A
three-sided shower, the door hung off one 600 return and closing on the
other: now 692, 578 and 578; CRL's way 669, 590 and 590.

---

# CRL frameless shower glass deductions: checked reference for SetOut

Prepared 14 Nov 2026 for Custom Showers. Every number below comes from a CRL (C.R. Laurence) document or CRL product page, or from Matt's own standing rules, and each one says which. Where CRL sources disagree, both values are shown and the row is marked **CONFLICT**. Where no CRL value could be found, the row is marked **NOT VERIFIED** and no number is invented.

How to use this document: treat it as the rule table for the SetOut quoting and cut-size engine. Each rule says which edge of which panel it applies to.

---

## 0. Assumptions and Matt's standing rules (these override CRL where they differ)

| Rule | Value | Note vs CRL |
|---|---|---|
| Glass thickness | **10 mm** toughened on almost every job. 8 and 12 mm values are shown only where CRL gives different numbers. | n/a |
| Silicone joint (wall to glass, and glass to glass) | **2 mm** | CRL's charts assume 1/16" (1.5 mm) for glass-to-glass silicone joints (SDT21 p.2-19) and 1.5–5 mm for glass to wall (p.2-18). Matt's 2 mm sits inside CRL's range. |
| 90° corner, silicone butt joint | The longer panel (or the door-side panel) runs **in front**. The butting panel is shortened by **glass thickness + 2 mm = 12 mm** (10 mm glass), measured from the outside face of the front panel. | CRL's own 90° butt-joint chart works out to the same geometry with a 1.5 mm joint (t + 1.5). Matt's 2 mm overrides it. See §6. |
| Sliding doors | **CRL Serenity only**: SER78 (8/10 mm), SRSER78 (12 mm), SER90 corner add-on. | See §8. |
| Glass weight | 2.5 kg per m² per mm, so **25 kg/m²** for 10 mm | This matches Smart Glazier's server figure. It is not a CRL hardware number. |

**Measurement conventions used below**
- **Opening W** = tight wall-to-wall (or wall-to-panel) width on the glass line.
- **H** = tray/curb to the top of the glass (open-top showers), or tray to ceiling/header where stated.
- **Deduction** = how much smaller the glass is than the space it fills on that edge. Negative numbers mean the glass is **added to** (it extends past a centre-line).
- CRL's glass-to-glass hinge charts (SDT21 p.2-11) and silicone-joint charts (p.2-19) are written from **centre-line** measurements: the centre-line of the adjoining glass. Their add-ons already include the joint gap, so do not deduct the gap again.

---

## 1. Primary sources (all public)

| ID | Source | URL |
|---|---|---|
| **SDT21** | CRL *Frameless Shower Door Guide* SDT21, Section 2 "Calculating Glass Sizes" (pp. 2-8 to 2-22). This is CRL's master deduction manual and the basis of its Showers Online sizing program. | https://azure.crlaurence.com/adv/catalog_library/catalogs/sdT21/sdt21_opf_files/pdfs/sdt21__.pdf |
| **BELBOOK** | CRL Bellagio/Como/Lugano hinge template book, 2022 (pp. 4A-2 to 4A-8). A CRL document hosted by a distributor. | https://files.thebuilderssupply.com/crlaurence/documents/Bellagio_Como_Lugano_Shower_Door_Hinges_Template_Book.pdf |
| **BEL380-EU** | CRL Europe BEL380 drawing ("mit/ohne Dichtung", with/without seals). Distributor-hosted. | https://www.market.nl/userdata/file/3015_20230520110827_BEL380CH-BEL380%20Zeichnungen_Drawings.pdf |
| **BEL392-EU** | CRL Europe BEL392 drawing, with/without seals. Distributor-hosted. | https://www.market.nl/userdata/file/3016_20230520111504_BEL392CH-BEL392-NEW.pdf |
| **GEN037-T** | CRL GEN037 template, 2022 (4C-1/4C-2). Distributor-hosted. | https://files.thebuilderssupply.com/crlaurence/documents/GEN037_Template.pdf |
| **EU25** | CRL Europe 2025 shower hardware brochure (NL edition): p.4–5 Bellagio, p.8 Geneva "aanbevolen speling" (recommended clearance), p.19–20 seals | https://www.crl.eu/media/cataloge/2025/pdf/M7585-Dutch-Shower-Hardware-Brochure-2025-v1.pdf |
| **UK17** | CRL **UK** Shower Door Hardware brochure SDH17UKA (2017): capacities, U-channels, seals, Serenity | https://azure.crlaurence.com/adv/catalog_library/catalogs/SDH17UKA/L5012%20–%20UK%20Shower%20Hardware%20SDH17UKA%20LR.pdf |
| **AVDB3078** | CRL "Suggested Gaps (Clearances)" when using CRL wipes and seals, 10/14 | https://www.crlaurence.com.au/adv/shower_doors/docs/avdb3078-gaps-clearances.pdf |
| **SER-D** | CRL SER78 Deluxe Serenity installation manual 11M0347 Rev D (12-13-19). Distributor-hosted. | https://files.thebuilderssupply.com/crlaurence/documents/Deluxe_Serenity_Series_SER78_Sliding_Door_Kit_Installation_Instructions.pdf |
| **SER-180** | CRL SER78 180° instructions AVDB3149 (EU copy) | https://www.crl.eu/media/catalog/pdf-preview/c/o/configSku-54635-AVDB3149-Deluxe-Serenity-ser78.pdf |
| **SER-90** | CRL SER78 + SER90 90° instructions AVDB3176 | https://prod.sd02.cloud.opentext.com/ImConvServlet/imconv/9cc5996b034b83eb2a9a8a1e8d88fcffb6f30189/original?assetDescr=Deluxe+Serenity+Series+SER90+Installation+Instructions&hybrisId=cyd3v0u8ig-oldcastle1-p1 |
| **SRSER** | CRL SRSER78 Senior Serenity (12 mm) instructions AVDB3310 | https://www.crlaurence.com.au/techdocs/pdf/SRSER78.pdf |
| **CAT** | CRL product pages (UK offer-page URLs given per row; text read from CRL's identical AU showline pages because crlaurence.co.uk blocks automated reads) | per row |
| **SG** | Smart Glazier (Matt's CRL UK account) clearance table, reverse-engineered earlier. Account-specific, **not** a CRL publication. Shown for comparison only. | /workspace/sg/data/clearances.csv |

---

## 2. Hinged doors: CRL's generic deductions (apply to any CRL hinge unless §3 gives a hinge-specific value)

| # | Situation | Edge | Deduction (10 mm glass) | 8 / 12 mm | Source | Confidence |
|---|---|---|---|---|---|---|
| 2.1 | Door on **wall-mount hinges**, door spans wall to wall | Width: hinge side | **5 mm** (3/16") | same | SDT21 p.2-8 | Confirmed CRL. Applies when the door swings out only or has no vertical seals. With seals, use §4. |
| 2.2 | same | Width: strike (latch) side | **5 mm** (3/16") | same | SDT21 p.2-8 | Confirmed CRL |
| 2.3 | same | **Door width total** | **opening − 10 mm** | same | SDT21 p.2-8 | Confirmed CRL |
| 2.4 | Door floor to ceiling | Height: top gap | **3 mm** (1/8") | same | SDT21 p.2-8 | Confirmed CRL |
| 2.5 | Any swing door | Height: bottom gap (no specific sweep chosen) | **11 mm** (7/16") | same | SDT21 p.2-8, 2-9 | Confirmed CRL. If a sweep is chosen, use §4. |
| 2.6 | Door floor to ceiling | **Door height total** | **H − 14 mm** | same | SDT21 p.2-8 | Confirmed CRL |
| 2.7 | Door with open space above | Door height | **door-top height − 11 mm** | same | SDT21 p.2-8 | Confirmed CRL |
| 2.8 | Door under a header (side-mount hinges) | Height | top gap **3 mm** under header, bottom **11 mm** | same | SDT21 p.2-9 | Confirmed CRL |
| 2.9 | **180° glass-to-glass hinge** (door hung off an inline fixed panel) | Fixed panel at hinge edge | **0** (fixed panel goes to the hinge line) | 0 for 6–12 mm | SDT21 p.2-11 | Confirmed CRL |
| 2.10 | same | Door width | **−10 mm** total: hinge side 5 + strike side 5 | −10 for 6–12 mm | SDT21 p.2-11 | Confirmed CRL (generic). Bellagio/Geneva differ, see §3. |
| 2.11 | **90° glass-to-glass hinge** (door hung off a return panel at 90°), square-cut glass | Fixed panel (from centre-line) | **+5 mm** (3/16") | 8 mm: +4 (5/32"); 12 mm: +6 (1/4") | SDT21 p.2-11 | Confirmed CRL. Covers the hinge side of the fixed panel only. |
| 2.12 | same | Door (from centre-line) | **−16 mm** (5/8"). Hinge-side clearance 6 mm (1/4"), strike 5 mm (3/16") | 8 mm: −15; 12 mm: −17 | SDT21 p.2-11 | Confirmed CRL (generic). Bellagio BEL392 differs, see §3. |
| 2.13 | **135° glass-to-glass hinge**, square-cut door + 45° mitred fixed panel | Fixed panel (from centre-line) | **+5 mm** | 8 mm: +4; 12 mm: +6 | SDT21 p.2-11 | Confirmed CRL (generic) |
| 2.14 | same | Door | **−10 mm** (hinge 5 + strike 5) | same | SDT21 p.2-11 | Confirmed CRL (generic) |
| 2.15 | Top/bottom **pivot** hinges (Prima, Cardiff etc.) instead of side-mount | Door width | extra **−1.5 mm** (1/16") on the glass-to-glass charts. Floor-to-ceiling door height **H − 22 mm** (8/10 mm glass) or **H − 28 mm** (12 mm). | as stated | SDT21 p.2-9, 2-11 | Confirmed CRL. Probably not used by Matt. |
| 2.16 | Custom-angle pivot pins on wall hinges | Hinge-side deduction changes with the pin angle (2°→5.2 mm … 45°→17 mm, from centre-line) | — | — | SDT21 p.2-10 | Confirmed CRL. Edge case. |
| 2.17 | Hinge positions (not a deduction) | **203 mm (8")** from the top and bottom of the door to the **centre of the cutout**. A third hinge goes centred. A fixed panel's cutouts must line up at the same absolute height as the door's. | — | — | SDT21 p.2-15 | Confirmed CRL. Smart Glazier on Matt's account uses **250 mm**: an account setting, not a CRL rule. |

---

## 3. Hinge-specific values (product templates override §2)

### 3a. Bellagio (CRL UK range; 8 and 10 mm glass only, **not 12 mm**)

| Part no. | What | Gap / deduction | Applies to | Capacity (2 hinges) | Source | Confidence |
|---|---|---|---|---|---|---|
| **BEL344** | 90° wall-to-glass offset back-plate hinge | **8 mm** wall-to-glass with the **standard cutout** (47 × 58 mm, R6). **2 mm** with the **tight-clearance cutout** (54 × 84 mm with a 6 mm step, R6). | Door hinge edge to wall | 1000 mm wide, 50 kg. Max door height 2500 mm (EU25 p.4). | BELBOOK 4A-5/4A-6 | Confirmed CRL. CRL Europe: 8 mm = "with seals", tight = "without seals". |
| **BEL380** | 180° glass-to-glass hinge | **8 mm** door-to-panel gap, standard cutout (with seal). **3 mm**, tight-clearance cutout (no seal). Fixed-panel cutout 33 × 52 mm. Door cutout 47 × 58 (std) or 52 × 84 with a 6 mm step (tight). | Gap between fixed-panel edge and door hinge edge | 1000 mm, 50 kg | BELBOOK 4A-7/4A-8; BEL380-EU | Confirmed CRL (two docs agree) |
| **BEL392** | 90° glass-to-glass hinge | **8 mm** with seals, **3 mm** without seals: gap from the door's hinge edge to the face of the fixed (return) panel. Fixed panel: 2 × Ø16 holes, 33 mm from edge, 50 mm apart. | Door hinge edge | 1000 mm, 50 kg | BEL392-EU | Confirmed CRL Europe drawing. How to turn this into a centre-line fixed-panel size is **not stated**: use §2.11 for the fixed panel. |
| **BEL345** | 135° glass-to-glass hinge | **NOT VERIFIED.** The product page says only "Gap: Adjustable/Varies". Fall back to SDT21 generic 135° (§2.13–2.14) and confirm with CRL UK. | — | 1000 mm, 50 kg | CAT [UK page](https://www.crlaurence.co.uk/crlapps/showline/offerpage.aspx?Productid=226272&GroupID=71803&ModelID=71803) | Capacity confirmed, gap not |
| **BEL354** | 180° glass-to-wall hinge | **NOT VERIFIED** ("Gap: Adjustable/Varies") | — | 1000 mm, 50 kg | CAT [UK page](https://www.crlaurence.co.uk/crlapps/showline/offerpage.aspx?Productid=226278&GroupID=71805&ModelID=71805) | Capacity confirmed, gap not |
| **BEL382** | 180° glass-to-glass **folding** hinge (bi-fold, with BEL344) | **NOT VERIFIED** | — | **800 mm, 40 kg** (lower than other Bellagio) | CAT [UK page](https://www.crlaurence.co.uk/crlapps/showline/offerpage.aspx?Productid=254675&GroupID=72261&ModelID=72261) | Capacity confirmed |
| **BEL90S** | 90° wall clamp (fixed panel to wall) | **2 mm** glass-to-wall. Hole Ø16, **24 mm** from the glass edge. | Fixed panel wall edge | — | BELBOOK 4A-4 | Confirmed CRL. **Smart Glazier uses 1 mm and 25 mm**: correct to 2 mm / 24 mm. Matt's 2 mm rule agrees. |
| **BEL180S** | 180° wall clamp | **NOT VERIFIED** | — | — | CAT | — |
| **BEL090** | 90° glass-to-glass clamp | **2 mm** gap between the butting panel's edge and the overlapping panel's back face, which matches Matt's corner rule (t + 2 = 12 mm). Holes Ø16. For 10 mm glass the hole is 30 mm in on the butting panel ("A") and 41 mm in on the overlapping panel ("B"); mitred joint 40 mm ("C") with a 2 mm mitre gap. | Corner joint | — | BELBOOK 4A-2 | Confirmed CRL |

### 3b. Geneva (UK range; 8–12 mm per UK17. The 2022 GEN037 template says 10–12 mm; 8 mm needs the GEN13 gasket pack)

| Part no. | What | Gap / deduction | Source | Confidence |
|---|---|---|---|---|
| **GEN037 / GEN337** | Wall-mount full back-plate hinge (fixed 0° / adjustable) | **8 mm** recommended wall-to-glass clearance | EU25 p.8 | **CONFLICT**: CRL Europe 2025 says 8 mm. CRL US SDT21 generic says 5 mm (§2.1). Recommend 8 mm (newer, European, product-specific). |
| **GEN044 / GEN344** | Wall-mount offset back-plate hinge | **8 mm** recommended | EU25 p.8 | Same conflict as above |
| **GEN180 / GEN380** | 180° glass-to-glass hinge | **4 mm** recommended glass-to-glass | EU25 p.8 | **CONFLICT** vs SDT21 generic 5 mm. Recommend 4 mm. |
| **GEN092** | 90° glass-to-glass | Use SDT21 §2.11–2.12 (fixed +5, door −16) | SDT21 p.2-11 | Generic CRL only, no Geneva-specific value found |
| **GEN045** | 135° glass-to-glass | Use SDT21 §2.13–2.14 | SDT21 p.2-11 | Generic CRL only |
| Capacity, all Geneva | — | 2 hinges **711 mm / 36 kg**; 3 hinges **813 mm / 54 kg** (8, 10 and 12 mm) | UK17; GEN037-T; CAT | Confirmed |

### 3c. Other CRL hinge families sold in the UK (gaps: SDT21 generic only unless stated)

| Series | Glass | Capacity | Gap | Source | Confidence |
|---|---|---|---|---|---|
| **Pinnacle** (P1N037, P1N044, P1N180, P1N092, P1N045) | 8–12 mm | 2 hinges 711 mm / 36 kg; 3 hinges 813 mm / 54 kg | No product-specific value found. Use §2. | UK17 | Capacity confirmed; gap generic |
| **Cologne** (C0L037, C0L180, C0L092, C0L045; C0L044/C0L544 lower) | 10–12 mm (8 mm with C0L13 gaskets) | 2 hinges 914 mm / 50 kg; 3 hinges 914 mm / 63 kg. C0L044/544: 864 mm, 45 kg (2) / 59 kg (3) | No product-specific value. Use §2. CRL notes that adjustable models may need a different door-width deduction when the angle is changed. | UK17; CAT | Capacity confirmed; gap generic |
| **Vienna** (V1E037, V1E180, V1E092, V1E045; V1E044/074/544 lower) | 10–12 mm | 2 hinges 914 mm / 50 kg; 3 hinges 914 mm / 63 kg. V1E044/074/544: 45 kg / 864 mm (10 mm), 813 mm (12 mm); 3 hinges 59 kg | No product-specific value. The V1EH037 "H" wall plate "allows tighter clearance", but no number is published. | UK17; CAT | Capacity confirmed; gap generic / not verified |
| **Perth** (PER037/044/344 wall, PER180/380, PER092, PER045/345) | 10 mm only | not captured | Wall-to-glass **8 mm**; 180° glass-to-glass **4 mm**; 90° glass-to-glass **8 mm**; 135° glass-to-glass **6 mm** | CAT, e.g. [PER180](https://www.crlaurence.co.uk/crlapps/showline/offerpage.aspx?Productid=206906&GroupID=70538&ModelID=70538), [PER037](https://www.crlaurence.co.uk/crlapps/showline/offerpage.aspx?Productid=206913&GroupID=70541&ModelID=70541) | Confirmed from CRL product text (UK offer-page IDs exist) |

---

## 4. Seals, sweeps and strike jambs: how they change the gap

Rule: when a seal is used, **the seal's recommended gap replaces the bare 5 mm (side) or 11 mm (bottom) gap** from §2 on that edge.

### 4a. Vertical seals (hinge side, strike side, door-to-panel)

| Part no. | Type / use | US value (SDT21 p.2-14, AVDB3078) | UK17 value | Smart Glazier | Status |
|---|---|---|---|---|---|
| **PCR10** | Polycarbonate U with bulb (bi-swing, either edge) | **6 mm** (1/4") | **6–8 mm** | 8 | **CONFLICT** (6 vs up to 8). CRL Europe EU25 gives 4.7 mm for PCR8. Recommend 6 mm for a strike against the wall. With Bellagio standard cutouts the hinge gap is 8 mm regardless (§3a). |
| **PCC10** | 'Y' inline panel seal with soft leg, 180° (on the fixed panel, strike side) | **4.7 mm** (3/16"; treat as 5) | **4–6 mm** | — | Agree within tolerance. Use 5 mm. |
| **P380HJ** | Polycarbonate 'H' jamb, 180° | 4.7 mm | — | — | Confirmed CRL US |
| **P1801P / P180SDJ** | 180° strike and door jamb | 4.7 mm | — | — | Confirmed CRL US |
| **P090SJ** | Polycarbonate U with leg + seal, 90° (fixed panel at 90° to the door) | 4.7 mm | — | — | Confirmed CRL US |
| **PC1090** | U with 90° vinyl fin | **20 mm** | — | — | Confirmed CRL US (AVDB3078) |
| **P135DJ / P135SJ** | 135° door jamb / strike jamb | 4.7 mm | — | — | Confirmed CRL US |
| **P12LJ** | Angle jamb (hinge or strike, taped to wall or panel) | 4.7 mm | — | — | Confirmed CRL US |
| **SDTJ / SDTB / SDLB** | Taped bulb seals | max 4 / 5.6 / 5–10 mm | SDTB 5 mm | — | Confirmed (ranges) |
| **SDTS** | 'V' seal, one-way doors only | 5–6 mm | 4 mm | — | Minor conflict |
| **SDTL / SDTNL** | 'L' seal, outswing only | max 10 / max 8 mm | SDTL 4–6 mm | — | Minor conflict (max vs suggested) |
| **SDTDF** | Double-fin seal | max 8 mm | 6 mm | — | Minor conflict |
| **SDTW** | 'T' edge wipe (side or bottom) | max 11 mm | 10 mm | — | Minor conflict |
| **PMA10 / PMB10 / PMC10** | Magnetic profiles (180°: PMC10+PMC10; 135°: PMA10+PMC10; 90°: PMA10+PMB10) | **11 mm per piece, 22 mm for a pair** | PMC10: **17 mm** on 10 mm glass, 20 mm on 12 mm. PMA/PMB: "contact CRL". | — | **CONFLICT / NOT VERIFIED for UK.** Confirm with CRL UK before use. |

### 4b. Bottom sweeps (door bottom gap)

| Part no. | Type | US bottom gap (no threshold / with SDT980 threshold) | UK17 | Smart Glazier | Status |
|---|---|---|---|---|---|
| **P990WS** | Co-extruded bottom wipe with drip rail, 10 mm (CRL's most popular) | **11 mm / 17 mm** | **8 mm** | 10 | **CONFLICT** (11 US vs 8 UK vs 10 SG). Confirm with CRL UK or test-fit. |
| **P880WS** | Dual-durometer PVC seal and wipe, 10 mm | 6 mm / 11 mm | 6 mm | — | Agree |
| **P500BR** | Polycarbonate bottom rail with wipe, 10 mm | 11 mm / 17 mm | 10 mm | — | Minor conflict |
| **P501BR** | One-piece bottom rail with clear wipe, 10 mm | 11 mm | 11 mm | — | Agree |
| **P375HW** | Multi-purpose 'H' wipe, 10 mm | 8 mm / 14 mm | — | — | Confirmed CRL US |
| **SDTW** (as sweep) | 'T' wipe | 11 mm / 17 mm | — | — | Confirmed CRL US |
| **S1LB** | Silicone bulb | max 5 mm / 11 mm | 5 mm | — | Agree |
| No sweep | — | 11 mm (SDT21 p.2-8) | — | 7 ("Door Base Gap", account default) | SG default is account-specific |

Note (SDT21 p.2-13): with top/bottom **pivot** hinges, a door over a threshold needs 5.5–6 mm above the threshold.

---

## 5. Fixed panels: U-channel, clamps and silicone

### 5a. Height (top and bottom edge). Source: SDT21 p.2-16, 2-16A, 2-17

| Fixing | Top deduction | Bottom deduction | Notes / combined totals | Confidence |
|---|---|---|---|---|
| Floating top (support bar, nothing at the top) | **0** | — | — | Confirmed CRL |
| **Regular U-channel** (e.g. SDCR38 for 10 mm) | **5 mm** (3/16") | **5 mm** | Regular top + bottom, slide-in = **10 mm** total | Confirmed CRL |
| **Deep U-channel** (e.g. **SDCD38** for 10 mm; SDCD12 for 12 mm) | **6 mm** (1/4"), slide-in | **5 mm** | Deep top + regular/deep bottom = **11 mm** total | Confirmed CRL |
| Lift-and-drop install, regular bottom + deep top | 11 mm (7/16") | 5 mm | **16 mm** total | Confirmed CRL |
| Lift-and-drop, deep bottom + deep top | 12 mm (1/2") | 12 mm | **24 mm** total (CRL prints 1") | Confirmed CRL |
| **Dry-glaze channel DUC38** (10 mm) | 10 mm (3/8") | 8 mm (5/16") | Dry-glaze both = 17 mm; dry-glaze bottom + regular top = 12; + deep top = 14 | Confirmed CRL |
| **U-clamp** (e.g. UC77, SCU4) | 5 mm | 5 mm | U-clamps top and bottom = 10 mm | Confirmed CRL |
| 90° glass clamp used as a wall/floor clamp (one outer plate removed) | — | 1.5–5 mm | — | Confirmed CRL |
| "Specialty" clamps on top | add 5 mm to that clamp's bottom value | — | — | Confirmed CRL |
| Silicone straight to tray, no channel | — | **2 mm** (Matt) | CRL range 1.5–5 mm | Matt's rule |
| Smart Glazier: "BELSDCD38" base / head / wall | 8 | 7 | SG-only custom item (wall 8). CRL publishes 5 / 6 / 6 for deep channel. | **CONFLICT**: SG account values are not CRL's published figures |

### 5b. Width (wall edge). Source: SDT21 p.2-18, plus product pages

| Fixing at the wall | Deduction | Source | Confidence |
|---|---|---|---|
| Open or silicone joint | 1.5–5 mm. **Matt: 2 mm.** | SDT21 p.2-18 | Confirmed CRL range |
| Regular U-channel | **5 mm** | SDT21 p.2-18 | Confirmed |
| Deep U-channel (SDCD38) | **6 mm** | SDT21 p.2-18 | Confirmed |
| Dry-glaze U-channel | **8 mm** | SDT21 p.2-18 | Confirmed |
| U-clamp with hole | **5 mm** | SDT21 p.2-18 | Confirmed |
| U-clamp with notch | 1.5–3 mm | SDT21 p.2-18 | Confirmed |
| 90° glass clamp as wall clamp | 1.5–5 mm | SDT21 p.2-18 | Confirmed |
| **BEL90S** Bellagio wall clamp | **2 mm** | BELBOOK 4A-4 | Confirmed (SG says 1) |
| **BGC037 / BGC039** bevelled clamps (small/large leg) | **2 mm** | CAT [BGC037](https://www.crlaurence.co.uk/crlapps/showline/offerpage.aspx?Productid=69947&GroupID=42191&ModelID=42191) | Confirmed |
| **SGC039** square clamp, large leg | **2 mm** | CAT [SGC039](https://www.crlaurence.co.uk/crlapps/showline/offerpage.aspx?Productid=70290&GroupID=42237&ModelID=42237) | Confirmed |
| **SGC037** square clamp, small leg | **5 mm** | CAT [SGC037](https://www.crlaurence.co.uk/crlapps/showline/offerpage.aspx?Productid=70297&GroupID=42238&ModelID=42238) | Confirmed |
| **SGCU1 / BGCU1** notch-in-glass U-clamps | 2 mm | CAT | Confirmed |
| **UC77 / UC66** traditional U-clamps | 4–5 mm | CAT [UC77](https://www.crlaurence.co.uk/crlapps/showline/offerpage.aspx?Productid=16920&GroupID=23400&ModelID=23400) | Confirmed |
| **SCU4 / BCU4** hole-in-glass U-clamps | 5 mm | CAT [SCU4](https://www.crlaurence.co.uk/crlapps/showline/offerpage.aspx?Productid=22939&GroupID=23402&ModelID=23402) | Confirmed |
| **ADJ037 / ADJSQ037** adjustable wall clamps | 4–5 mm | CAT | Confirmed |
| **SGC50** square wall-to-glass bracket (10–12 mm) | **3 mm** | CAT [SGC50](https://www.crlaurence.co.uk/crlapps/showline/offerpage.aspx?Productid=228815&GroupID=72009&ModelID=72009) | Confirmed |
| **SGCWM / SGC180WM** brackets | 1.5 mm | CAT | Confirmed |
| **GCB180** 180° glass-to-glass clamp | 11 mm panel-to-panel gap (the stud sits between the panes), or notch the glass for a tighter gap | CAT [GCB180](https://www.crlaurence.co.uk/crlapps/showline/offerpage.aspx?Productid=17184&GroupID=23431&ModelID=23431) | Confirmed |

Clamp positions (not deductions; SDT21 p.2-21): panel 330–457 mm wide → 2 clamps 76 mm in from each edge; 483–914 mm → 102 mm in; over 914 mm → 152 mm in. Side clamps usually line up with the hinges.

U-channel profiles from UK17 (for drawings, not deductions): SDCD38 is 19 mm deep with a 10.2 mm slot and 14.3 mm outside width. SDCR38 (regular) is 9.5 mm high. The deduction is **not** the channel depth: the glass sits into the channel on setting blocks, and the published deduction is the clearance at the base.

---

## 6. Glass-to-glass silicone joints (no hinge). Source: SDT21 p.2-19

CRL's values are from centre-line and **already include a 1.5 mm joint**.

| Joint | 10 mm glass | 8 mm | 12 mm | Matt's override |
|---|---|---|---|---|
| **90° butt joint**: butting panel | **−6 mm** (−1/4") | −5.5 | −8 | Butting panel = depth to the outside face of the front panel − 10 − 2 = **−12 mm** from the outside face (equivalent to CRL with a 2 mm joint) |
| 90° butt joint: overlapping (front) panel | **+5 mm** (+3/16") | +4 | +6 | Front panel runs to the outside corner: no deduction at the corner when measured to the outside face |
| 90° with both panels mitred 45° | +4 mm each | +3 | +5.5 | — |
| 135°, both mitred 22.5° | +1.5 mm each | +1.2 | +2.4 | — |
| 180° square-cut | **−1 mm each** (−1/32") | −1 | −1 | 2 mm joint → −1 mm each |

Glass-to-glass clamps (BEL090, GC-series) do not change these clearances (SDT21 p.2-19).

---

## 7. Headers and support bars

| Item | Rule | Source | Confidence |
|---|---|---|---|
| **Support bars** (SQ1212SET square, S1212SET round, wall-to-glass and glass-to-glass bars; support-bar brackets such as SBB22 / SBB45) | **No glass deduction**: the bar clamps the top edge of the fixed panel. Bar length: CRL says only "simply cut to size". | SDT21 p.3-29 | Confirmed CRL. **Cut-length formula NOT VERIFIED.** Smart Glazier places the clamp 10 mm from the panel end, which is an account setting. |
| **Deluxe / EZ-Adjust header**: fixed panel | **top-of-header height − 27 mm** (−32 header face + 10 glass depth − 5 U-channel/clamp at the bottom) | SDT21 p.2-22 | Confirmed CRL |
| Deluxe header: door | **top-of-header height − 46 mm** (−32 header, −3 above door, −11 bottom wipe) | SDT21 p.2-22 | Confirmed CRL |
| Deluxe header with DUC38 dry-glaze bottom: fixed panel | −30 mm | SDT21 p.2-22 | Confirmed CRL |
| Junior header: fixed / door | −21 mm / −35 mm (door assumes a 10 mm wipe: P450BR, P914WS, P250HW, SDTW) | SDT21 p.2-22A | Confirmed CRL |
| Door top gap under a header or ceiling | 3 mm | SDT21 p.2-8, 2-9 | Confirmed (Smart Glazier default is 5) |

---

## 8. Sliding: CRL Serenity (Matt's only sliding system)

Kits: **SER78** Deluxe 180° (8–10 mm, monolithic toughened only, no laminated). **SRSER78** Senior 180° (12 mm). **SER90** 90°-return accessory kit (used with SER78). OW = tight wall-to-wall at header height; H = curb to top of glass.

| Item | SER78 (8/10 mm) | SRSER78 (12 mm) | Source | Confidence |
|---|---|---|---|---|
| Door width = fixed panel width | **OW/2 + 22 mm** (7/8") | **OW/2 + 22 mm** | SER-D p.4; SER-180; SRSER | Confirmed CRL |
| Fixed panel height | **H − 5 mm** (3/16": U-channel or clamps + setting block) | H − 5 | SER-D p.4 | Confirmed |
| Door height | **H − 8 mm** (5/16") | H − 8 | SER-D p.4 | Confirmed |
| Overlap, door over fixed | **51 mm** (2") | 51 | SER-D p.3 | Confirmed |
| Header (track) length | **OW − 25 mm**, centred (13 mm each end) | **OW − 42 mm** (21 mm each end) | SER-D p.4; SRSER | Confirmed |
| Glass-to-glass gap (door to fixed) | 25 mm | 35 mm | SER-180; SRSER | Confirmed |
| Wall bracket hole centre height | H − 76 mm | H − 102 mm | SER-180; SRSER | Confirmed |
| Glass above top of header | 62 mm | 83 mm | SER-180; SRSER | Confirmed |
| Header bar stock | 2000 mm | 2000 mm | SER-D p.3 | Confirmed |
| Max door | **762 mm, 40 kg** | 762 mm, 50 kg | UK17 p.37 (SER78); CAT | Confirmed (UK brochure) |
| Max opening (derived, not published) | (762 − 22) × 2 = **1480 mm** (door width limit). Header stock alone would allow up to 2025 mm. | 1480 mm | derived | Derived, not a CRL figure |
| Fixed-panel header-fitting holes | 2 × **Ø12 mm** (1/2"), 89 mm from each edge, 76 mm below top | 2 × Ø16, 89 mm in, 102 mm down | SER-D p.4 (Rev D). The older AVDB3149 says Ø13. | Use Rev D (newer): Ø12 |
| Door roller holes | 4 × Ø16, 89 mm from each edge, 44 mm from the top, second hole 62 mm below | 4 × Ø27, 59 mm from top, 87 mm apart | SER-D p.4 | Confirmed |
| Pull SERNHP2 | Ø47–50 mm, 64 mm from edge, centred vertically | Ø47–51 | SER-D p.4 | Confirmed |
| Header holes for fixed fittings (Ø6) | A = 76 mm + wall gap (79 mm with 3 mm) from header end; B = fixed width − 178 mm | — | SER-D p.6 | Confirmed |
| U-channel end protrusion | glass passes the channel end by 19 mm (guide caps the channel) or 24 mm (guide under panel) | — | SER-D p.8 | Confirmed |

### Resolving the 3 mm vs 6 mm wall gap (previously flagged as conflicting)

- SER-D p.3 dimensions a **3 mm (1/8") standard gap at both walls**, and the width formula only works with that: 2 × (OW/2 + 22) − 51 = OW − 7 mm, i.e. about 3 mm (exactly 1/8" in inches) at each wall. AVDB3149, SER90 and SRSER78 all say "standard gap between wall and fixed and/or sliding glass is 1/8" (3 mm)".
- SER-D p.4 also shows "**1/4" (6 mm) gap between sliding door and wall for L-seal**". The door hangs on rollers, so its closed position is set by the **stopper** (SERNDS1), not by the glass size. The DK98L L-seal is taped to the wall on the handle side and takes up that space.
- **Conclusion (my interpretation of CRL's drawings, not a CRL statement):** size the glass with the 3 mm formula (OW/2 + 22). Set the stopper so the closed door stops about 6 mm off the wall for the L-seal. The overlap then becomes about 48 mm instead of 51. **No change to glass sizes.** The fixed panel stays at 3 mm from its wall.

### SER90 (90° return)
The width formulas are the same, with OW measured from the wall to the **inside face of the return panel**. The return panel's size is **NOT VERIFIED**: CRL gives no formula. The return panel's header fitting sits 22 mm from its edge and 76 mm down, through a Ø13 hole (SER-90 p.4). Apply Matt's corner rule to the return-to-front junction, and confirm with CRL.

---

## 9. Hinge capacity check (for validation warnings)

Door weight = W × H (m) × 25 kg/m² (10 mm glass).

| Hinge family | 2 hinges | 3 hinges | Glass |
|---|---|---|---|
| Bellagio BEL344/380/392/345/354 | 1000 mm, 50 kg (max height 2500) | n/a | 8–10 mm |
| Bellagio BEL382 (folding) | 800 mm, 40 kg | n/a | 8–10 mm |
| Geneva | 711 mm, 36 kg | 813 mm, 54 kg | 8–12 mm |
| Pinnacle | 711 mm, 36 kg | 813 mm, 54 kg | 8–12 mm |
| Cologne (most) | 914 mm, 50 kg | 914 mm, 63 kg | 10–12 mm |
| Cologne C0L044/544 | 864 mm, 45 kg | 864 mm, 59 kg | 10–12 mm |
| Vienna (most) | 914 mm, 50 kg | 914 mm, 63 kg | 10–12 mm |
| Vienna V1E044/074/544 | 864 mm (10 mm) / 813 mm (12 mm), 45 kg | same widths, 59 kg | 10–12 mm |
| Serenity SER78 | door 762 mm, 40 kg | — | 8–10 mm |
| Serenity SRSER78 | door 762 mm, 50 kg | — | 12 mm |

Rule: never exceed either the width or the weight limit (CRL note on every capacity table).

---

## 10. Worked examples (10 mm glass)

### Example 1: inline, 900 mm hinged door + 1200 mm fixed panel, Bellagio
Setup: wall-to-wall 2100 mm. Fixed zone 1200 mm from the left wall; door zone 900 mm from the fixed-panel edge to the right (strike) wall. H = 2000 mm tray to top of glass, open top with a support bar. Fixed panel: BEL90S wall clamps at the left wall and a regular/deep U-channel along the tray. Door: 2 × BEL380 180° glass-to-glass hinges, swinging both ways.

**1A, with seals** (BEL380 standard cutout; PCR10 bulb on the strike edge; P990WS bottom wipe)
- Fixed panel width = 1200 − 2 (BEL90S) = **1198 mm**
- Fixed panel height = 2000 − 5 (U-channel base) = **1995 mm**
- Door width = 900 − 8 (BEL380 standard gap) − 6 (PCR10, CRL US) = **886 mm** (884 mm if you use the UK17 upper value of 8 mm for PCR10)
- Door height = 2000 − 11 (P990WS, CRL US) = **1989 mm** (1992 mm with the UK17 8 mm value)
- Door weight = 0.886 × 1.989 × 25 = **44.1 kg** ≤ 50 kg and 886 ≤ 1000 mm → Bellagio OK
- Hinge cutouts: CRL guide 203 mm from the top and bottom of the door to the cutout centre (SG account: 250). Matching fixed-panel cutouts at the same absolute heights: the fixed panel sits 6 mm lower at the base (11 − 5), so its cutout is 203 + 6 = 209 mm from its own bottom edge.

**1B, no seals** (BEL380 tight-clearance cutout, bare strike gap)
- Fixed panel 1198 × 1995 (unchanged)
- Door width = 900 − 3 (BEL380 tight) − 5 (SDT21 bare strike gap) = **892 mm**
- Door height = 2000 − 11 = **1989 mm**

**Same job with Geneva:** 886–892 mm is wider than Geneva's 813 mm 3-hinge limit and 44 kg is over 36 kg for 2 hinges → **not allowed**. Use Bellagio, Cologne or Vienna (Cologne/Vienna need 10–12 mm glass: fine at 10 mm).

### Example 2: Serenity SER78, OW = 1200 mm, H = 2000 mm
- Door width = fixed width = 1200/2 + 22 = **622 mm**
- Fixed panel height = 2000 − 5 = **1995 mm**; door height = 2000 − 8 = **1992 mm**
- Header = 1200 − 25 = **1175 mm** (13 mm off each end)
- Check: 622 + 622 − 51 = 1193 = 1200 − 7 → about 3.5 mm at each wall (CRL's 1/8" each side, in inch units)
- Door weight = 0.622 × 1.992 × 25 = **31.0 kg** ≤ 40; 622 ≤ 762 → OK
- Header holes for fixed fittings: A = 76 + 3 = **79 mm** from the header end; B = 622 − 178 = **444 mm** spacing
- Wall bracket centres at 2000 − 76 = **1924 mm**; top of header at 2000 − 62 = 1938 mm
- Door holes: 4 × Ø16 at 89 mm from edges, 44 and 106 mm from the top; pull Ø47–50 at 64 mm from the edge, centred (996 mm from the bottom)
- Fixed panel holes: 2 × Ø12 at 89 mm from edges, 76 mm from the top
- L-seal DK98L cut to 1992 mm; set the stopper so the door closes about 6 mm off the wall

### Example 3: Matt's 90° corner rule (fixed front + fixed return, siliconed)
Front run 1200 mm (wall to the outside face of the return), return 900 mm (wall to the outside face of the front), both siliconed to the wall at 2 mm.
- Front panel (in front, longer) = 1200 − 2 (wall) = **1198 mm** (runs to the outside corner)
- Return panel (butting) = 900 − 2 (wall) − 10 (front glass) − 2 (joint) = **886 mm**

---

## 11. Open questions / NOT VERIFIED (confirm with CRL UK technical, or by test-fit)

1. **P990WS bottom gap**: 11 mm (CRL US SDT21 / AVDB3078) vs **8 mm** (CRL UK brochure 2017) vs 10 mm (Smart Glazier).
2. **PCR10 bulb seal gap**: 6 mm (US) vs 6–8 mm (UK) vs 8 mm (Smart Glazier).
3. **Geneva wall and glass-to-glass gaps**: CRL Europe 2025 says 8 mm (wall) / 4 mm (180° glass-to-glass); the CRL US guide uses a generic 5 mm. I recommend 8 / 4.
4. **Magnetic seals PMA10/PMB10/PMC10**: US 11 mm per piece (22 mm a pair) vs UK PMC10 17 mm; UK says to ask CRL for PMA/PMB.
5. **Bellagio BEL345 (135°), BEL354 (180° glass-to-wall), BEL382 (folding), BEL180S (180° wall clamp)**: no published gap found. Product pages say "Gap: Adjustable/Varies".
6. **BEL392 fixed-panel size**: the drawing gives the 8 mm / 3 mm door gap, but no centre-line add-on for the return panel. Use SDT21 +5 mm until CRL confirms.
7. **Pinnacle, Cologne and Vienna** product-specific gaps: none published. SDT21 generic values used. The Vienna "H"-plate (V1EH037) "tighter clearance" is not quantified.
8. **Support bar cut length**: CRL says "cut to size" only. No deduction formula published.
9. **Serenity SER90 return-panel size**: not published.
10. **Serenity 3 vs 6 mm**: resolved by interpretation (§8). Glass stays at OW/2 + 22. Ideally confirm with CRL.
11. **Smart Glazier account values that differ from CRL publications**: BEL90S 1 mm (CRL 2 mm); BELSDCD38 base/head/wall 7/8/8 (CRL deep channel 5/6/6); Door Base Gap 7 and Door Head Gap 5 (CRL 11 / 3); hinge offset 250 mm (CRL 203 mm). These may be deliberate account settings, so check with Matt.
12. **CRL UK 2021 brochure (DBN2021UK)** exists on crlaurence.co.uk, but the site blocks automated downloads, so it could not be checked. It may update the UK17 seal values in items 1–2.

---

## Appendix: values in the current Custom Showers website code (box copy of `src/lib/showerCalculations.ts`), for comparison

| Constant | Code value | CRL published | Comment |
|---|---|---|---|
| CHANNEL_VERTICAL_DEDUCTION_MM (per channel edge, top or bottom) | 10 | 5 (regular, either edge); 6 (deep top) | Code is about twice CRL's |
| CHANNEL_HORIZONTAL_DEDUCTION_MM (wall channel) | 5 | 5 regular / 6 deep | OK for regular; deep is 6 |
| CHANNEL_FLOOR_TO_CEILING_DEDUCTION_MM (per edge) | 12 | lift-and-drop: 11 (regular-bottom combo) or 12 (deep) at the top; bottom 5 (12 deep) | Partly matches |
| CLAMP_DEDUCTION_MM | 3 | 2 (BEL90S, BGC, SGC039), 3 (SGC50), 5 (SGC037, U-clamps) | Clamp-specific |
| CORNER_SHORT_PANEL_DEDUCTION_MM | 13 (2 + 10 + 1 channel) | Matt's rule 12 (t + 2); CRL t + 1.5 | Code adds 1 mm for channel |
| DOOR_BI_SWING_DEDUCTION_MM | 9 | Bellagio std 8 hinge + seal at strike 6 = 14 total; no-seal 3 + 5 = 8 | Single figure is not hinge-aware |
| DOOR_OUT_ONLY_DEDUCTION_MM | 5 | SDT21: 10 total (5 + 5) for wall to wall | Check what this covers |
| SUPPORT_PANEL_HEAD_DEDUCTION_MM | 4 | none published | — |
