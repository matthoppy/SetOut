/**
 * The measuring cards: which cards a shower is dealt, in what order, and
 * what typing a number into one does to the design.
 */
import { describe, expect, test } from 'vitest';
import {
  buildCards,
  ceilingChoice,
  CROSS_POINTS,
  DEFAULT_RULESET,
  designFromTemplate,
  readField,
  readingCards,
  writeField,
  type ConfiguratorState,
  type CrossKey,
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
    state = writeField(rules, state, field, field.kind === 'height' ? heightMm : READINGS[field.key]);
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
