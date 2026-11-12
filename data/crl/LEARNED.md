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
only the template included with this hinge", and this data has none. The
sizes SetOut uses come from CRL's own drawings in `docs/hinge-templates/`:
Geneva and Vienna from CRL North America, Bellagio from CRL Europe (found on
Custom Showers' own website, 12 November 2026). Each range has its own:
Vienna's (76 by 46) is bigger than Geneva's (63 by 44). Vienna can be cut with
mouse ears or rectangular; Bellagio's door notch depends on whether it is
fitted with seals (usual) or without (often a bigger shower). A style whose own drawing is not there yet is marked on
the glass order to check against the template in its box. The "fabrication"
pictures in `fabrication/` are product photos and exploded views, not
templates.

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

## What SetOut names on the installation sheet

Each fitting gets its CRL number (`packages/engine/src/crl.ts`), looked up in
every catalogue number from this folder (`crl-catalogue.ts`, written by
`scripts/crl-catalogue.mjs`):

| Fitting | Number | Why |
| --- | --- | --- |
| Hinges to the wall | The style chosen + finish: offset GEN044/V1E044, full GEN037/V1E037, short GEN074/V1E074, 5° pre-set GEN544/V1E544 and GEN537/V1E537, adjustable GEN344/V1E344 and GEN337/V1E337, H plate GENH037/V1EH037, positive close V1E067. Bellagio BEL344 | The company's standard (offset until chosen), or the shower's own |
| Hinges glass to glass, in line | Standard GEN180/V1E180, adjustable GEN380/V1E380, positive close V1E780. Bellagio BEL380 | As above |
| Hinges glass to glass, at a corner | GEN092, V1E092, BEL392 + finish | One per range |
| Bubble seal | PCR8, PCR10, PCR12 | By glass thickness; clear, so no finish |
| 90° stopper seal | PC0890, PC1090 | None for 12mm yet. Matt to confirm it is the seal he fits |
| U-channel | SDCD38 (10mm), SDCD12 (12mm) + finish | Deep U-channel in 2.41m lengths, as Custom Showers' own site listed it. Chrome hardware takes brite anodised (BA) channel |
| Handle | The company's number for it + finish | Set in Settings; nothing until then |
| Clamps, support bar or panel | — | SetOut does not choose the model |

Finishes CRL does not make a part in are common: of Custom Showers' 14
finishes, a Geneva 90° hinge comes in only seven (chrome, brushed nickel,
matte black, polished and satin brass, antique brass, oil rubbed bronze),
and a Bellagio in none of oil rubbed bronze, polished or satin nickel, satin
chrome or unlacquered brass. "Brushed gold" has no CRL code at all. The sheet
says so beside the part.

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
Senior SRSER78 is 12mm only.

SetOut designs the Deluxe kit, behind a setting that is off until Matt has
confirmed it (`packages/engine/src/sliding.ts`, `docs/sliding-plan.md`). The
cut sizes and every hole come from CRL's installation sheets, which are public
on CRL's document store and saved in `docs/sliding/`: each pane half the
opening plus 22mm, the fixed panel 5mm and the door 8mm short of the height,
four Ø16 roller holes and the pull's hole in the door, two Ø12 holes in the
fixed panel, one Ø13 hole in a return panel. The kit is SER78 + finish (PS, BS,
MBL, BBRZ; brushed brass only as AUSER78BB) and the return kit SER90 + finish
(PS, MBL; BS and BB only as AUSER90). PCSER78 is a clear polycarbonate U with a
31mm fin for 10mm glass, which SetOut does not use yet.

## Not in the data

- Trade prices: only after signing in to the Smart Glazier account.
- Bellagio cut-out sizes: only on the template in the box.
- Serenity roller and track-holder hole sizes are not in the catalogue, but
  are on CRL's install sheets, now saved in `docs/sliding/`.
