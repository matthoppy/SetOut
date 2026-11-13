/**
 * Floor and ceiling as two readings each, tape widths at the top and middle,
 * and the checks that follow from them. Imports measure.ts directly (Node 22
 * strips types). Run with: npm test
 */
import { test } from 'vitest';
import assert from 'node:assert';
import {
  applyCrossReadings,
  applyFloorReadings,
  ceilingGlassHeightMm,
  ceilingLowestMm,
  ceilingSlope,
  checkMeasurements,
  createOpeningMeasurements,
  describeOpening,
  floorFromReadings,
  toolFor,
} from '../src/measure';

const alcove = { hasStartWall: true, hasEndWall: true, glassHeightMm: 2000 };
const walkIn = { hasStartWall: true, hasEndWall: false, glassHeightMm: 2000 };

/** A fully measured single-run alcove, laser, walls plumb, ready to go. */
function measured(widths = [1200], method = 'laser') {
  const m = createOpeningMeasurements(widths);
  m.method = method;
  m.startWall = { gapBottomMm: 50, gapMiddleMm: null, gapTopMm: 50 };
  m.endWall = { gapBottomMm: 50, gapMiddleMm: null, gapTopMm: 50 };
  m.shapeConfirmed = true;
  return m;
}
const codes = (m, ctx) => checkMeasurements(m, ctx).map((c) => c.code);
const find = (m, ctx, code) => checkMeasurements(m, ctx).find((c) => c.code === code);

// --- Floor -----------------------------------------------------------------

test('floor: the larger reading is the lower end, whichever tool took it', () => {
  // Laser: down from a level line at each end.
  assert.deepStrictEqual(floorFromReadings(1000, 1004), { fallMm: 4, lowEnd: 'end' });
  // Level resting on the high end: zero there, the gap under the other end.
  assert.deepStrictEqual(floorFromReadings(6, 0), { fallMm: 6, lowEnd: 'start' });
  assert.deepStrictEqual(floorFromReadings(0, 0), { fallMm: 0, lowEnd: null });
  assert.strictEqual(floorFromReadings(5, null), null);
  assert.strictEqual(floorFromReadings(undefined, undefined), null);
});

test('floor: applying the readings writes the fall the rest of the designer reads', () => {
  const run = applyFloorReadings(createOpeningMeasurements([900]).runs[0], 0, 7);
  assert.strictEqual(run.floorStartMm, 0);
  assert.strictEqual(run.floorEndMm, 7);
  assert.strictEqual(run.floorFallMm, 7);
  assert.strictEqual(run.floorLowEnd, 'end');
  const cleared = applyFloorReadings(run, null, 7);
  assert.strictEqual(cleared.floorFallMm, 0);
  assert.strictEqual(cleared.floorLowEnd, null);
});

test('floor: one reading on its own blocks, with the run named', () => {
  const m = measured([900, 700]);
  m.runs[1] = applyFloorReadings(m.runs[1], 3, null);
  const c = find(m, { ...alcove, labels: ['Front', 'Return'] }, 'run1-floor-half-missing');
  assert.ok(c);
  assert.strictEqual(c.level, 'blocking');
  assert.strictEqual(c.runIndex, 1);
  assert.match(c.message, /along the return/);
});

test('floor: a large fall from two readings is queried, not blocked', () => {
  const m = measured();
  m.runs[0] = applyFloorReadings(m.runs[0], 0, 25);
  assert.ok(codes(m, alcove).includes('run0-floor-large-fall'));
  assert.ok(!checkMeasurements(m, alcove).some((c) => c.level === 'blocking'));
  assert.match(describeOpening(m, alcove), /floor 25mm lower at the end \(readings 0 and 25\)/);
  // Told what is at each end, it says which.
  assert.match(describeOpening(m, { ...alcove, ends: [{ start: 'left wall', end: 'right wall' }] }), /floor 25mm lower at the right wall \(readings 0 and 25\)/);
});

