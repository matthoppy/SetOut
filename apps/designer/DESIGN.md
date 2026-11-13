---
name: SetOut measuring pictures
description: The measuring cards' pictures, drawn as one technical line illustration of the customer's own shower on its tray, in which only the act of measuring has colour.
colors:
  ink: "hsl(210 50% 23%)"
  ink-text: "#ffffff"
  laser: "#ef1d45"
  laser-hot: "#ffd9e0"
  tape: "#f7c52b"
  tape-edge: "#8a6a06"
  tape-ink: "#2a2a2a"
  paper: "#ffffff"
  backdrop: "#fbfbfb"
  backdrop-dark-page: "#e6e4e0"
  line: "#30363c"
  line-soft: "#c9ced3"
  floor: "#f3f4f5"
  floor-joint: "#d6dade"
  wall-lit: "#ffffff"
  wall-shade: "#eef0f2"
  wall-end: "#e1e4e7"
  cut: "#d3d8dc"
  ceiling: "#f4f5f6"
  tray: "#ffffff"
  tray-lit: "#f1f3f4"
  tray-shade: "#e1e4e7"
  tray-dish: "#fafbfb"
  glass: "#c4d9e4"
  glass-glint: "#9fb6c3"
  glass-edge: "#47545e"
  glass-top: "#a9c0cc"
  metal: "#dde1e4"
  metal-dark: "#6b737c"
  shadow: "#4a5159"
  mask: "#93c3ec"
  mask-edge: "#3f7fbd"
  vial: "#cfe8b4"
  vial-edge: "#5f7f3f"
  pencil: "#1e2227"
typography:
  value:
    fontFamily: "Open Sans, system-ui, sans-serif"
    fontSize: "16.5px"
    fontWeight: 700
    fontFeature: '"tnum"'
  value-unit:
    fontFamily: "Open Sans, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
  note:
    fontFamily: "Open Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
rounded:
  note: "7px"
  panel: "14px"
  pill: "15px"
spacing:
  label-clear: "6px"
  label-inset: "8px"
  frame-inset: "14px"
components:
  value-pill:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-text}"
    typography: "{typography.value}"
    rounded: "{rounded.pill}"
    height: "30px"
  note:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.note}"
    rounded: "{rounded.note}"
    height: "26px"
  start-point:
    backgroundColor: "{colors.ink}"
    size: "8.4px"
  read-point:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.laser}"
    size: "16px"
  dark-page-panel:
    backgroundColor: "{colors.backdrop-dark-page}"
    rounded: "{rounded.panel}"
---

# Design System: SetOut measuring pictures

> **Scope.** This file records one world only: the isometric measuring pictures on the designer's measuring cards, for every shower drawn in the room: on its tray, or a screen on the rim of a bath (`src/designer/measure/visuals/iso/`, with its tokens in `src/index.css` under `.mw-iso`). The single door and the bath screen joined on 13 November 2026. The rest of the designer UI (buttons, cards, inputs, the card titles and number box around the picture) is a separate, existing system and is **not** documented here. A shape built by hand that the room cannot show keeps the older face-on pictures, which are out of scope.

All sizes below are given in the unit they are built in. **Room sizes are millimetres in the room** (the picture is not to scale, but every shower of a shape is drawn the same size). **Strokes, marks and type are screen pixels**: every stroke in the picture carries `vector-effect: non-scaling-stroke`, and every mark and label is sized through the stage's `px()` conversion, so a picture shows the same weight of line and size of type however much of the room it frames.

## Overview

**Creative North Star: "The Architect's Set-Out Sheet"**

Each card is a page from one architect's drawing set: the customer's own shower standing on its tray in the corner of a pale bathroom, seen from one fixed isometric angle, with every edge a fine dark line and every surface a flat plane of white or light grey. Nothing in the room carries colour. Colour belongs only to the act of measuring: the laser's red light, the tape's yellow blade, and the navy of the dimension, the points and the number.

The pictures are calm and dense with information in one place only. The room is drawn once per shower shape and never moves while a number is typed; each card comes in close enough to its own reading to read it, and no closer, and keeps the whole tray in view so the customer knows which side and which end they are on, except a reading at a wall, which comes in close on that end of the glass (Matt, 12 November 2026). Where a reading is too small to see across the room (a 50mm gap, a 10mm line), a magnifying lens shows it close up, with the glass cut away.

The world replaces flat, face-on CAD drawings with grey slabs and dashed lines; it does not go back to them.

**Key Characteristics:**

