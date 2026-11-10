/**
 * Measuring Calculator decisions (Notion, 2 Nov 2026): laser reference
 * distance, walk-in gap, and keeping the set-up answers across a shape change.
 * Run with: npm test
 */
import { test } from 'vitest';
import assert from 'node:assert';
import {
  checkMeasurements,
  createOpeningMeasurements,
  describeOpening,
  keepSetup,
  LASER_OFFSET_DEFAULT_MM,
  walkInGapMm,
} from '../src/measure';

const alcove = { hasStartWall: true, hasEndWall: true, glassHeightMm: 2000 };
const walkIn = { hasStartWall: true, hasEndWall: false, glassHeightMm: 2000 };

function measured(widths, patch = {}) {
  const m = createOpeningMeasurements(widths);
  m.method = 'laser';
  m.startWall = { gapBottomMm: 50, gapMiddleMm: null, gapTopMm: 53 };
  m.endWall = { gapBottomMm: 50, gapMiddleMm: null, gapTopMm: 50 };
  m.shapeConfirmed = true;
  return { ...m, ...patch };
}
const codes = (m, ctx) => checkMeasurements(m, ctx).map((c) => c.code);

test('laser reference defaults to 50mm', () => {
  assert.strictEqual(LASER_OFFSET_DEFAULT_MM, 50);
  assert.strictEqual(createOpeningMeasurements([900]).laserOffsetMm, 50);
});

test('Notion example: 50 at the bottom, 53 at the top is a 3mm lean, no warnings', () => {
  assert.deepStrictEqual(codes(measured([1200]), alcove), []);
  assert.match(describeOpening(measured([1200]), alcove), /first wall 3mm out of plumb, leaning out/);
});

test('a bottom reading far from the laser distance is queried, not blocked', () => {
  const m = measured([1200]);
  m.startWall = { gapBottomMm: 80, gapMiddleMm: null, gapTopMm: 83 };
  const c = checkMeasurements(m, alcove).find((x) => x.code === 'startWall-laser-reference');
  assert.ok(c);
  assert.strictEqual(c.level, 'confirm');
});

test('changing the laser distance moves the reference with it', () => {
  const m = measured([1200], { laserOffsetMm: 80 });
  m.startWall = { gapBottomMm: 80, gapMiddleMm: null, gapTopMm: 83 };
  m.endWall = { gapBottomMm: 80, gapMiddleMm: null, gapTopMm: 80 };
  assert.deepStrictEqual(codes(m, alcove), []);
});

test('no laser reference check for the level-and-packers method', () => {
  const m = measured([1200], { method: 'packers' });
  m.startWall = { gapBottomMm: 6, gapMiddleMm: null, gapTopMm: 0 };
  assert.ok(!codes(m, alcove).some((c) => c.endsWith('laser-reference')));
});

test('walk-in gap is the whole opening less the glass', () => {
  assert.strictEqual(walkInGapMm(measured([900], { walkInOpeningMm: 1600 })), 700);
  assert.strictEqual(walkInGapMm(measured([900])), null);
});

test('a narrow walk-in gap is only a hint and never blocks', () => {
  const m = measured([1000], { walkInOpeningMm: 1600 });
  m.endWall = { gapBottomMm: null, gapMiddleMm: null, gapTopMm: null };
  const c = checkMeasurements(m, walkIn);
  const narrow = c.find((x) => x.code === 'walk-in-narrow');
  assert.ok(narrow);
  assert.strictEqual(narrow.level, 'hint');
  assert.ok(!c.some((x) => x.level === 'blocking'));
  assert.match(describeOpening(m, walkIn), /walk-in gap 600mm \(whole opening 1600mm\)/);
});

test('650mm or more gives no walk-in hint', () => {
  const m = measured([900], { walkInOpeningMm: 1550 });
  assert.ok(!codes(m, walkIn).includes('walk-in-narrow'));
});

test('glass longer than the whole opening is queried', () => {
  const m = measured([1700], { walkInOpeningMm: 1600 });
  assert.ok(codes(m, walkIn).includes('walk-in-no-gap'));
});

test('a new shape keeps the laser answer and distance', () => {
  const before = measured([900], { laserOffsetMm: 60 });
  const after = keepSetup(before, createOpeningMeasurements([800, 700]));
  assert.strictEqual(after.method, 'laser');
  assert.strictEqual(after.laserOffsetMm, 60);
  assert.strictEqual(after.runs.length, 2);
  assert.strictEqual(after.shapeConfirmed, false);
});
