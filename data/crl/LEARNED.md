# What SetOut takes from the CRL catalogue

Read from `crl_shower_catalogue.csv` (2,443 SKUs), its photos and drawings,
and CRL's two UK brochures (`source-pdfs/SDH17UKA.pdf`, `MBL18UK.pdf`), on
12 November 2026. Checked against what SetOut's engine already holds.

## Hinges: door limits

From the UK brochure, which gives them in millimetres, and the catalogue's
`capacity_notes`. SetOut chooses a hinge by these (`FIXED_RULES.hinges.kits`
in `packages/engine/src/ruleset.ts`).

| Hinge | Glass | Two hinges | Three hinges | SetOut |
| --- | --- | --- | --- | --- |
| Geneva (all) | 8–12mm | 36kg, 711mm | 54kg, 813mm | Same |
| Vienna 037, 180, 092, 045, 380 | 10–12mm | 50kg, 914mm | 63kg, 914mm | Holds the lower Vienna figures below |
| Vienna 044, 074, 544 | 10mm | 45kg, 864mm | 59kg, 864mm | Same, two hinges, 10mm only |
| Vienna 044, 074, 544 | 12mm | 45kg, 813mm | 59kg, 813mm | Not used: 12mm doors hang on Geneva, as on Smart Glazier |
| Bellagio (all) | 8–10mm | 50kg, 1,000mm | — | Same |
| Junior Geneva | 6–8mm | 28kg, 711mm | 42kg, 813mm | Not used |
| Melbourne | 8–12mm | 45kg, 762mm | 54kg, 864mm | Not used |
| Victoria | 10–12mm | 64kg, 1,000mm | — | Not used |

SetOut does not choose a hinge's back plate, so it holds every Vienna to the
offset plate's lower limit. Allowing Vienna on 12mm glass, or three Vienna
hinges, is Matt's call: it would change which hinges some doors get.

## Hinges: cut-outs

CRL prints no cut-out sizes on its offer pages or in the UK brochures: "use
only the template included with this hinge". The sizes SetOut uses come from
CRL's North American fabrication drawings (`docs/hinge-templates/`): Geneva
and Vienna. **Bellagio has none anywhere in this data**; it stays on SetOut's
own notch, flagged on every glass order, until the template from the box is
photographed. The "fabrication" pictures for Bellagio in `fabrication/` are
exploded product views, not templates.

Only the 90° glass-to-glass hinges (GEN092, V1E092) take two holes in the
fixed panel, with a cut-out in the door; every other Geneva and Vienna takes a
cut-out, in both panes when it is glass to glass in line. SetOut had the
in-line Geneva panel drilled with two holes; it now has the cut-out. Geneva
needs the GEN13 gasket pack on 8mm glass.

## Codes

A CRL catalogue number is the series and a finish code: `GEN092` + `MBL` is a
matte black Geneva 90° glass-to-glass hinge.

| Hinge, as SetOut names its mount | Geneva | Vienna | Bellagio |
| --- | --- | --- | --- |
| Wall to glass | GEN037 full back, GEN044 offset, GEN074 short | V1E037, V1E044, V1E074 | BEL344 (90°), BEL354 (180°) |
| Glass to glass, 180° | GEN180 | V1E180 | BEL380 |
| Glass to glass, 90° | GEN092 | V1E092 | BEL392 |
| Glass to glass, 135° | GEN045 | V1E045 | BEL345 |

| Finish code | Finish |
| --- | --- |
| CH | Polished chrome |
| BN | Brushed nickel |
| MBL | Matte black |
| PN | Polished nickel |
| SN | Satin nickel |
| SC | Satin chrome |
| BR | Polished brass |
| SB | Satin brass |
| BBRZ | Brushed bronze |
| 0RB | Oil rubbed bronze |
| GM, BGM | Gun metal |
| BAB | Brushed antique brass (Bellagio) |
| GP | Gold plated |

## Seals for 10mm glass

| What SetOut calls it | CRL | Length |
| --- | --- | --- |
| 90° stopper seal | PC1090: polycarbonate U with 90° vinyl fin seal | 95" (2.41m) |
| Bubble seal (door swinging both ways) | PCR10: translucent vinyl bulb seal | 95" |
| Bottom wipe with drip rail | P990WS (clear), P990WSBL, P990WSW | 95" |
| Glass-to-glass 180° seal | P10MMHJ / P380HJ: polycarbonate H-jamb | — |
| Magnetic glass-to-glass | PMA10, PMB10 (45°), PMC10 (90°) | 2m |
| Strike side seal | PCJ10: 90° strike side seal for 10mm | — |

## U-channel

Regular U-channel for 3/8" (10mm) glass is SDCR38.. in 95" (2.41m) lengths;
deep U-channel (19mm high, for the top when the glass is lowered into the
bottom channel) is SDCD38.. in 95" and 144" (3.66m) lengths, with end caps
SDCEC38... A channel cut list would cut from 2.41m lengths.

## Handles and knobs

Back-to-back pulls come in 6" (152mm) and 8" (203mm) centres, each through a
12mm hole (some larger ladder pulls 16mm). Knobs take one 12mm hole; the 180°
knob latch 22mm. SetOut's pull handle (203mm, Ø12) and knob (Ø12) agree.

## Clamps and support bars

Traditional hole-in-glass clamps need a 19mm hole (some 16 to 19mm); square
clamps and U-clamps need a notch; no-drill clamps for 10mm glass (SGCND..)
need none. SetOut's own clamp hole (Ø16, 25mm in) is not drawn on any pane
yet. Support bars come 39" (991mm), 51" (1,295mm) and 80" for 10 to 12mm
glass, wall to glass and glass to glass, and as a 1,200mm round 12mm set.

## Serenity sliding (the only sliding system Custom Showers fits)

Deluxe SER78: 8 to 10mm glass, door at most 762mm wide or 40kg; holes in the
door and the fixed panel; a 46 to 50mm hole for the through-glass pull.
Senior SRSER78 is 12mm only. SetOut does not design sliding doors yet.

## Not in the data

- Trade prices: only after signing in to the Smart Glazier account.
- Bellagio cut-out sizes: only on the template in the box.
- Serenity roller and track-holder hole sizes: on CRL's install sheet AVDB3149.