- One camera for the whole deck: 33° turn, 33° rise, one light over the eye's left shoulder.
- Flat planes, fine dark outlines, two room line weights (1.05px and 0.6px).
- Three meaning colours only: laser red (light), tape yellow (the tool), measuring navy (what to measure).
- A draughtsman's dimension with filled arrows and a large navy number pill is the loudest mark on every card.
- Small readings go in a lens whose close-up is a cutaway without glass.
- The room stays light on a dark page, on its own light panel.

## Colors

A near-colourless architectural room in white and cool light greys, with three saturated meaning colours reserved for the measuring.

### Primary

- **Measuring Navy** (`ink`): the dimension line, its extension lines and arrowheads, the start point, the read point when no laser is involved, the value pill, note text, leaders and the lens rim. It is the measuring accent of the product (`--measure-accent`), resolved inside the picture so it stays navy on every theme.
- **Pill White** (`ink-text`): the number and its "mm" on the navy pill, and nowhere else.

### Secondary

- **Laser Red** (`laser`): the laser's light only: beams on floor, walls and blade, the glowing window on the laser, the soft pool, and the read point where the laser lights the blade. Red is light, never an edge.
- **Laser Core** (`laser-hot`): the hot pale centre line inside a full-strength beam and the bright dot of the laser's window.

### Tertiary

- **Tape Yellow** (`tape`): the tape measure's blade, and the side faces of its case (lit through a ramp of `hsl(45 94% 38–58%)`).
- **Tape Edge** (`tape-edge`) and **Tick Black** (`tape-ink`): the blade's outline and its ticks.

### Neutral

- **Paper** (`paper`): halos under marks, the lens disc, the note background, the lens leader's under-stroke.
- **Studio Ground** (`backdrop`): the soft radial ground behind the room on a light page; **Warm Panel** (`backdrop-dark-page`): the ground and panel on a dark page.
- **Graphite Line** (`line`): every outline in the room. **Soft Line** (`line-soft`): the tray's dish.
- **Room planes**: `floor` with `floor-joint` tiles; `wall-lit`, `wall-shade`, `wall-end`, `cut` (the section through a wall or slab, the darkest plane); `ceiling`; `tray`, `tray-lit`, `tray-shade`, `tray-dish`.
- **Glass**: `glass` (a 50% to 36% diagonal gradient), `glass-glint` reflection lines, `glass-edge` outlines, `glass-top` for the thickness along the top edge.
- **Hardware**: `metal` and `metal-dark` for hinges, handles, channels, rail and the waste.
- **Shadow** (`shadow`): every soft shadow and wall-foot shade, always at low opacity.
- **Masking Tape Blue** (`mask`, `mask-edge`) with **Pencil** (`pencil`): the decorator's tape the glass lines are drawn on. This is a material colour, the colour of real painter's tape, not a meaning colour.
- **Vial Green** (`vial`, `vial-edge`): a spirit level's bubble window, the one green on the page, as every level has it. A material colour too.
- **Tool graphite** (built as computed paint, not a token): laser body and tripod in `hsl(216 11% 11–36%)` by light; the laser's window band in `hsl(352 32% 14–28%)`; the tape hook `hsl(216 10% 34%)`.

### Named Rules

**The Three Meanings Rule.** Red is the laser's light, yellow is the tape, navy is what to measure. Each means one thing on every card, and nothing in the room is drawn in any of them.

**The Light Is Not An Edge Rule.** A laser line is always drawn as light: an 8px halo at 16% opacity, a 2.2px red line, and a 0.7px pale core at 85%. Where it runs on past what matters it fades out along its length; a secondary line is drawn at 45% opacity. A beam is never a single hard stroke.

**The Material Blue Rule.** The masking tape keeps its real light blue; it is a material, so it may sit in the room. It must never be used for a measuring mark, and navy must never be used on the room.

## Typography

**Body Font:** Open Sans (with system-ui, sans-serif), inherited from the page; the picture sets no family of its own.

**Character:** Plain, sturdy and numeric. Type appears in two places only, the number and the note, both set in screen pixels so they read the same at every framing.

### Hierarchy

- **Value** (700, 16.5px, tabular figures): the number being asked for, white on the navy pill. A question mark until the customer types it.
- **Value unit** (600, 12.5px, 75% opacity, 3px after the number): the "mm" that follows it.
- **Note** (600, 13px, centred): a few words naming a thing on the picture ("Over the corner mark", "Top of the glass") or captioning a lens ("10mm in from the edge").

### Named Rules

**The Number Is The Hero Rule.** The value pill is the largest type on the picture and the only bold type. Nothing else on a card may be set larger or heavier.

