# Sliding doors: the plan

Written 12 November 2026, before any of it was built. Matt asked for "sliding doors (Serenity)". CRL's Serenity is the only sliding system Custom Showers fits, so it is the only one SetOut will design.

Nothing here changes a hinged door, a fixed panel, a size SetOut already cuts or a golden. Sliding is new work beside the old, and it stays hidden until Matt has confirmed it.

## What was found

CRL's own installation sheets for Serenity are public, on CRL's document store, and give the whole glass fabrication: the cut sizes, every hole and where the header goes. Matt's catalogue (`data/crl/`) said they could not be reached; they can, from `azure.crlaurence.com/techdocs/`. They are saved in `docs/sliding/`, with a note of where each came from.

| Sheet | What it gives |
| --- | --- |
| 11M0347, Deluxe Serenity SER78 (CRL North America, 2023) | Cut-size formula, every hole in the door and the fixed panel, the gaps, the header's length and height, the parts list |
| AVDB3149, the same kit (CRL Europe, in German) | The same sizes and holes, in millimetres. This is the sheet Matt's catalogue names |
| AVDB3176, SER78 with the SER90 90° return kit | The same formula measured to the inside face of the return panel, and the one hole in the return panel |
| SRSER78, Senior Serenity for 12mm glass | Bigger roller holes and a different header. Not built yet |

So most of the sliding rules are CRL's, marked `[MANUFACTURER]`. What is left unconfirmed is whether Matt cuts to CRL's formula as printed, and the handful of things CRL leaves open or prints two ways.

## Which layouts

Two, both on the Deluxe kit (SER78) for 8 or 10mm glass.

1. **Sliding door** (`sliding-alcove`). One fixed panel and one sliding door, in line between two walls. The door slides behind or in front of the fixed panel and closes against the wall.
2. **Sliding door with a side panel** (`sliding-return`). The same across the front, with a fixed return panel at 90° on one side running back to the wall. The header runs from the wall to the return panel, held there by CRL's SER90 kit.

Not in this plan: the Senior kit for 12mm glass (SRSER78), the 95 inch kit with a second fixed panel (SER95), two sliding doors meeting at a corner (SERC2), a sliding door on a bath, and sliding glass to the ceiling.

## In the design document

The document's format stays at 1. One optional field is added to the design:

```ts
sliding?: { system: 'serenity' }
```

A sliding shower is still a chain of panels. The run with the door in it has two panels, one `fixed` and one `door`, joined straight; a return is a third `fixed` panel joined to that run at 90°. Which side the door closes on is where the door is in the chain, as it is for a hinged door. A sliding door has no hinges, so its panel's `door.hinge_side` and `door.swing` are kept only because the format needs them; nothing reads them.

Keeping the chain means the opening is measured exactly as it is today: the same runs, walls, floor and cards, with nothing new for the customer to do. The two panels' widths still add up to the measured run, so everything that keeps widths in step with the tape goes on working. Their split is not used: CRL's formula sets both widths from the whole opening.

An older engine reading a sliding design drops the field it does not know, and would cut it as a hinged door. That is one more reason sliding stays behind its setting until it is confirmed.

## How the sizes are worked out

`buildSpec` hands a design with `sliding` set to a new module, `sliding.ts`, and returns the same kind of spec, so quotes, sheets and emails need no second path. A design without `sliding` never reaches the new code.

The numbers live in SetOut's fixed rules, `FIXED_RULES.sliding.serenity`, each marked with where it came from. W is the overall width (wall to wall, or wall to the inside face of the return panel) and H the overall height, floor to the top of the glass.

| What | Rule | From |
| --- | --- | --- |
| Door and fixed panel width | W ÷ 2 + 22mm each | `[MANUFACTURER]` 11M0347 |
| Fixed panel height | H − 5mm | `[MANUFACTURER]` |
| Door height | H − 8mm | `[MANUFACTURER]` |
| Tops of the door and fixed panel | Level | `[MANUFACTURER]` |
| Gap at each wall | 3mm | `[MANUFACTURER]`, but see the questions: one drawing shows 6mm at the door |
| Overlap of door and fixed panel | 50mm: what the widths and the 3mm gaps leave. CRL calls it 2 inches (51mm) | `[MANUFACTURER]` |
| Door limits | 762mm wide, 40kg | `[MANUFACTURER]` |
| Header | W − 25mm long, centred; its centre 76mm below the top of the glass; 2m bar in the kit | `[MANUFACTURER]` |
| Header holes for the fixed panel | 6mm, in line with the panel's own holes | `[MANUFACTURER]` |
| An opening too wide for two equal panes (over 1,480mm) | The door is held at 762mm and the fixed panel takes the rest | `[UNCONFIRMED]` SetOut's own |
| W at a return | The front run less the return's glass thickness | `[UNCONFIRMED]` depends on where the corner is measured to |
| Return panel | Its run less 3mm at the wall, H − 5mm tall, running past the end of the front glass | `[UNCONFIRMED]` CRL gives its hole, not its size |
| Out of square openings | Every sliding pane is cut square, to the width at the floor, and the shower is marked for review | `[UNCONFIRMED]` |
| Channel under the fixed panel | Stops 19mm short of the panel's end, for the door guide | `[UNCONFIRMED]` CRL gives 19mm or 24mm, by how the guide is fitted |

A shower is refused (a blocking issue, as for a door too wide for any hinge) when the glass is not 8 or 10mm, the door would weigh over 40kg, the opening is too wide for the 2m header, the glass goes to the ceiling, or the layout is not one of the two above.

## Holes

All from CRL's sheets, measured as they print them, from the top of the glass and in from its edges.