test('floor: the laser cross writes its readings 5 and 6 as the floor readings', () => {
  const m = applyCrossReadings(
    { ...createOpeningMeasurements([700]), method: 'laser' },
    {
      leftBottomMm: 400, leftTopMm: 400, rightBottomMm: 400, rightTopMm: 400,
      floorLeftMm: 1000, floorRightMm: 1003, ceilingLeftMm: 1400, ceilingRightMm: 1400,
    }
  );
  assert.strictEqual(m.runs[0].floorStartMm, 1000);
  assert.strictEqual(m.runs[0].floorEndMm, 1003);
  assert.strictEqual(m.runs[0].floorFallMm, 3);
  assert.strictEqual(m.runs[0].floorLowEnd, 'end');
  // Ceiling heights are vertical sums, so they are set for tape as well.
  assert.strictEqual(m.runs[0].ceilingStartMm, 2400);
  assert.strictEqual(m.runs[0].ceilingEndMm, 2403);
});

// --- Ceiling ---------------------------------------------------------------

test('ceiling: slope, direction, and the bounding height for cutting', () => {
  const m = measured([1200]);
  m.runs[0] = { ...m.runs[0], ceilingStartMm: 2400, ceilingEndMm: 2385 };
  assert.deepStrictEqual(ceilingSlope(m.runs[0]), {
    dropMm: 15, lowEnd: 'end', highMm: 2400, lowMm: 2385,
  });
  assert.strictEqual(ceilingGlassHeightMm(m), 2400);
  assert.strictEqual(ceilingLowestMm(m), 2385);
  assert.strictEqual(ceilingSlope({ ceilingStartMm: 2400 }), null);
  assert.strictEqual(ceilingGlassHeightMm(createOpeningMeasurements([900])), null);
});

test('ceiling: glass to the ceiling without ceiling readings blocks on every run', () => {
  const m = measured([900, 700]);
  const ctx = { ...alcove, toCeiling: true, labels: ['Front', 'Return'] };
  const found = codes(m, ctx);
  assert.ok(found.includes('run0-ceiling-missing'));
  assert.ok(found.includes('run1-ceiling-missing'));
});

test('ceiling: a single door to the ceiling takes it from the cross, so nothing is missing', () => {
  const m = applyCrossReadings(
    { ...createOpeningMeasurements([700]), method: 'laser', shapeConfirmed: true },
    {
      leftBottomMm: 400, leftTopMm: 400, rightBottomMm: 400, rightTopMm: 400,
      floorLeftMm: 1000, floorRightMm: 1000, ceilingLeftMm: 1400, ceilingRightMm: 1400,
    }
  );
  m.shapeConfirmed = true;
  assert.deepStrictEqual(codes(m, { ...alcove, toCeiling: true }), []);
});

test('ceiling: one end on its own blocks; both ends level raise nothing', () => {
  const m = measured();
  m.runs[0] = { ...m.runs[0], ceilingStartMm: 2400, ceilingEndMm: null };
  assert.ok(codes(m, { ...alcove, toCeiling: true }).includes('run0-ceiling-half-missing'));
  m.runs[0] = { ...m.runs[0], ceilingEndMm: 2400 };
  assert.deepStrictEqual(codes(m, { ...alcove, toCeiling: true }), []);
});