## Layout

**The camera.** One isometric eye for the whole deck: the front of the shower turned 33° from the page, the eye risen 33° above the room. The view is mirrored (front left or front right) only so that the wall that matters faces the eye; it is chosen once per shower shape, from the plan, and never per card. Light comes from above the eye's left shoulder (lamp direction −0.55, −0.35, 0.76); a face's light is `0.5 + 0.5 × (normal · lamp)`, clamped 0 to 1.

**The room, in millimetres.** Tray 45 high, its lip running 100 past each glass line; a bath's rim 520 high and 700 from its front to the wall, its rim 160 wide at the front (for the glass line and the tape outside it), 90 at its ends and 80 at the back, its basin 380 deep and seen over the rim, running on 700 past the end of its screen; glass 2000 high (2440 to a ceiling), drawn 14 thick; walls 2240 high and 110 thick; floor apron 860 in front; floor tiles 600. A front is drawn 1000 long with one pane, 1300 with two, 1500 with three or more; depth 950; a walk-in's way in 700; 470 of room past a side with no wall. A door is drawn 1.3 times the width of a fixed panel. The tape blade is 46 wide, laid 74 outside the glass line; masking tape 230 × 78 (half as long again at a corner); the laser's lines come out 160 above where it stands, or 1000 on its tripod; the up-and-down line stands 50 off a wall.

**Not to scale, and still.** The plan depends only on the shower's shape (runs, panes, to-ceiling, sliding), never on the customer's numbers, so the picture does not move while a number is typed and never suggests what the answer should be.

**The single door's laser.** On its tripod in front of the shower, 520 out from the glass line on the line through the middle of the opening, for every card of the deck, as its cards say: the readings to the walls cross the up-and-down line in the middle, at the floor and at the top (along a piece of the ceiling where the door goes up to it), and the readings at the floor and the ceiling are read at the level line. Each card draws only the line it is read at.

**Framing.** The SVG fills the space the card gives it and keeps the room's angle at any aspect. A card with nothing particular to show (marking out, setting up the laser over a corner) frames the whole room. A reading card frames **the reading plus the whole tray**: the measurement's points and its dimension, the four corners of the tray top, and two tray corners raised to 900mm, grown by 200mm. A reading at a wall (the 50mm gap at the floor or the top) instead frames **that end of the glass**: the tape, the laser where it stands, the wall end up to the reading and 650mm of the glass line, grown by 150mm. The frame is widened to the space's shape about its centre, never comes closer than **0.27 screen px per mm**, never becomes wider than the whole room, and slides back over the room where it would hang off an edge.

**The edge fade.** The room is masked by a blurred rectangle inset 14px from the frame (blur 9px), so the drawing fades softly into the card rather than being cropped hard. The floor also fades radially (fully drawn to 55%, gone by 98%) at the front and the open sides.

**Draw order.** Floor, wall-foot shade, walls, tray, things lying on the floor (masking tape, floor beams), then each run of glass from the farthest, with whatever stands behind a pane drawn before it and whatever stands in front after it; a near side wall last at 28% opacity so the shower shows through. Then the lens, then the measuring marks over everything.

**Labels stay in the frame.** Every pill and note is held 8px inside the frame; a pill inside a lens is pulled in until its far corner is inside the lens.

## Elevation & Depth

Depth comes from flat tonal planes under one light, not from shading gradients or outlines of different darkness. Shadows are soft and contact-only, drawn in `shadow` at low strength: no hard or offset shadow appears anywhere in the world.

**Which face gets which tone.**

- Floor: `floor`, with `floor-joint` tile lines.
- Back wall (turned from the light): `wall-shade`. A side wall facing the eye (turned to the light): `wall-lit`. A wall's cut end where the room stops: `wall-end`.
- The cut through the top of every wall, and the ceiling slab's cut edge: `cut`, the darkest plane, as an architect's section is.
- Ceiling, cut back 300mm from the back wall: `ceiling`.
- Tray: top `tray`; front face `tray-shade`; the open side face toward the eye `tray-lit`; the shallow dish inset 55mm `tray-dish` with a fine soft line.
- Tools (laser, tripod head, tape case) are boxes whose visible faces are painted by the room's light from a graphite ramp; the laser's top always reads as its lightest face.

### Shadow Vocabulary

