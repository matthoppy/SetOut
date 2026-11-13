/**
 * The measuring cards: which cards a shower is dealt, in what order, and
 * what typing a number into one does to the design.
 */
import { describe, expect, test } from 'vitest';
import {
  buildCards,
  ceilingChoice,
  checkMeasurements,
  CROSS_POINTS,
  DEFAULT_RULESET,
  designFromTemplate,
  hasDeck,
  openingContext,
  readField,
  readingCards,
  runViews,
  TEMPLATES,
  unreadCards,
  leanScale,
  topWidthMm,
  walkInGapMm,
  wallLean,
  writeField,
  type CardField,
  type ConfiguratorState,
  type CrossKey,
  type MeasureCardDef,
} from '../src';

const rules = DEFAULT_RULESET;
const topGap = rules.making.heights.singleDoorTopGapMm;

/** A single door between two walls, to be measured with a laser. */
function door(toCeiling = false): ConfiguratorState {
  const state = designFromTemplate('alcove-door');
  return { ...state, isFloorToCeiling: toCeiling, opening: { ...state.opening, method: 'laser' } };
}

// Left wall 2mm in at the top, right wall 1mm out, floor 2mm lower on the right.
const READINGS: Record<CrossKey, number> = {
  leftBottomMm: 350,
  leftTopMm: 348,
  rightBottomMm: 352,
  rightTopMm: 353,
  floorLeftMm: 1000,
  floorRightMm: 1002,
  ceilingLeftMm: 1400,
  ceilingRightMm: 1396,
};

/** Type every reading a deck asks for, in the order it asks. */
function typeAll(start: ConfiguratorState, heightMm = 2000): ConfiguratorState {
  let state = start;
  for (const card of readingCards(buildCards(start))) {
    const field = card.field!;
    state = writeField(rules, state, field, field.kind === 'cross' ? READINGS[field.key] : heightMm);
  }
  return state;
}

describe('the deck a single door is dealt', () => {
  test('a set height: two cards to read, the left wall at the bottom, then the height, the rest of the cross, then the drawing', () => {
    const cards = buildCards(door());
    expect(cards.map((c) => c.id)).toEqual([
      'marks',
      'laser-setup',
      // The bottom first, then the height (Matt, 12 November 2026). Reading 2
      // is taken level with the mark the height card asks for.
      'cross-1',
      'height',
      'cross-2',
      'cross-3',
      'cross-4',
      'cross-5',
      'cross-6',
      'review',
    ]);
    expect(cards.map((c) => c.kind)).toEqual([
      'instruction',
      'instruction',
      ...Array(7).fill('reading'),
      'review',
    ]);
  });

  test('up to the ceiling: no height to choose, and two more readings to find it', () => {
    const cards = buildCards(door(true));
    expect(cards.map((c) => c.id)).toEqual([
      'marks',
      'laser-setup',
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `cross-${n}`),
      'review',
    ]);
  });

  test.each([false, true])('reading cards are numbered from one with no gaps (to the ceiling: %s)', (toCeiling) => {
    const readings = readingCards(buildCards(door(toCeiling)));
    expect(readings.map((c) => c.readingIndex)).toEqual(readings.map((_, i) => i + 1));
  });

  test.each([false, true])('every card has what its screen needs (to the ceiling: %s)', (toCeiling) => {
    const cards = buildCards(door(toCeiling));
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    for (const card of cards) {
      expect(card.title).not.toBe('');
      if (card.kind === 'review') continue;
      // One picture and one short instruction on every card before the drawing.
      expect(card.visual).not.toBeNull();
      expect(card.instruction).not.toBe('');
      if (card.kind === 'reading') {
        expect(card.field).toBeDefined();
        expect(card.inputLabel).toBeTruthy();
        expect(card.minMm).toBeLessThan(card.maxMm!);
      } else {
        expect(card.field).toBeUndefined();
      }
    }
  });

  test('each reading to the cross shows the point it writes, under the same number', () => {
    for (const card of readingCards(buildCards(door(true)))) {
      if (card.field?.kind !== 'cross' || card.visual?.kind !== 'cross-reading') throw new Error(card.id);
      const point = CROSS_POINTS.find((p) => p.key === (card.field as { key: CrossKey }).key)!;
      expect(card.visual.point).toBe(point.n);
      expect(card.id).toBe(`cross-${point.n}`);
    }
  });

  test('readings at the top are taken at the mark for a set height and at the ceiling otherwise', () => {
    const at = (toCeiling: boolean) => buildCards(door(toCeiling)).find((c) => c.id === 'cross-2')!.instruction;
    expect(at(false)).toContain('your mark on the wall');
    expect(at(true)).toContain('along the ceiling');
  });
});