| Pane | Holes | From |
| --- | --- | --- |
| Door | Four 16mm roller holes: 89mm in from each side, 44mm and 106mm down from the top | `[MANUFACTURER]` |
| Door | One hole for the through-glass pull, 64mm in from the closing edge, half way up | `[MANUFACTURER]` position, "suggested". Its size is 47 to 50mm; SetOut drills 50mm: `[UNCONFIRMED]` |
| Fixed panel | Two 12mm holes for the track holders: 89mm in from each side, 76mm down | `[MANUFACTURER]`. One sheet says 12mm, the others 13mm |
| Return panel | One 13mm hole for the SER90 fitting: 22mm in from the edge at the corner, 76mm down | `[MANUFACTURER]` |

`panesOf` puts each on its pane as a hole on a stated edge, as it does a handle hole, so the glass order draws them with no new drawing code. Each is named for its part and its sheet. No hinge notch, handle hole or knob hole is ever put on a sliding pane.

## Set-out and gaps

`shapesOf` gives a sliding pane its square rectangle. `setOutOf` stands the two front panes where they overlap, with the gap to each wall and to the floor, and says the door overlaps the fixed panel by 50mm in place of a gap between them.

## Parts

`fittingsOf` gives a sliding shower the Serenity kit in place of hinges, a handle and a door seal, and `crlPartOf` its CRL number in the shower's finish, looked up in Matt's catalogue as every other part is.

| Part | CRL number | Finishes in Matt's catalogue |
| --- | --- | --- |
| Deluxe Serenity 180° kit: 2m header bar, four rollers, stopper, two wall track holders, two fixed panel fittings, through-glass pull, door guide, L-seal | SER78 + finish | Polished stainless (PS), brushed stainless (BS), matte black (MBL), brushed bronze (BBRZ). Also AUSER78 in brushed brass (BB) |
| 90° return kit | SER90 + finish | PS, MBL. Also AUSER90 in BS, BB |
| U-channel or clamps for the fixed glass | As today (SDCD38) | Not in the kit |

Polished chrome hardware takes the polished stainless kit, as chrome takes brite anodised channel: `[UNCONFIRMED]`, in `crl.ts`. A finish CRL does not make the kit in is said so on the sheet, as for any other part. The spare parts (header SERH2, roller SERNR1, pull SERNHP2, wall track holder SERAHW2, fixed panel fitting SERFP2, door guide SERUG2, stopper SERNS1, L-seal DK98L) are listed in the kit's line, not ordered one by one.

## What people see

**Settings.** Each designer gets "Sliding doors (CRL Serenity)", off until an owner turns it on, with a line saying the sizes are CRL's own and not yet confirmed against a job. It is saved, versioned and logged like the glass and hinge settings.

**Designer.** With the setting on, the layout step shows the two sliding layouts after the standard ones, drawn without a door swing. The server refuses a sliding design sent to a designer with the setting off. Measuring is unchanged. The review step lists the sliding door's sizes and kit, with no hinge, handle or swing lines, and says the sizes are to be confirmed by the company.

**Workspace.** The job page, making sheet, glass order and installation sheet take the sliding panes from the same spec. Every sheet a sliding shower appears on says, at the top, that sliding door sizes are from CRL's Serenity sheets and are not yet confirmed: check them before glass is ordered. The installation sheet lists the kit with its CRL number, and the header's length, height and holes.

## What was built, and what was not

Built, behind the setting: everything above. Also a line on a quote for the kit (and the return kit), unpriced until the company prices one, and the sliding door's holes and side in the new-design email.

Not built yet:

- The Senior kit, 12mm glass.
- The plan and elevation drawings in the designer draw the sliding door as a pane with a round pull and no swing; they do not draw the header, the rollers or the lap. The installation sheet's elevation draws the panes where they lap.
- Cutting sliding glass to an out of square opening.
- Staff cannot turn a hinged shower into a sliding one in the workspace; they can change one that arrived sliding.

## Questions for Matt

1. Do you cut Serenity glass to CRL's formula as printed: each pane half the opening plus 22mm, the fixed panel 5mm short of the height and the door 8mm short?
2. What gap do you leave at the walls? CRL's formula and one drawing give 3mm each side; another drawing shows 6mm at the door's side for the L-seal.
3. How do you want a sliding shower measured? SetOut uses the opening as it is measured today (width at the floor, both walls, the floor's fall). The header sits about 76mm below the top of the glass: should the width be taken there too, and which do you cut to when they differ?
4. What do you do when the opening is out of square: walls that lean, or a floor that falls? SetOut cuts every sliding pane square and marks the shower for review.
5. What height do you make a sliding shower, and how much clear space do you need above the glass to lift the door on?
6. Over 1,480mm wide, two equal panes would make the door wider than CRL's 762mm. Do you keep the door at 762mm and widen the fixed panel, or something else? And is there a narrowest opening you would fit one in?
7. What size hole do you order for the pull (CRL says 47 to 50mm), and at what height? CRL suggests half way up the door.
8. Track holder holes in the fixed panel: 12mm or 13mm? CRL prints both for the same half inch hole.
9. With a return panel: where is the corner measured to, does the return run past the front glass as CRL draws it, and how wide do you cut it?
10. Is the fixed panel always in channel at the bottom, and does the bottom door guide cap the end of the panel (channel 19mm short) or sit under it (24mm short)? Do you put channel up the wall as well?
11. Is the fixed panel fitted outside the header, as CRL shows, or inside?
12. Which kit do you order for each of your finishes? Is polished stainless your chrome? CRL lists a brushed brass kit only under an Australian number (AUSER78BB): can you buy it?
13. Do you fit anything besides the kit's L-seal: a seal between the door and the fixed panel, or along the bottom of the door?
14. Do you fit the Senior kit on 12mm glass, the 95 inch kit, or a sliding door over a bath? None is built.