test('ceiling: a big slope is queried, and the message says the glass follows it', () => {
  const m = measured();
  m.runs[0] = { ...m.runs[0], ceilingStartMm: 2400, ceilingEndMm: 2370 };
  const c = find(m, { ...alcove, toCeiling: true }, 'run0-ceiling-large-slope');
  assert.ok(c);
  assert.strictEqual(c.level, 'confirm');
  assert.match(c.message, /30mm lower at the end/);
  assert.match(c.message, /cut on that slope/);
  assert.match(describeOpening(m, alcove), /ceiling 2400mm at the start falling to 2370mm at the end \(30mm slope/);
});

test('ceiling: wrong units are caught with a one-tap correction', () => {
  const m = measured();
  m.runs[0] = { ...m.runs[0], ceilingStartMm: 2.4, ceilingEndMm: 2400 };
  const c = checkMeasurements(m, { ...alcove, toCeiling: true }).find((x) =>
    x.code.startsWith('run0-ceiling-start-unit')
  );
  assert.ok(c);
  assert.strictEqual(c.suggestionMm, 2400);
  m.runs[0] = { ...m.runs[0], ceilingStartMm: 240 };
  const cm = checkMeasurements(m, { ...alcove, toCeiling: true }).find((x) =>
    x.code.startsWith('run0-ceiling-start-unit')
  );
  assert.strictEqual(cm.suggestionMm, 2400);
});

test('ceiling: glass that stops short is checked against a ceiling that comes down over it', () => {
  const m = measured();
  m.aboveGlass = 'ceiling';
  m.runs[0] = { ...m.runs[0], ceilingStartMm: 2300, ceilingEndMm: 1990 };
  const c = find(m, alcove, 'run0-ceiling-below-glass');
  assert.ok(c);
  assert.strictEqual(c.level, 'confirm');
  assert.match(c.message, /At the end the ceiling is 1990mm/);
  // Clear of the glass: nothing but the slope query.
  m.runs[0] = { ...m.runs[0], ceilingEndMm: 2100 };
  assert.ok(!codes(m, alcove).includes('run0-ceiling-below-glass'));
});

// --- Tape widths at the top and middle --------------------------------------

test('tape: a top width that differs before the walls are checked is a hint, not a contradiction', () => {
  const m = createOpeningMeasurements([1200]);
  m.method = 'packers';
  m.runs[0] = { ...m.runs[0], widthAtTopCheckMm: 1194 };
  const c = find(m, alcove, 'run0-top-differs');
  assert.ok(c);
  assert.strictEqual(c.level, 'hint');
  assert.match(c.message, /6mm narrower at the top/);
  assert.ok(!codes(m, alcove).includes('run0-cross-check-mismatch'));
});

test('tape: once both walls are measured, the top width is cross-checked as before', () => {
  const m = measured([1200], 'packers');
  // Left wall leans in 6mm at the top: top should be 1194.
  m.startWall = { gapBottomMm: 6, gapMiddleMm: null, gapTopMm: 0 };
  m.runs[0] = { ...m.runs[0], widthAtTopCheckMm: 1194 };
  assert.deepStrictEqual(codes(m, alcove), []);
  m.runs[0] = { ...m.runs[0], widthAtTopCheckMm: 1180 };
  const c = find(m, alcove, 'run0-cross-check-mismatch');
  assert.ok(c);
  assert.strictEqual(c.level, 'blocking');
});

test('tape: unchecked walls with a differing top width is a query, not a block', () => {
  const m = createOpeningMeasurements([1200]);
  m.method = 'assumed-square';
  m.shapeConfirmed = true;
  m.runs[0] = { ...m.runs[0], widthAtTopCheckMm: 1208 };
  const c = find(m, alcove, 'run0-top-differs-unchecked');
  assert.ok(c);
  assert.strictEqual(c.level, 'confirm');
  assert.match(c.message, /8mm wider at the top/);
  assert.ok(!checkMeasurements(m, alcove).some((x) => x.level === 'blocking'));
});

test('tape: a middle width off the straight line between floor and top suggests a bow', () => {
  const m = measured([1200], 'packers');
  m.runs[0] = { ...m.runs[0], widthAtTopCheckMm: 1200, widthAtMiddleCheckMm: 1192 };
  const c = find(m, alcove, 'run0-middle-bow');
  assert.ok(c);
  assert.strictEqual(c.level, 'confirm');
  assert.match(c.message, /about 1200mm there/);
  m.runs[0] = { ...m.runs[0], widthAtMiddleCheckMm: 1197 };
  assert.ok(!codes(m, alcove).includes('run0-middle-bow'));
});

test('tape: a middle width in centimetres is caught', () => {
  const m = measured([1200], 'packers');
  m.runs[0] = { ...m.runs[0], widthAtMiddleCheckMm: 120 };
  const c = checkMeasurements(m, alcove).find((x) => x.code.startsWith('run0-widthAtMiddleCheck-unit'));
  assert.ok(c);
  assert.strictEqual(c.suggestionMm, 1200);
});

// --- Odds and ends ------------------------------------------------------------

test('the tool behind a method', () => {
  assert.strictEqual(toolFor('laser'), 'laser');
  assert.strictEqual(toolFor('packers'), 'tape');
  assert.strictEqual(toolFor('level'), 'tape');
  assert.strictEqual(toolFor('assumed-square'), 'tape');
  assert.strictEqual(toolFor(null), null);
});

test('older saved runs without the new fields still check clean', () => {
  const m = measured();
  delete m.runs[0].floorStartMm;
  delete m.runs[0].floorEndMm;
  delete m.runs[0].ceilingStartMm;
  delete m.runs[0].ceilingEndMm;
  delete m.runs[0].widthAtMiddleCheckMm;
  delete m.aboveGlass;
  assert.deepStrictEqual(codes(m, alcove), []);
  assert.deepStrictEqual(codes({ ...m, endWall: { gapBottomMm: null, gapMiddleMm: null, gapTopMm: null } }, walkIn), []);
});
