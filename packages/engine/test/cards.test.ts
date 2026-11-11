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
  test('a set height: two cards to read, the height, six readings to the cross, then the drawing', () => {
    const cards = buildCards(door());
    expect(cards.map((c) => c.id)).toEqual([
      'marks',
      'laser-setup',
      'height',
      'cross-1',
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
  test('there is one for a laser, and not yet for a tape', () => {
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
    expect(readings.map((c) => c.mark)).toEqual([undefined, 1, 2, 3, 4, 5, 6]);
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

  test.each(EVERY_DECK)('$id (to the ceiling: $toCeiling): the deck is the same after it has been filled in', ({ id, toCeiling }) => {
    const start = layout(id, toCeiling);
    const options = { overBath: id === 'over-bath' };
    const before = buildCards(start, options);
    expect(ids(buildCards(typeDeck(start, before), options))).toEqual(ids(before));
  });
});

describe('what each layout is asked', () => {
  test('a panel and door between two walls: the opening in halves, the floor, then each wall', () => {
    expect(ids(deck('alcove-panel-door'))).toEqual([
      'marks',
      'laser-on',
      'height',
      'half-0-a',
      'half-0-b',
      'floor-0-start',
      'floor-0-end',
      'wall-start-bottom',
      'wall-start-top',
      'wall-end-bottom',
      'wall-end-top',
      'review',
    ]);
  });

  test('a walk-in screen: its length in one pull, the tray if they like, the floor, and its one wall', () => {
    const cards = deck('walk-in');
    expect(ids(cards)).toEqual([
      'marks',
      'laser-on',
      'height',
      'width-0',
      'tray',
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

  test('a corner: each run in turn, with the wall it ends on straight after it', () => {
    expect(ids(deck('corner-door-return'))).toEqual([
      'marks',
      'laser-on',
      'height',
      // The side has no door in it, so one pull.
      'width-0',
      'floor-0-start',
      'floor-0-end',
      'wall-start-bottom',
      'wall-start-top',
      // The front has the door, so two halves to the laser.
      'half-1-a',
      'half-1-b',
      'floor-1-start',
      'floor-1-end',
      'wall-end-bottom',
      'wall-end-top',
      'review',
    ]);
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
    expect(readingCards(cards)).toHaveLength(20);
    expect(ids(deck('three-sided')).some((id) => id.startsWith('ceiling-'))).toBe(false);
  });

  test('a front between two corners says which corner, and two ends of one wall say which end', () => {
    const titles = deck('three-sided').map((c) => c.title);
    expect(titles).toContain('The front: left corner to the laser');
    expect(titles).toContain('The front: right corner to the laser');
    expect(titles).toContain('Back wall on the left, at the bottom');
    expect(titles).toContain('Back wall on the right, at the bottom');
  });

  test('a pull of the tape starts from a wall where the run has one', () => {
    const cards = deck('three-sided');
    expect(cards.find((c) => c.id === 'width-0')?.instruction).toMatch(/^Hook the tape on the back wall/);
    // The right side starts at a corner and ends on the back wall.
    expect(cards.find((c) => c.id === 'width-2')?.instruction).toMatch(/^Hook the tape on the back wall/);
  });

  test('each picture is told what is at either side of its run', () => {
    expect(runViews(layout('three-sided')).map((v) => [v.left, v.right, v.door])).toEqual([
      ['wall', 'corner', false],
      ['corner', 'corner', true],
      ['corner', 'wall', false],
    ]);
    expect(runViews(layout('walk-in')).map((v) => [v.left, v.right])).toEqual([['wall', 'open']]);
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