describe('typing a reading', () => {
  test('nothing is read back until it has been typed', () => {
    const state = door(true);
    for (const card of readingCards(buildCards(state))) {
      expect(readField(state, card.field!)).toBeNull();
    }
  });

  test('every reading reads back as typed', () => {
    const state = typeAll(door(true));
    for (const card of readingCards(buildCards(state))) {
      const field = card.field!;
      if (field.kind === 'cross') expect(readField(state, field)).toBe(READINGS[field.key]);
    }
  });

  test('a set height: the width, the walls and the floor come from the readings, and the height is theirs', () => {
    const state = typeAll(door(), 1950);
    const run = state.opening.runs[0];
    expect(state.heightMm).toBe(1950);
    expect(run.widthAtFloorMm).toBe(702);
    expect(state.opening.startWall).toMatchObject({ gapBottomMm: 350, gapTopMm: 348 });
    expect(state.opening.endWall).toMatchObject({ gapBottomMm: 352, gapTopMm: 353 });
    expect(run.floorFallMm).toBe(2);
    expect(run.floorLowEnd).toBe('end');
  });

  test('the door is resized to the width that was measured', () => {
    const before = door();
    const state = typeAll(before);
    expect(before.panels[0].width_mm).not.toBe(702);
    expect(state.panels).toHaveLength(1);
    expect(state.panels[0].width_mm).toBe(702);
  });

  test('up to the ceiling: the door stops the air gap short of the lower side', () => {
    const state = typeAll(door(true));
    // Left 1000 + 1400 = 2400, right 1002 + 1396 = 2398.
    expect(state.opening.ceilingHeightMm).toBe(2398);
    expect(state.heightMm).toBe(2398 - topGap);
  });

  test('a set height is left alone by readings to the ceiling', () => {
    let state = typeAll(door(), 2000);
    state = writeField(rules, state, { kind: 'cross', key: 'ceilingLeftMm' }, 1400);
    state = writeField(rules, state, { kind: 'cross', key: 'ceilingRightMm' }, 1396);
    expect(state.heightMm).toBe(2000);
  });

  test('a changed reading means the measurements have not been agreed', () => {
    const agreed = typeAll(door());
    const confirmed = { ...agreed, opening: { ...agreed.opening, shapeConfirmed: true } };
    const changed = writeField(rules, confirmed, { kind: 'cross', key: 'leftBottomMm' }, 360);
    expect(changed.opening.shapeConfirmed).toBe(false);
    expect(changed.opening.runs[0].widthAtFloorMm).toBe(712);
  });

  test('clearing a reading takes it out without inventing another', () => {
    const state = writeField(rules, typeAll(door()), { kind: 'cross', key: 'rightTopMm' }, null);
    expect(readField(state, { kind: 'cross', key: 'rightTopMm' })).toBeNull();
    expect(readField(state, { kind: 'cross', key: 'leftTopMm' })).toBe(348);
  });

  test('clearing the height box leaves the height as it was', () => {
    const state = typeAll(door(), 2000);
    expect(writeField(rules, state, { kind: 'height' }, null)).toBe(state);
  });

  test('typing never changes the design it was given', () => {
    const state = door();
    const copy = structuredClone(state);
    writeField(rules, state, { kind: 'cross', key: 'leftBottomMm' }, 350);
    writeField(rules, state, { kind: 'height' }, 2100);
    expect(state).toEqual(copy);
  });
});