- **Tray shadow** (blur 34 room units, opacity 0.18): under the tray's foot, 50mm proud at the front and 30mm at the sides.
- **Contact shadow** (blur 12 room units, opacity 0.2; 0.16 under a tripod and 0.22 under each foot): under anything standing on the floor.
- **Wall-foot shade** (linear, 8% to 0 over 260mm): along the foot of each wall.
- **Lift** (drop shadow 0 1.5px, blur 2.2px, `#0f172a` at 22%): under the value pill and the lens disc only, to lift them off the drawing.

### Named Rules

**The One Light Rule.** Every face is toned by the same lamp over the eye's left shoulder. Never light a single object from its own direction to make it read.

**The Contact-Only Shadow Rule.** Shadows sit under things that stand on the floor and nowhere else, except the 1.5px lift under the pill and the lens.

## Shapes

Hard-edged architecture with rounded joins: polygons join with round line joins and lines end with round caps, except hardware (channel, rail, tripod column), which ends square.

**Line weights, in screen pixels.**

- **Outline (1.05px)**: every room edge: walls, cuts, tray, ceiling, glass verticals and top edge, door handles' outline.
- **Fine (0.6px)**: lines inside an object: floor joints, the tray dish, the waste, the glass's base line and top face, hinge plates, a glint.
- **Tool edge (0.8px)**: the edges of the laser, tripod head, tape case and hook, and the masking tape's edge. **Blade edge and glints (0.9px)**: the tape blade's outline, two of the three glass glints, the tape's even ticks (odd ticks 0.6px).
- **Pencil (2px on floor tape, 1.6px on wall tape)**: the line drawn on masking tape.
- **Hardware** is a dark stroke under a metal stroke: handle 3.2 + 1.4, channel 2.8 + 1.2, sliding rail 4 + 2, tripod legs 2.4 + 0.6 highlight, column 3.4 + 0.8.

**Glass.** Pale, with exactly three thin reflection lines leaning the same way on every pane (at 12–30%, 19–37% and 60–72% along it), edges in `glass-edge`, and a thin top face showing its thickness.

**Corners.** The value pill is fully round (radius half its 30px height); notes are rounded 7px; the dark-page panel 14px. The lens is a circle.

## Components

### Laser beam

Light, not an edge. Three strokes (8px halo at 16%, 2.2px red, 0.7px pale core at 85%), round caps. A line that runs on past what matters fades along its length (full to 60%, 70% at 60%, gone at the end); a secondary line shows at 45%. On the floor it is lifted 1mm above the surface it lies on.

### Laser and tripod

A graphite box 105mm square and 210mm tall on a contact shadow, a dark red window band 44mm deep where the lines leave it (160mm up), a 46mm knob on top, and a glowing window: a 26-unit red pool at 25% under a 10-unit `laser-hot` dot, steady. On a tripod: three legs at 120° spread 280mm, a column wound up so the lines leave at 1000mm.

### Tape measure

