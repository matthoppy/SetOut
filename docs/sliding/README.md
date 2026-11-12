# Serenity sliding door sheets

CRL's own installation and glass fabrication sheets for the Serenity sliding
system, saved here so the sizes SetOut uses can always be checked against the
maker's. Each kit also ships with its sheet in the box; where the two
disagree, the box wins and this folder and `FIXED_RULES.sliding` in
`packages/engine/src/ruleset.ts` are corrected to it.

Saved on 12 November 2026 from CRL's public document store, linked from its
list of installation instructions for frameless shower door hardware
(`https://azure.crlaurence.com/adv/manuals/fsd-hdwe.htm`).

| File | From | What SetOut takes from it |
| --- | --- | --- |
| `crl-11m0347-deluxe-serenity-ser78-install.pdf` | `azure.crlaurence.com/techdocs/PDF/11M0347.pdf` | Deluxe Serenity SER78, CRL North America, 2023. Page 4 is the glass fabrication: each pane half the overall width plus 22mm; fixed panel 5mm and door 8mm short of the overall height, tops level; four Ø16 roller holes in the door, 89 in from each side, 44 and 106 down; two Ø12 holes in the fixed panel, 89 in and 76 down; the pull's hole Ø47 to 50, 64 in from the edge and half way up. Page 3: 3mm gap at each wall, the door overlapping the fixed panel by 51mm. Page 6: header 25mm shorter than the opening, its centre 76mm below the top of the glass, Ø6 holes for the fixed panel's fittings |
| `crl-11m0347-page4-glass-fabrication.png` | The same, page 4 | The glass fabrication page, to look at |
| `crl-avdb3149-serenity-ser78-install-de.pdf` | `azure.crlaurence.com/techdocs/pdf/AVDB3149-SER78-Inst-Instr-de.pdf` | The same kit, CRL Europe, in German: the sheet Matt's catalogue names. The same sizes in mm. It gives the fixed panel's holes as Ø13 and the pull's as 46 to 50 |
| `crl-avdb3176-serenity-ser90-return.pdf` | `azure.crlaurence.com/techdocs/pdf/AVDB3176-serenity-SER90.pdf` | SER78 with the SER90 kit for a 90° return. Overall width is wall to the inside face of the return panel; the return panel takes one Ø13 hole, 22 in from its edge and 76 down; the two ways the corner may be made |
| `crl-avdb3176-page4-return-fabrication.png` | The same, page 4 | The return's fabrication page |
| `crl-srser78-senior-serenity-install.pdf` | `azure.crlaurence.com/techdocs/pdf/SRSER78.pdf` | Senior Serenity for 12mm glass. Not built: Ø27 roller holes, a 40mm header 42mm shorter than the opening |

## Where the sheets disagree

- The gap at the door's wall: 3mm on the formula and on page 3 of 11M0347,
  6mm ("for L-seal") on the drawing on page 4.
- The fixed panel's holes: Ø12 on 11M0347, Ø13 on the other two. Both are
  CRL's half inch.
- The overlap: 51mm (2 inches) as stated; the formula's widths with 3mm at
  each wall leave 50mm.
- The pull's hole: 47 to 50mm, 46 to 50mm, and 51mm on the older kit's page.

SetOut uses 3mm, Ø12, 50mm and Ø50, and lists each as a question for Matt in
`docs/sliding-plan.md`.