describe('taking the glass to the ceiling, or back', () => {
  test('to the ceiling before measuring: nothing to follow yet, so the height stays', () => {
    const state = door();
    const change = ceilingChoice(rules, state, true);
    expect(change.isFloorToCeiling).toBe(true);
    expect(change).not.toHaveProperty('heightMm');
  });

  test('to the ceiling once it has been measured: a single door stops the air gap short', () => {
    let state = typeAll(door(true));
    state = { ...state, ...ceilingChoice(rules, state, false), heightMm: 2000 };
    const change = ceilingChoice(rules, state, true);
    expect(change.heightMm).toBe(2398 - topGap);
  });

  test("a company's own air gap is used", () => {
    const state = { ...typeAll(door(true)), topGapMm: 45 };
    expect(ceilingChoice(rules, state, true).heightMm).toBe(2398 - 45);
  });

  test('back to a set height: the height is theirs to choose again', () => {
    const state = typeAll(door(true));
    const change = ceilingChoice(rules, state, false);
    expect(change.isFloorToCeiling).toBe(false);
    expect(change).not.toHaveProperty('heightMm');
  });

  test.each([true, false])('either way the measurements want agreeing again (to the ceiling: %s)', (toCeiling) => {
    const measured = typeAll(door(!toCeiling));
    const state = { ...measured, opening: { ...measured.opening, shapeConfirmed: true } };
    expect(ceilingChoice(rules, state, toCeiling).opening?.shapeConfirmed).toBe(false);
    expect(state.opening.shapeConfirmed).toBe(true);
  });

  test('the deck follows the choice', () => {
    const state = door();
    const asked = (s: ConfiguratorState) => readingCards(buildCards(s)).length;
    expect(asked(state)).toBe(7);
    expect(asked({ ...state, ...ceilingChoice(rules, state, true) })).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Every other shape
// ---------------------------------------------------------------------------

/** A layout as it starts, to be measured with a laser. */
function layout(id: string, toCeiling = false): ConfiguratorState {
  const state = designFromTemplate(id);
  return { ...state, isFloorToCeiling: toCeiling, opening: { ...state.opening, method: 'laser' } };
}

const deck = (id: string, toCeiling = false) => buildCards(layout(id, toCeiling), { overBath: id === 'over-bath' });
const ids = (cards: MeasureCardDef[]) => cards.map((c) => c.id);

/** A believable number for a card: what a careful person would read off the tape. */
function reading(field: CardField): number {
  switch (field.kind) {
    case 'height':
      return 2000;
    case 'cross':
      return READINGS[field.key];
    case 'width':
      return 850;
    case 'half':
      return field.half === 'a' ? 420 : 431;
    case 'tray':
      return 1500;
    case 'wall':
      return field.at === 'bottom' ? 50 : 53;
    case 'floor':
      return field.end === 'start' ? 1000 : 1004;
    case 'ceiling':
      return field.end === 'start' ? 2400 : 2392;
    case 'top':
      return 851;
    case 'level':
      return 1200;
  }
}

/** Type every reading a deck asks for, the ones that may be skipped included. */
function typeDeck(start: ConfiguratorState, cards: MeasureCardDef[]): ConfiguratorState {
  return readingCards(cards).reduce((state, card) => writeField(rules, state, card.field!, reading(card.field!)), start);
}

const EVERY_DECK = TEMPLATES.flatMap((t) => [
  { id: t.id, toCeiling: false },
  { id: t.id, toCeiling: true },
]);

describe('a deck for every layout', () => {
  test('there is one for a laser, and for a tape only where the tape decks are switched on', () => {
    for (const template of TEMPLATES) {
      const state = designFromTemplate(template.id);
      expect(hasDeck({ ...state, opening: { ...state.opening, method: 'laser' } })).toBe(true);
      expect(hasDeck({ ...state, opening: { ...state.opening, method: 'packers' } })).toBe(false);
      expect(hasDeck(state)).toBe(false);
    }
  });

  test.each(EVERY_DECK)('$id (to the ceiling: $toCeiling) is well formed', ({ id, toCeiling }) => {
    const cards = deck(id, toCeiling);
    expect(new Set(ids(cards)).size).toBe(cards.length);
    expect(cards.at(-1)?.kind).toBe('review');
    expect(cards.filter((c) => c.kind === 'review')).toHaveLength(1);
    expect(cards[0].kind).toBe('instruction');

    const readings = readingCards(cards);
    expect(readings.map((c) => c.readingIndex)).toEqual(readings.map((_, i) => i + 1));
    // A heading is what the list at the end calls a reading, so no two may match.
    expect(new Set(readings.map((c) => c.title)).size).toBe(readings.length);

    for (const card of cards) {
      expect(card.title).not.toBe('');
      if (card.kind === 'review') continue;
      expect(card.visual).not.toBeNull();
      expect(card.instruction).not.toBe('');
      // Short enough to read at a glance on a phone.
      expect(card.instruction.length).toBeLessThanOrEqual(260);
      expect(card.title.length).toBeLessThanOrEqual(44);
      if (card.kind === 'reading') {
        expect(card.field).toBeDefined();
        expect(card.inputLabel).toBeTruthy();
        expect(card.minMm).toBeLessThan(card.maxMm!);
        expect(reading(card.field!)).toBeGreaterThanOrEqual(card.minMm!);
        expect(reading(card.field!)).toBeLessThanOrEqual(card.maxMm!);
      } else {
        expect(card.field).toBeUndefined();
      }
    }
  });

  test.each(EVERY_DECK.filter((d) => d.id !== 'alcove-door'))(
    '$id (to the ceiling: $toCeiling): every reading has its own circled number, in the order it is taken',
    ({ id, toCeiling }) => {
      const readings = readingCards(deck(id, toCeiling));
      expect(readings.map((c) => c.mark)).toEqual(readings.map((_, i) => i + 1));
    }
  );

  test('the eight readings to a cross keep their own numbers', () => {
    const readings = readingCards(deck('alcove-door'));
    expect(readings.map((c) => c.mark)).toEqual([1, undefined, 2, 3, 4, 5, 6]);
  });

  test.each(EVERY_DECK)(
    '$id (to the ceiling: $toCeiling): every reading reads back as typed, and nothing is read before then',
    ({ id, toCeiling }) => {
      const start = layout(id, toCeiling);
      const cards = buildCards(start, { overBath: id === 'over-bath' });
      for (const card of readingCards(cards)) {
        // A height is a choice with a usual answer, so its box starts filled in.
        if (card.field!.kind !== 'height') expect(readField(start, card.field!)).toBeNull();
      }
      const state = typeDeck(start, cards);
      for (const card of readingCards(cards)) {
        expect(readField(state, card.field!)).toBe(reading(card.field!));
      }
      expect(unreadCards(state, buildCards(state, { overBath: id === 'over-bath' }))).toEqual([]);
    }
  );

  test.each(EVERY_DECK)(
    '$id (to the ceiling: $toCeiling): the deck asks for everything the checks need',
    ({ id, toCeiling }) => {
      const start = layout(id, toCeiling);
      const state = typeDeck(start, buildCards(start, { overBath: id === 'over-bath' }));
      const stops = checkMeasurements(state.opening, openingContext(state))
        .filter((c) => c.level === 'blocking')
        .map((c) => c.code);
      // Only the customer saying the drawing is right is left.
      expect(stops).toEqual(['shape-unconfirmed']);
    }
  );

  test.each(EVERY_DECK.filter((d) => d.id !== 'alcove-door'))(
    '$id (to the ceiling: $toCeiling): only a single door is measured to a laser in the middle, so every run is one pull',
    ({ id, toCeiling }) => {
      const cards = deck(id, toCeiling);
      expect(cards.filter((c) => c.field?.kind === 'half')).toEqual([]);
      for (const card of cards) {
        if (card.visual?.kind === 'run-width') expect(card.visual.part).toBe('whole');
      }
    }
  );

  test.each(EVERY_DECK.filter((d) => !d.toCeiling))('$id: the first measurement is along the bottom, and the height comes after it', ({ id }) => {
    const readings = readingCards(deck(id));
    const at = readings.findIndex((c) => c.field?.kind === 'height');
    expect(at).toBeGreaterThan(0);
    // Along the bottom: the widths, and where the glass turns a corner the floor readings taken with them.
    expect(['width', 'tray', 'cross', 'floor']).toContain(readings[at - 1].field?.kind);
    expect(['width', 'cross']).toContain(readings[0].field?.kind);
  });

  test.each(EVERY_DECK)('$id (to the ceiling: $toCeiling): the deck is the same after it has been filled in', ({ id, toCeiling }) => {
    const start = layout(id, toCeiling);
    const options = { overBath: id === 'over-bath' };
    const before = buildCards(start, options);
    expect(ids(buildCards(typeDeck(start, before), options))).toEqual(ids(before));
  });
});

describe('what each layout is asked', () => {
  test('a panel and door between two walls: the opening in one pull, the height, the floor, then each wall', () => {
    const cards = deck('alcove-panel-door');
    expect(ids(cards)).toEqual([
      'marks',
      'laser-on',
      'width-0',
      'height',
      'floor-0-start',
      'floor-0-end',
      'wall-start-bottom',
      'wall-start-top',
      'wall-end-bottom',
      'wall-end-top',
      'review',
    ]);
    expect(cards.find((c) => c.id === 'width-0')?.title).toBe('How wide is the opening?');
  });

  test('a walk-in screen: its length in one pull, the tray if they like, then the height, the floor, and its one wall', () => {
    const cards = deck('walk-in');
    expect(ids(cards)).toEqual([
      'marks',
      'laser-on',
      'width-0',
      'tray',
      'height',
      'floor-0-start',
      'floor-0-end',
      'wall-start-bottom',
      'wall-start-top',
      'review',
    ]);
    expect(cards.filter((c) => c.optional).map((c) => c.id)).toEqual(['tray']);
  });

  test('a screen over a bath is measured from the bath rim, and has no tray to ask about', () => {
    const cards = deck('over-bath');
    expect(ids(cards)).not.toContain('tray');
    const words = cards.map((c) => `${c.title} ${c.instruction} ${c.inputLabel ?? ''}`).join(' ');
    expect(words).toContain('bath rim');
    expect(words).not.toMatch(/\bfloor\b|\btray\b/i);
  });

  test('a corner: each width to the laser at the corner with the floor under it, the height, then the walls', () => {
    const cards = deck('corner-door-return');
    expect(ids(cards)).toEqual([
      'marks',
      'laser-on',
      // The laser stands over the corner for both runs, and each run's floor
      // is read from there straight after its width (Matt, 12 November 2026).
      'width-0',
      'floor-0-start',
      'floor-0-end',
      'width-1',
      'floor-1-start',
      'floor-1-end',
      // The bottom first, then the height.
      'height',
      'wall-start-bottom',
      'wall-start-top',
      'wall-end-bottom',
      'wall-end-top',
      'review',
    ]);
    // Matt, 12 November 2026: the laser at the corner, the tape from each wall, read at the laser.
    const [side, front] = [cards.find((c) => c.id === 'width-0')!, cards.find((c) => c.id === 'width-1')!];
    expect(side.instruction).toMatch(/^Stand the laser over the corner mark, with its lines along both glass lines\. Hook the tape on the .+ at your mark, along the floor, and read where the laser lights the blade\.$/);
    expect(front.instruction).toMatch(/^Leave the laser where it is\. Hook the tape on the .+ at your mark, along the floor, and read where the laser lights the blade\.$/);
    expect(side.visual).toMatchObject({ kind: 'run-width', part: 'whole', laser: 'right' });
    expect(front.visual).toMatchObject({ kind: 'run-width', part: 'whole', laser: 'left' });
    expect(side.inputLabel).toMatch(/to the laser, along the floor$/);
  });

  test('where the glass turns a corner, each run’s floor is read straight after its width, before the laser moves, and nothing is added', () => {
    for (const id of ['corner-door-return', 'corner-panel-door-return', 'three-sided', 'walk-in-return']) {
      for (const toCeiling of [false, true]) {
        const cards = deck(id, toCeiling);
        const order = ids(cards);
        cards.forEach((card, i) => {
          if (card.field?.kind !== 'width') return;
          const run = card.field.run;
          expect(order.slice(i + 1, i + 3), id).toEqual([`floor-${run}-start`, `floor-${run}-end`]);
        });
        // The same readings as before, only sooner: two floor readings for every run.
        const runs = cards.filter((c) => c.field?.kind === 'width').length;
        expect(cards.filter((c) => c.field?.kind === 'floor'), id).toHaveLength(runs * 2);
      }
    }
    // The three-sided deck moves the laser once, after the front and its floor are read.
    const three = ids(deck('three-sided'));
    expect(three.slice(2, 11)).toEqual(['width-0', 'floor-0-start', 'floor-0-end', 'width-1', 'floor-1-start', 'floor-1-end', 'width-2', 'floor-2-start', 'floor-2-end']);
    expect(deck('three-sided').find((c) => c.id === 'width-2')?.instruction).toMatch(/^Move the laser over the other corner mark/);
  });

  test('every run that meets a corner is read at the laser, which moves once at most', () => {
    for (const id of ['corner-door-return', 'corner-panel-door-return', 'three-sided', 'walk-in-return']) {
      const widths = deck(id).filter((c) => c.field?.kind === 'width');
      for (const card of widths) {
        expect(card.instruction, id).toMatch(/read where the laser lights the blade\.$/);
        expect(card.visual, id).toHaveProperty('laser');
      }
      expect(widths.filter((c) => /^(Stand|Move) the laser/.test(c.instruction)).length, id).toBeLessThanOrEqual(2);
      expect(widths.filter((c) => /^Move the laser/.test(c.instruction)).length, id).toBe(id === 'three-sided' ? 1 : 0);
    }
  });

  test('a walk-in with a return has one wall, and its return ends in the open', () => {
    const cards = deck('walk-in-return');
    expect(ids(cards).filter((id) => id.startsWith('wall-'))).toEqual(['wall-start-bottom', 'wall-start-top']);
    expect(cards.find((c) => c.id === 'floor-1-end')?.title).toBe('The right side: floor at the open end');
  });

  test('to the ceiling: no height to choose, and floor to ceiling at each end of every run', () => {
    const cards = deck('three-sided', true);
    expect(ids(cards)).not.toContain('height');
    expect(ids(cards).filter((id) => id.startsWith('ceiling-'))).toEqual([
      'ceiling-0-start',
      'ceiling-0-end',
      'ceiling-1-start',
      'ceiling-1-end',
      'ceiling-2-start',
      'ceiling-2-end',
    ]);
    expect(readingCards(cards)).toHaveLength(19);
    expect(ids(deck('three-sided')).some((id) => id.startsWith('ceiling-'))).toBe(false);
  });

  test('a front between two corners says which corner, and two ends of one wall say which end', () => {
    const cards = deck('three-sided');
    const titles = cards.map((c) => c.title);
    // The laser is still over the left corner from the left side, so the front is read there.
    expect(cards.find((c) => c.id === 'width-1')?.instruction).toBe(
      'Leave the laser where it is. Hold the end of the tape on the right corner mark, along the floor, and read where the laser lights the blade.'
    );
    expect(titles).toContain('Back wall on the left, at the bottom');
    expect(titles).toContain('Back wall on the right, at the bottom');
  });

  test('a pull of the tape starts from a wall where the run has one', () => {
    const cards = deck('three-sided');
    expect(cards.find((c) => c.id === 'width-0')?.instruction).toMatch(/^Stand the laser over the corner mark, with its lines along both glass lines\. Hook the tape on the back wall/);
    // The right side starts at a corner and ends on the back wall.
    expect(cards.find((c) => c.id === 'width-2')?.instruction).toMatch(/^Move the laser over the other corner mark, with its lines along both glass lines\. Hook the tape on the back wall/);
    // With no corner the tape runs wall to wall.
    expect(deck('alcove-panel-door').find((c) => c.id === 'width-0')?.instruction).toMatch(/^Hook the tape on the .+ at your mark, and measure along the floor to the .+\.$/);
  });

  test('the tape marks are shown from above only when the glass turns a corner', () => {
    const marks = (id: string) => deck(id).find((c) => c.id === 'marks')?.visual?.kind;
    expect(marks('alcove-panel-door')).toBe('marks');
    expect(marks('walk-in')).toBe('marks');
    expect(marks('over-bath')).toBe('marks');
    expect(marks('walk-in-return')).toBe('plan-marks');
    expect(marks('corner-door-return')).toBe('plan-marks');
    expect(marks('three-sided')).toBe('plan-marks');
  });

  test('each picture is told what is at either side of its run', () => {
    expect(runViews(layout('three-sided')).map((v) => [v.left, v.right, v.door])).toEqual([
      ['wall', 'corner', false],
      ['corner', 'corner', true],
      ['corner', 'wall', false],
    ]);
    expect(runViews(layout('walk-in')).map((v) => [v.left, v.right])).toEqual([['wall', 'open']]);
    // Which side of the shower each run is, for the small plan on its picture.
    expect(runViews(layout('three-sided')).map((v) => v.faces)).toEqual(['left', 'front', 'right']);
    expect(runViews(layout('corner-door-return')).map((v) => v.faces)).toEqual(['left', 'front']);
    expect(runViews(layout('walk-in-return')).map((v) => v.faces)).toEqual(['front', 'right']);
    expect(runViews(layout('alcove-panel-door')).map((v) => v.faces)).toEqual(['front']);
    expect(runViews(layout('over-bath'), { overBath: true })[0].surface).toBe('bath');
  });
});

describe('typing a reading on any layout', () => {
  test('a width in one pull resizes that run and no other', () => {
    const before = layout('corner-door-return');
    const state = writeField(rules, before, { kind: 'width', run: 0 }, 912);
    expect(state.opening.runs[0]).toMatchObject({ widthAtFloorMm: 912, wholeMm: 912 });
    expect(state.panels[0].width_mm).toBe(912);
    expect(state.panels[1]).toEqual(before.panels[1]);
    expect(state.opening.runs[1]).toEqual(before.opening.runs[1]);
  });

  test('two halves are added up for them, and the run follows', () => {
    let state = layout('alcove-panel-door');
    state = writeField(rules, state, { kind: 'half', run: 0, half: 'a' }, 601);
    // One half is not a width: the layout keeps its size and the checks say what is missing.
    expect(state.opening.runs[0].widthAtFloorMm).toBe(1100);
    expect(checkMeasurements(state.opening, openingContext(state)).map((c) => c.code)).toContain(
      'run0-widthAtFloor-half-missing'
    );
    state = writeField(rules, state, { kind: 'half', run: 0, half: 'b' }, 618);
    expect(state.opening.runs[0].widthAtFloorMm).toBe(1219);
    expect(state.panels.reduce((sum, p) => sum + p.width_mm, 0)).toBe(1219);
  });

  test('one pull and two halves never stand together', () => {
    let state = writeField(rules, layout('alcove-panel-door'), { kind: 'half', run: 0, half: 'a' }, 600);
    state = writeField(rules, state, { kind: 'width', run: 0 }, 1210);
    expect(state.opening.runs[0]).toMatchObject({ wholeMm: 1210, halfAMm: null, halfBMm: null });
    state = writeField(rules, state, { kind: 'half', run: 0, half: 'b' }, 610);
    expect(state.opening.runs[0]).toMatchObject({ wholeMm: null, halfAMm: null, halfBMm: 610 });
  });

  test('two floor readings become a fall and which end is lower', () => {
    let state = layout('walk-in');
    state = writeField(rules, state, { kind: 'floor', run: 0, end: 'start' }, 1000);
    state = writeField(rules, state, { kind: 'floor', run: 0, end: 'end' }, 1006);
    // The bigger reading is further below the level line.
    expect(state.opening.runs[0]).toMatchObject({ floorFallMm: 6, floorLowEnd: 'end' });
  });

  test('two wall readings become a lean and its direction', () => {
    let state = layout('walk-in');
    state = writeField(rules, state, { kind: 'wall', wall: 'start', at: 'bottom' }, 50);
    state = writeField(rules, state, { kind: 'wall', wall: 'start', at: 'top' }, 46);
    expect(wallLean(state.opening.startWall)).toMatchObject({ leanMm: 4, direction: 'in' });
    expect(state.opening.endWall).toEqual(layout('walk-in').opening.endWall);
  });

  test('glass to the ceiling is cut to the tallest reading anywhere', () => {
    let state = layout('corner-door-return', true);
    state = writeField(rules, state, { kind: 'ceiling', run: 0, end: 'start' }, 2400);
    state = writeField(rules, state, { kind: 'ceiling', run: 0, end: 'end' }, 2390);
    state = writeField(rules, state, { kind: 'ceiling', run: 1, end: 'start' }, 2390);
    state = writeField(rules, state, { kind: 'ceiling', run: 1, end: 'end' }, 2412);
    expect(state.heightMm).toBe(2412);
  });

  test('a set height is left alone by ceiling readings', () => {
    const state = writeField(rules, layout('walk-in'), { kind: 'ceiling', run: 0, end: 'start' }, 2400);
    expect(state.heightMm).toBe(2000);
  });

  test('the whole tray gives the gap to walk through', () => {
    let state = writeField(rules, layout('walk-in'), { kind: 'width', run: 0 }, 900);
    expect(walkInGapMm(state.opening)).toBeNull();
    state = writeField(rules, state, { kind: 'tray' }, 1550);
    expect(walkInGapMm(state.opening)).toBe(650);
  });

  test('a reading that may be skipped is never counted as missing', () => {
    const start = layout('walk-in');
    const cards = buildCards(start);
    const state = readingCards(cards)
      .filter((c) => !c.optional)
      .reduce((s, card) => writeField(rules, s, card.field!, reading(card.field!)), start);
    expect(unreadCards(start, cards).map((c) => c.id)).toEqual([
      'width-0',
      'floor-0-start',
      'floor-0-end',
      'wall-start-bottom',
      'wall-start-top',
    ]);
    expect(unreadCards(state, cards)).toEqual([]);
    expect(readField(state, { kind: 'tray' })).toBeNull();
  });

  test('clearing a width takes the reading away and leaves the size standing', () => {
    let state = writeField(rules, layout('walk-in'), { kind: 'width', run: 0 }, 950);
    state = writeField(rules, state, { kind: 'width', run: 0 }, null);
    expect(readField(state, { kind: 'width', run: 0 })).toBeNull();
    expect(state.opening.runs[0].widthAtFloorMm).toBe(950);
    expect(state.panels[0].width_mm).toBe(950);
  });

  test.each(EVERY_DECK)('$id (to the ceiling: $toCeiling): any reading typed means the measurements want agreeing again', ({ id, toCeiling }) => {
    const start = layout(id, toCeiling);
    const agreed = { ...start, opening: { ...start.opening, shapeConfirmed: true } };
    for (const card of readingCards(buildCards(start, { overBath: id === 'over-bath' }))) {
      if (card.field!.kind === 'height') continue;
      expect(writeField(rules, agreed, card.field!, reading(card.field!)).opening.shapeConfirmed).toBe(false);
    }
  });

  test.each(EVERY_DECK)('$id (to the ceiling: $toCeiling): typing never changes the design it was given', ({ id, toCeiling }) => {
    const start = layout(id, toCeiling);
    const copy = structuredClone(start);
    typeDeck(start, buildCards(start, { overBath: id === 'over-bath' }));
    expect(start).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// Measuring with a tape and a level
// ---------------------------------------------------------------------------

describe('the tape decks', () => {
  const TAPE = TEMPLATES.flatMap((t) => [
    { id: t.id, toCeiling: false },
    { id: t.id, toCeiling: true },
  ]);
  const options = (id: string) => ({ overBath: id === 'over-bath', tape: true });
  const tapeLayout = (id: string, toCeiling = false): ConfiguratorState => {
    const state = layout(id, toCeiling);
    return { ...state, opening: { ...state.opening, method: 'packers' } };
  };
  const tapeDeck = (id: string, toCeiling = false) => buildCards(tapeLayout(id, toCeiling), options(id));
  /** What a careful person reads with a tape and a 1200mm level: the end of a level that touches reads 0. */
  const tapeReading = (field: CardField): number => {
    if (field.kind === 'wall') return field.at === 'bottom' ? 0 : 3;
    if (field.kind === 'floor') return field.end === 'start' ? 0 : 4;
    return reading(field);
  };
  /**
   * Every reading typed, the width at the top last: it is the floor width
   * with both walls' leans, each scaled up from the level to the glass.
   */
  const typeTape = (start: ConfiguratorState, cards: MeasureCardDef[]) => {
    const readings = readingCards(cards);
    let state = readings.filter((c) => c.field!.kind !== 'top').reduce((st, card) => writeField(rules, st, card.field!, tapeReading(card.field!)), start);
    if (readings.some((c) => c.field!.kind === 'top')) {
      state = writeField(rules, state, { kind: 'top', run: 0 }, topWidthMm(state.opening, 0, openingContext(state)));
    }
    return state;
  };

  test('are dealt only where switched on, a single door included', () => {
    for (const template of TEMPLATES) {
      const state = tapeLayout(template.id);
      expect(hasDeck(state)).toBe(false);
      expect(hasDeck(state, { tape: true })).toBe(true);
      // Without a laser and switched off, the laser deck is what is dealt, as before.
      expect(buildCards(state, { overBath: template.id === 'over-bath' })).toEqual(
        buildCards({ ...state, opening: { ...state.opening, method: 'laser' } }, { overBath: template.id === 'over-bath' })
      );
    }
  });

  test.each(TAPE)('$id (to the ceiling: $toCeiling) is well formed, and never asks for a laser', ({ id, toCeiling }) => {
    const cards = tapeDeck(id, toCeiling);
    expect(new Set(ids(cards)).size).toBe(cards.length);
    expect(cards.at(-1)?.kind).toBe('review');
    expect(cards[0].id).toBe('marks');
    const readings = readingCards(cards);
    expect(readings.map((c) => c.readingIndex)).toEqual(readings.map((_, i) => i + 1));
    expect(readings.map((c) => c.mark)).toEqual(readings.map((_, i) => i + 1));
    expect(new Set(readings.map((c) => c.title)).size).toBe(readings.length);
    for (const card of cards) {
      if (card.kind === 'review') continue;
      expect(card.instruction).not.toMatch(/laser/i);
      expect(card.instruction.length).toBeLessThanOrEqual(260);
      expect(card.title.length).toBeLessThanOrEqual(44);
      expect(['laser-on', 'wall-gap', 'run-floor', 'cross-reading', 'laser-setup']).not.toContain(card.visual?.kind);
      if (card.visual?.kind === 'run-width') expect(card.visual.laser).toBeUndefined();
      if (card.kind === 'reading') {
        expect(tapeReading(card.field!)).toBeGreaterThanOrEqual(card.minMm!);
        expect(tapeReading(card.field!)).toBeLessThanOrEqual(card.maxMm!);
      }
    }
  });

  test.each(TAPE)('$id (to the ceiling: $toCeiling): asks for everything the checks need, and reads back as typed', ({ id, toCeiling }) => {
    const start = tapeLayout(id, toCeiling);
    const cards = buildCards(start, options(id));
    const state = typeTape(start, cards);
    for (const card of readingCards(cards)) if (card.field!.kind !== 'top') expect(readField(state, card.field!)).toBe(tapeReading(card.field!));
    expect(unreadCards(state, buildCards(state, options(id)))).toEqual([]);
    const stops = checkMeasurements(state.opening, openingContext(state))
      .filter((c) => c.level === 'blocking')
      .map((c) => c.code);
    expect(stops).toEqual(['shape-unconfirmed']);
    // Filled in, it is the same deck.
    expect(ids(buildCards(state, options(id)))).toEqual(ids(cards));
  });

  test.each(TAPE.filter((d) => !d.toCeiling))('$id: the first measurement is along the bottom, and the height comes after the widths', ({ id }) => {
    const readings = readingCards(tapeDeck(id));
    const at = readings.findIndex((c) => c.field?.kind === 'height');
    expect(readings[0].field?.kind).toBe('width');
    expect(readings.slice(0, at).every((c) => c.field?.kind === 'width' || c.field?.kind === 'tray')).toBe(true);
  });

  test('a run between two walls is measured again at the top; a corner has nothing to measure the top to', () => {
    expect(ids(tapeDeck('alcove-panel-door'))).toEqual([
      'marks',
      'width-0',
      'height',
      'width-top-0',
      'level-length',
      'floor-0-start',
      'floor-0-end',
      'wall-start-bottom',
      'wall-start-top',
      'wall-end-bottom',
      'wall-end-top',
      'review',
    ]);
    for (const id of ['corner-door-return', 'three-sided', 'walk-in', 'over-bath']) expect(ids(tapeDeck(id))).not.toContain('width-top-0');
  });

  test('the gaps under and behind a level become a fall and a lean, the end that touches reading 0', () => {
    let state = tapeLayout('walk-in');
    state = writeField(rules, state, { kind: 'floor', run: 0, end: 'start' }, 0);
    state = writeField(rules, state, { kind: 'floor', run: 0, end: 'end' }, 4);
    expect(state.opening.runs[0]).toMatchObject({ floorFallMm: 4, floorLowEnd: 'end' });
    state = writeField(rules, state, { kind: 'wall', wall: 'start', at: 'bottom' }, 0);
    state = writeField(rules, state, { kind: 'wall', wall: 'start', at: 'top' }, 3);
    // A gap at the top: the wall falls away from the level up there, so it leans out.
    expect(wallLean(state.opening.startWall)).toMatchObject({ leanMm: 3, direction: 'out' });
  });

  test('a single door without a laser is measured as a panel and door is (Matt, 13 November 2026)', () => {
    expect(ids(tapeDeck('alcove-door'))).toEqual(ids(tapeDeck('alcove-panel-door')));
    expect(ids(tapeDeck('alcove-door', true))).toEqual([
      'marks',
      'width-0',
      'width-top-0',
      'level-length',
      'floor-0-start',
      'floor-0-end',
      'ceiling-0-start',
      'ceiling-0-end',
      'wall-start-bottom',
      'wall-start-top',
      'wall-end-bottom',
      'wall-end-top',
      'review',
    ]);
  });

  test('a single door to the ceiling stops the air gap short of the lower of its two readings', () => {
    let state = tapeLayout('alcove-door', true);
    state = writeField(rules, state, { kind: 'ceiling', run: 0, end: 'start' }, 2400);
    state = writeField(rules, state, { kind: 'ceiling', run: 0, end: 'end' }, 2392);
    expect(state.heightMm).toBe(2392 - rules.making.heights.singleDoorTopGapMm);
    expect(state.opening.ceilingHeightMm).toBe(2392);
  });

  test('a lean read off a level is scaled up to the glass, and a fall to the run', () => {
    let state = { ...tapeLayout('walk-in'), heightMm: 2000 };
    state = writeField(rules, state, { kind: 'width', run: 0 }, 1500);
    state = writeField(rules, state, { kind: 'wall', wall: 'start', at: 'bottom' }, 0);
    state = writeField(rules, state, { kind: 'wall', wall: 'start', at: 'top' }, 3);
    state = writeField(rules, state, { kind: 'floor', run: 0, end: 'start' }, 0);
    state = writeField(rules, state, { kind: 'floor', run: 0, end: 'end' }, 4);
    // Before the level's length is known, read as typed.
    expect(wallLean(state.opening.startWall, leanScale(state.opening, state.heightMm))).toMatchObject({ leanMm: 3, direction: 'out' });
    expect(state.opening.runs[0].floorFallMm).toBe(4);
    // A 1200mm level on 2000mm glass and a 1500mm run.
    state = writeField(rules, state, { kind: 'level' }, 1200);
    expect(wallLean(state.opening.startWall, leanScale(state.opening, state.heightMm))).toMatchObject({ leanMm: 5, direction: 'out' });
    expect(state.opening.runs[0]).toMatchObject({ floorFallMm: 5, floorLowEnd: 'end', floorStartMm: 0, floorEndMm: 4 });
    // The run changes, and the fall follows it.
    state = writeField(rules, state, { kind: 'width', run: 0 }, 1200);
    expect(state.opening.runs[0].floorFallMm).toBe(4);
  });

  test("a laser's readings are never scaled, whatever level length a design carries", () => {
    let state = layout('walk-in');
    state = { ...state, opening: { ...state.opening, levelLengthMm: 600 } };
    state = writeField(rules, state, { kind: 'floor', run: 0, end: 'start' }, 1000);
    state = writeField(rules, state, { kind: 'floor', run: 0, end: 'end' }, 1004);
    expect(state.opening.runs[0].floorFallMm).toBe(4);
    expect(leanScale(state.opening, 2000)).toBe(1);
  });

  test('the width at the top is kept as the check it is', () => {
    const state = writeField(rules, tapeLayout('alcove-panel-door'), { kind: 'top', run: 0 }, 1104);
    expect(state.opening.runs[0].widthAtTopCheckMm).toBe(1104);
    expect(readField(state, { kind: 'top', run: 0 })).toBe(1104);
  });
});