A yellow blade 46mm wide lying with its face to the surface it is held against, ticks every 50mm (30% of the blade's width, 50% every 100mm, 90% every 500mm), a hook bent square at the start, and a 110mm case beyond the end, yellow on its sides and graphite on its ends. Where the laser lights the blade, a short red beam crosses it.

### Spirit level

For measuring with a tape and a level (staging only until Matt signs the cards off). 1200 long, 62 deep and 26 thick, lit aluminium with its two ends dark, its bubble window (96 × 34, a 24 × 16 bubble in it) in the middle of the side turned to the eye. It lies along the glass line just outside the glass, or stands upright on the mark against the wall. It is drawn 24mm off what it rests against at both ends, not to scale, so the picture shows where the gap is measured without saying which end touches; the card's words say that the end that touches reads 0. The gap is read in a lens, close enough that the start and the read point stand apart, with the surface or the face of the wall drawn firm (2.2px) because the room's own line is too faint there, and the number under the lens.

### Measuring marks

How a measurement is marked, the same on every card:

- **Start point** (where the tape starts): a solid navy dot of radius 4.2px on a white halo of radius 7px at 95%.
- **Read point** (where the number is read): a white disc of radius 8px with a 2.4px ring, a 3.2px centre dot, and a pulse of radius 14px at 18% behind it. Red where the laser lights the blade, navy otherwise.
- **Dimension**: a 1.5px navy line drawn beside the measurement, offset from it in the room (300mm for a width along the floor, 280mm across the tray, 230mm for a height to a line or the ceiling, 220mm for the glass height; tighter inside a lens), with a filled navy arrowhead at each end (9.5px long, 7.6px across), and two extension lines (1px at 70%) running from 15% to 120% of the offset at each end point.
- **Value pill**: navy, 30px tall, as wide as its text (16 + 9.8 per character + 27px), lifted, with the number and its unit. A question mark until the number is typed.

**Where the pill goes.** On the dimension line when the line is at least the pill's width plus 34px long, trying the middle first, then 36%, 64%, 24%, 76% along. Otherwise beside the line, stepped out at 1, 1.6 and 2.3 times its reach on the far side from what was measured, then the near side, each slid 0 or ±30% along, joined to the line's middle by a 1.2px navy leader. The first spot that clashes with nothing wins: it must stay 6px inside the frame (and inside a lens), keep a 32px square clear around both end points, and keep clear of the laser and anything named to avoid. Failing that, the spot where least is covered.

### Note

White, 26px tall, as wide as its words (7px per character + 20px), rounded 7px, with a hairline navy border at 22%, 13px navy semibold text centred. When it names a thing, a 1.1px navy leader runs to a 2.8px navy dot on it.

### Lens

Used only when a reading is too small to read across the room: the 10mm in from the tray edge on the marking card (zoom 3.6, captioned), the 50mm wall gap at the floor or top (zoomed until the 50mm spans the lens's radius, the lens drawn 18% larger), where the laser's line crosses the blade right beside the laser on a corner width (zoom 2.8), and a reading up to the level line whose span is under 80px on screen (zoomed until both ends span most of the lens, between 2 and 7 times). In the small-reading cases the dimension, start point and read point are drawn inside the lens instead of across the room, and the number sits 22px under the lens.

- **Size and place**: radius the smaller of 25% of the frame's width and 21% of its height, 14px in from the frame, in a corner: the top corners first, the side away from the target first, skipping a corner within its radius plus 34px of the target or within its radius plus 4px of anything to keep clear of. 46px is kept below for the number or caption.
- **Drawing**: a white disc with the lift shadow, a 1.6px navy rim, a 1.4px navy leader on a 4px white under-stroke from the rim to a 13px navy ring (1.6px, also on white) around the point it magnifies.
- **Cutaway**: the close-up is the same room re-rendered **without its glass**, so a reading taken behind a pane is as clear as one in front of it. The room outside the lens keeps its glass.

### Light and dark

- **Light page**: no panel. A radial studio ground of `backdrop`, centred a little below the middle, solid to 72% (at 85%) and fading out by its edge, so the room floats on the card.
- **Dark page**: the room does not invert. It sits on its own clean light panel of `backdrop-dark-page`, rounded 14px, filling the frame; the measuring navy stays navy (the page's lighter dark-theme accent is not used in the picture), and every room tone is unchanged.

### Motion

One gentle loop, stopped under `prefers-reduced-motion: reduce`: the read point's pulse (opacity 0.1 to 0.3, scale 0.85 to 1.15, 1.8s ease-in-out), so the eye goes to where the number is read. Nothing else moves. The resting picture is complete without it.

## Do's and Don'ts

### Do:

- **Do** draw every picture in a deck from the one camera (33° turn, 33° rise, mirrored only by the shower's shape) and the one lamp over the eye's left shoulder.
- **Do** frame a reading on the reading and the whole tray, grown 200mm, and never closer than 0.27px per mm; a reading at a wall on that end of the glass, its laser and 650mm of the glass line, grown 150mm.
- **Do** size every stroke, mark and label in screen pixels: 1.05px outlines, 0.6px fine lines inside objects, 1.5px dimension lines.
- **Do** tone faces flat by the light: lit side walls white, the back wall `wall-shade`, cuts through walls `cut`, the tray front `tray-shade`.
- **Do** mark every measurement the same way: navy start dot, read ring (red when the laser lights the blade), arrowed dimension, navy number pill on the line or beside it with a leader.
- **Do** use a lens only for a reading too small to see across the room, and draw its close-up as a cutaway without glass.
- **Do** keep the room light on a dark page, on its own 14px-rounded warm panel, with the marks still navy.
- **Do** describe every picture in one sentence for screen readers.

### Don't:

- **Don't** draw anything in the room in laser red, tape yellow or measuring navy.
- **Don't** draw a laser line as a single hard stroke; it is always light, with a halo and a core.
- **Don't** scale the room to the customer's numbers or move it while a number is typed.
- **Don't** change the camera, the light or the mirroring from card to card within a deck.
- **Don't** add hard or offset shadows; shadows are soft and sit under things standing on the floor.
- **Don't** set any type larger or heavier than the value pill.
- **Don't** draw glass inside a lens.
- **Don't** return to face-on CAD drawings with grey slabs and dashed lines.
