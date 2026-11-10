/**
 * Single door measured to a centre cross: eight readings (Notion, Measuring
 * Calculator decisions, confirmed by Matt 2 Nov 2026).
 * Run with: npm test
 */
import { test } from 'vitest';
import assert from 'node:assert';
import {
  applyCrossReadings,
  checkMeasurements,
  createOpeningMeasurements,
  crossCeilingHeightMm,
  crossMissing,
  describeWidths,
  topWidthMm,
} from '../src/measure';

const ctx = { hasStartWall: true, hasEndWall: true, glassHeightMm: 2000 };
const ceilingCtx = { ...ctx, toCeiling: true };

// Left wall 3mm in at the top, right wall plumb, floor 4mm lower on the right.
const readings = {
  leftBottomMm: 400,
  leftTopMm: 397,
  rightBottomMm: 398,
  rightTopMm: 398,
  floorLeftMm: 1000,
  floorRightMm: 1004,
  ceilingLeftMm: 1400,
  ceilingRightMm: 1398,
};

const opening = (method) => ({ ...createOpeningMeasurements([700]), method });

test('laser: opposite readings add up, and the rakes come from the same readings', () => {
  const m = applyCrossReadings(opening('laser'), readings);
  assert.strictEqual(m.runs[0].widthAtFloorMm, 798);
  assert.deepStrictEqual(m.startWall, { gapBottomMm: 400, gapMiddleMm: null, gapTopMm: 397 });
  assert.deepStrictEqual(m.endWall, { gapBottomMm: 398, gapMiddleMm: null, gapTopMm: 398 });
  assert.strictEqual(topWidthMm(m, 0, ctx), 795); // 397 + 398
  assert.strictEqual(m.runs[0].floorFallMm, 4);
  assert.strictEqual(m.runs[0].floorLowEnd, 'end');
});

test('ceiling height is the lower side, floor plus ceiling reading', () => {
  assert.strictEqual(crossCeilingHeightMm(readings), 2400); // left 2400, right 2402
  assert.strictEqual(applyCrossReadings(opening('laser'), readings).ceilingHeightMm, 2400);
});

test('tape: sums only; top width goes in as a cross-check, rakes left to the level', () => {
  const m = applyCrossReadings(opening('packers'), readings);
  assert.strictEqual(m.runs[0].widthAtFloorMm, 798);
  assert.strictEqual(m.runs[0].widthAtTopCheckMm, 795);
  assert.strictEqual(m.startWall.gapBottomMm, null);
  assert.strictEqual(m.runs[0].floorFallMm, 0);
});

test('readings 7 and 8 are only needed when going to the ceiling', () => {
  const six = { ...readings, ceilingLeftMm: null, ceilingRightMm: null };
  assert.deepStrictEqual(crossMissing(six, false), []);
  assert.deepStrictEqual(crossMissing(six, true), [7, 8]);
  assert.deepStrictEqual(crossMissing({ ...six, ceilingLeftMm: 1400 }, false), [8]);
});

test('a half-done cross blocks on the width card and names the readings', () => {
  const m = applyCrossReadings(opening('laser'), { ...readings, rightTopMm: null, floorRightMm: null });
  const c = checkMeasurements(m, ctx).find((x) => x.code === 'run0-widthAtFloor-cross-missing');
  assert.ok(c);
  assert.strictEqual(c.level, 'blocking');
  assert.match(c.message, /readings 4, 6/);
});

test('a full cross raises no false alarms about big gaps or the laser distance', () => {
  const m = { ...applyCrossReadings(opening('laser'), readings), shapeConfirmed: true };
  assert.deepStrictEqual(checkMeasurements(m, ceilingCtx).map((c) => c.code), []);
});

test('the email shows the cross readings behind the width', () => {
  const m = applyCrossReadings(opening('laser'), readings);
  assert.match(describeWidths(m, ctx), /798mm measured at the floor \(to a centre cross: 400 \+ 398 at the bottom, 397 \+ 398 at the top\)/);
});
