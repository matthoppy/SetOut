# Product

<!-- impeccable:product-schema 1 -->

The SetOut designer: the shower configurator a glass company puts on its own
website, and the measuring cards that follow it. Facts marked _(inferred)_
were taken from the code and Matt's written briefs rather than confirmed in
an interview.

## Platform

web

## Users

- A homeowner fitting or replacing a frameless glass shower, designing it on
  the glass company's site and then measuring their own bathroom, phone in
  hand, standing in the shower area with a cross-line laser and a tape
  measure.
- Staff at the glass company, who check the numbers in the SetOut workspace
  before glass is made _(inferred)_.

## Product Purpose

The customer designs the shower, then measures the opening one reading at a
time, so the company can make the glass from the customer's own numbers.
Success is a set of measurements right the first time, with no visit to
re-measure.

## Positioning

Measuring is guided card by card, the way a glazier sets out a shower with a
laser: marks on the floor, the laser stood where the card says, one reading
to a card, and every reading checked against the others.

## Operating Context

- A phone, often held in one hand, in a bathroom, with the tools on the floor.
- The designer is embedded on each company's own site, takes on that
  company's name and button colour, and can be shown in a dark theme by
  request.
- Short phone screens are common; the picture is the part of a card that
  gives way when the screen is short.

## Capabilities and Constraints

- The cards, their order, their wording and the readings are dealt by the
  engine (`packages/engine/src/cards.ts`) and signed off by Matt. Pictures
  never change them.
- A picture shows exactly what its card asks for, at the positions the card
  names. Positions are never invented or moved to make a picture look better.
- One action per picture. No collages.
- Layouts: door only; panel and door; walk-in screen; walk-in with return;
  corner, door and side; corner, wider front; three sided; over a bath; and
  sliding doors (staging only).
- A single door is measured to a laser in the middle and keeps its own
  pictures, signed off on 10 November 2026; a screen over a bath keeps the
  face-on pictures.

## Brand Commitments

- Each company's own colour is on the designer's buttons. The measuring
  pictures use the measuring accent (`--measure-accent`, navy on white).
- Matt's illustration brief, 12 November 2026, binding: premium, modern
  architectural illustration; clean isometric 3D; realistic glass with subtle
  transparency; realistic but subtle shadows; white or very light grey
  grounds; a restrained palette; consistent line weights; measurement lines
  clean and precise; laser lines unmistakable from physical edges; start and
  end of every measurement obvious; numbers large enough to read; the same
  camera, light, glass, materials, marks and type on every picture.
- Matt's reference images, the same day, binding on the drawing style: crisp
  isometric line illustrations of shower enclosures, with fine dark
  outlines, white and light grey planes, a tiled floor and pale glass with
  thin reflection lines; "rethink how the illustrations are actually drawn",
  not a recolour.

## Evidence on Hand

- The signed-off measuring sequences in `packages/engine/src/cards.ts` and
  their tests.
- No photographs of real installs are used in the pictures; the pictures are
  drawn from the design's shape.

## Product Principles

1. The reading is the hero: what the customer must measure is the most
   visible thing on the card.
2. The picture follows the words: it shows the card's instruction and
   nothing the card does not say.
3. One room, one camera: a customer moving through the deck never has to
   find their bearings again.
4. Built for the phone in the bathroom: large numbers, nothing that only
   reads on a big screen.

## Accessibility & Inclusion

- Every picture carries a sentence describing it for screen readers.
- Motion is limited to a gentle pulse on the point to read, and stops when
  the device asks for reduced motion _(inferred standard: WCAG 2.1 AA, as
  the rest of SetOut)_.
