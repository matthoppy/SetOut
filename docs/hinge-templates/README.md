# Hinge templates

CRL's own glass fabrication drawings for the hinges SetOut cuts glass for,
saved here so the sizes SetOut uses can always be checked against the maker's
drawing. Each hinge also ships with a paper template in its box; where the two
disagree, the box wins and this folder and `FIXED_RULES.hinges.cutouts` in
`packages/engine/src/ruleset.ts` are corrected to it.

The PDFs were saved on 11 November 2026 from CRL's public document store. The
PNGs, CRL's sheets for the hinges Custom Showers sold, came from Custom
Showers' own website on 12 November 2026.

Each range has its own cut-out: Vienna's is bigger than Geneva's.

| File | Hinge | What SetOut takes from it |
| --- | --- | --- |
| `crl-gen037-geneva-wall-mount.pdf` | Geneva wall mount, full back plate (GEN037) | The Geneva door notch, in CRL's own mm: 63 high, 44 deep, with two Ø16 relief holes ("mouse ears") 57 apart and 38 in from the glass edge |
| `crl-gen044-geneva-wall-offset.png` | Geneva wall mount, offset back plate (GEN044) | The same Geneva notch |
| `crl-gen544-geneva-wall-offset-5deg.png` | Geneva wall mount, offset back plate, 5° pre-set (GEN544) | The same Geneva notch |
| `crl-gen180-geneva-180-glass-to-glass.pdf` | Geneva 180° glass to glass (GEN180) | The same notch, in the door and in the panel it hangs from: the hinge is the same either side |
| `crl-gen092-geneva-90-glass-to-glass.pdf` | Geneva 90° glass to glass, the corner hinge (GEN092) | The front of the sheet only: a cut-out in the door and two holes in the fixed panel. SetOut uses the Geneva door notch, and two Ø16 holes 37mm in and 57 apart in the panel, as Custom Showers' Geneva 90° orders have them |
| `crl-v1e037-vienna-wall-mount.pdf` | Vienna wall mount, full back plate (V1E037) | The Vienna door notch, from inches to the nearest mm: 76 high, 46 deep, with Ø16 ears 70 apart and 40 in |
| `crl-v1e044-vienna-wall-offset.png` | Vienna wall mount, offset back plate (V1E044) | The same Vienna notch ("mouse-ear cut-out option"), and CRL's other option: rectangular, 76 by 46 with a 12mm hole at each inner corner. Rectangular means taking two screws out of the hinge; mouse ears mean two more holes to drill (Matt). A company chooses its standard in Settings, Hinges; staff can choose the other for a shower |
| `crl-europe-bel344-bellagio-wall.png` | Bellagio 90° glass to wall (BEL344), CRL Europe | Fitted with seals (8mm gap): the door notch 58 high, 47 deep, 6mm inner corners. Fitted without seals (3mm gap) the door's notch is stepped: 58 by 52 deep inside a 6mm rebate 84 high |
| `crl-europe-bel380-bellagio-180.png` | Bellagio 180° glass to glass (BEL380), CRL Europe | The same door notch, and the panel's: 52 high, 33 deep, 6mm inner corners, with or without seals |
| `crl-europe-bel392-bellagio-90.png` | Bellagio 90° glass to glass, the corner hinge (BEL392), CRL Europe | The same door notch, and two Ø16 holes in the panel, 33 in and 50 apart, with or without seals |
| `crl-bel344-bellagio-wall-mount-offset.pdf` | Bellagio wall mount (BEL344), CRL North America | The same door notch as CRL Europe's with seals: 58 high, 47 deep, 6mm corners |

## Which hinges are checked

A hinge's cut-out is checked when CRL's drawing of that hinge is here: Geneva's
full and offset back plates, its offset 5° pre-set, its 180° and 90° hinges;
Vienna's full and offset back plates; and the three Bellagio hinges, fitted
with seals. Every other style (short back plate, the full-plate 5° pre-set,
the adjustables, the H plate, positive close, Vienna in line) is cut to its
range's cut-out but named for itself on the glass order and marked to check
against the template in its box, until its drawing is here.

## Still needed

- Bellagio: whether Custom Showers fits it with seals or without. SetOut
  cuts the door to the with-seals notch and says so on the glass order.
- The back of the Geneva 90° sheet, to confirm the door notch and the
  spacing of the panel's holes.
- Vienna 180° and 90° glass to glass, and the styles listed above.
