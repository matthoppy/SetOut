/**
 * Two-halves width: the customer measures to a line in the middle and the
 * designer adds the halves. Imports measure.ts directly (Node 22 strips types).
 * Run with: npm test
 */
import { test } from 'vitest';
import assert from 'node:assert';
import {
  checkMeasurements,
  createOpeningMeasurements,
  describeWidths,
  halvesTotalMm,
  measuredInHalves,
} from '../src/measure';

const ctx = { hasStartWall: true, hasEndWall: true, glassHeightMm: 2000 };
const withRun = (patch) => {
  const m = createOpeningMeasurements([1200]);
  m.runs[0] = { ...m.runs[0], ...patch };
  m.method = 'laser';
  m.startWall = { gapBottomMm: 50, gapMiddleMm: null, gapTopMm: 50 };
  m.endWall = { gapBottomMm: 50, gapMiddleMm: null, gapTopMm: 50 };
  m.shapeConfirmed = true;
  return m;
};
const codes = (m) => checkMeasurements(m, ctx).map((c) => c.code);

test('halves add up, and zero is a real half', () => {
  assert.strictEqual(halvesTotalMm({ halfAMm: 612, halfBMm: 598 }), 1210);
  assert.strictEqual(halvesTotalMm({ halfAMm: 0, halfBMm: 900 }), 900);
  assert.strictEqual(halvesTotalMm({ halfAMm: 612, halfBMm: null }), null);
  assert.strictEqual(halvesTotalMm({}), null);
});

test('older saved designs without halves are not treated as halves', () => {
  assert.strictEqual(measuredInHalves({ widthAtFloorMm: 900 }), false);
  assert.deepStrictEqual(codes(withRun({ halfAMm: undefined, halfBMm: undefined })), []);
});

test('one half on its own blocks, on the width card', () => {
  const checks = checkMeasurements(withRun({ halfAMm: 612, halfBMm: null }), ctx);
  const c = checks.find((x) => x.code === 'run0-widthAtFloor-half-missing');
  assert.ok(c, 'half-missing check raised');
  assert.strictEqual(c.level, 'blocking');
  assert.strictEqual(c.runIndex, 0);
});

test('both halves in: no checks, and the email shows the halves', () => {
  const m = withRun({ halfAMm: 612, halfBMm: 598, widthAtFloorMm: 1210 });
  assert.deepStrictEqual(codes(m), []);
  assert.match(describeWidths(m, ctx), /1210mm measured at the floor \(in two halves: 612 \+ 598\)/);
});
