/**
 * The measuring journey: which screens each shape needs, in which order, and
 * where each check is answered. Run with: npm test
 */
import { test } from 'vitest';
import assert from 'node:assert';
import { TEMPLATES } from '../src/templates';
import { runWidthsMm } from '../src/geometry';
import { applyCrossReadings, createOpeningMeasurements, checkMeasurements } from '../src/measure';
import {
  buildJourney,
  journeySummary,
  measureScreenCount,
  runEndNames,
  runNames,
  screenIndexForCheck,
  wallNames,
} from '../src/journey';

const byId = (id) => TEMPLATES.find((t) => t.id === id);

/** A design from a template, with the method set and nothing measured. */
function design(templateId, method = 'laser', patch = {}) {
  const t = byId(templateId);
  const panels = structuredClone(t.panels);
  const junctions = structuredClone(t.junctions);
  const opening = createOpeningMeasurements(runWidthsMm(panels, junctions));
  opening.method = method;
  return {
    panels,
    junctions,
    leftWall: t.leftWall,
    rightWall: t.rightWall,
    heightMm: t.heightMm ?? 2000,
    isFloorToCeiling: false,
    opening,
    ...patch,
  };
}
const ids = (s) => buildJourney(s).map((x) => x.id);

test('door only, laser: the cross gives the walls and floor, so neither is asked again', () => {
  assert.deepStrictEqual(ids(design('alcove-door', 'laser')), [
    'method', 'overview', 'height', 'cross-setup', 'cross-left', 'cross-right', 'cross-floor', 'notches', 'summary',
  ]);
});

test('door only, laser, to the ceiling: readings 7 and 8 join the cross', () => {
  const s = design('alcove-door', 'laser', { isFloorToCeiling: true });
  assert.ok(ids(s).includes('cross-ceiling'));
  assert.ok(!ids(s).includes('ceiling-0'), 'the single door takes its ceiling from the cross');
});

test('door only, tape: the cross for the sums, then walls and floor with the level', () => {
  assert.deepStrictEqual(ids(design('alcove-door', 'packers')), [
    'method', 'overview', 'height', 'cross-setup', 'cross-left', 'cross-right', 'cross-floor',
    'wall-start', 'wall-end', 'floor-0', 'notches', 'summary',
  ]);
});

test('panel and door, tape: width at the top is offered because both ends are walls', () => {
  assert.deepStrictEqual(ids(design('alcove-panel-door', 'packers')), [
    'method', 'overview', 'height', 'width-0', 'width-top-0', 'wall-start', 'wall-end', 'floor-0', 'notches', 'summary',
  ]);
  assert.ok(!ids(design('alcove-panel-door', 'laser')).includes('width-top-0'), 'a laser derives the top');
});

test('walk-in: one wall, one width, one floor, and no top width (nothing to measure to)', () => {
  assert.deepStrictEqual(ids(design('walk-in', 'packers')), [
    'method', 'overview', 'height', 'width-0', 'wall-start', 'floor-0', 'notches', 'summary',
  ]);
  assert.strictEqual(buildJourney(design('walk-in')).find((s) => s.id === 'width-0').title, 'How long should the glass be?');
});

test('corner, door and side: two widths, back wall then door wall, two floors', () => {
  const s = design('corner-door-return', 'laser');
  assert.deepStrictEqual(ids(s), [
    'method', 'overview', 'height', 'width-0', 'width-1', 'wall-start', 'wall-end', 'floor-0', 'floor-1', 'notches', 'summary',
  ]);
  assert.deepStrictEqual(runNames(s), ['the left side', 'the front']);
  assert.deepStrictEqual(wallNames(s), { start: 'the back wall', end: 'the right wall, beside the door' });
  assert.deepStrictEqual(runEndNames(s, 0), { start: 'back wall', end: 'corner' });
  assert.deepStrictEqual(runEndNames(s, 1), { start: 'corner', end: 'right wall' });
});

test('three sided: both ends of the back wall are named apart', () => {
  const s = design('three-sided');
  assert.deepStrictEqual(runNames(s), ['the left side', 'the front', 'the right side']);
  assert.deepStrictEqual(wallNames(s), {
    start: 'the back wall, at the left end',
    end: 'the back wall, at the right end',
  });
  assert.deepStrictEqual(runEndNames(s, 1), { start: 'corner', end: 'corner' });
  assert.strictEqual(measureScreenCount(s), 13);
});

test('walk-in with return: the one wall is just "the wall"', () => {
  const s = design('walk-in-return');
  assert.deepStrictEqual(wallNames(s), { start: 'the wall', end: null });
  assert.deepStrictEqual(runEndNames(s, 1), { start: 'corner', end: 'open end' });
});

test('an enclosure to the ceiling asks for the ceiling along every run, and the transom', () => {
  const s = design('corner-panel-door-return', 'laser', { isFloorToCeiling: true });
  const found = ids(s);
  assert.ok(found.includes('transom'));
  assert.ok(found.includes('ceiling-0') && found.includes('ceiling-1'));
  assert.ok(found.indexOf('ceiling-0') > found.indexOf('floor-1'), 'ceiling comes after the floors');
});

test('a ceiling that comes down over glass that stops short adds the ceiling screens', () => {
  const s = design('walk-in');
  assert.ok(!ids(s).includes('ceiling-0'));
  s.opening.aboveGlass = 'ceiling';
  assert.ok(ids(s).includes('ceiling-0'));
});

test('no method yet still produces a complete journey (tape wording until chosen)', () => {
  const s = design('alcove-door', null);
  assert.ok(ids(s).includes('wall-start'), 'without a laser the walls are asked');
});

test('checks land on the screen that answers them', () => {
  const s = design('corner-door-return', 'laser');
  const screens = buildJourney(s);
  const at = (code, runIndex) => screens[screenIndexForCheck({ code, runIndex }, screens, s)].id;
  assert.strictEqual(at('no-method'), 'method');
  assert.strictEqual(at('run1-widthAtFloor-missing', 1), 'width-1');
  assert.strictEqual(at('run0-widthAtFloor-unit-metres', 0), 'width-0');
  assert.strictEqual(at('startWall-not-measured'), 'wall-start');
  assert.strictEqual(at('endWall-large-lean'), 'wall-end');
  assert.strictEqual(at('run1-floor-half-missing', 1), 'floor-1');
  assert.strictEqual(at('run0-cross-check-mismatch', 0), 'wall-end');
  assert.strictEqual(at('shape-unconfirmed'), 'summary');
  assert.strictEqual(at('run0-ceiling-missing', 0), 'height', 'no ceiling screen: the height screen owns the choice');
});

test('single door checks route to the cross screen that holds the reading', () => {
  const s = design('alcove-door', 'laser', { isFloorToCeiling: true });
  s.opening = applyCrossReadings(s.opening, {
    leftBottomMm: 400, leftTopMm: 400, rightBottomMm: 400, rightTopMm: null,
    floorLeftMm: 1000, floorRightMm: 1000, ceilingLeftMm: null, ceilingRightMm: null,
  });
  const screens = buildJourney(s);
  const missing = checkMeasurements(s.opening, { hasStartWall: true, hasEndWall: true, glassHeightMm: 2000, toCeiling: true })
    .find((c) => c.code.includes('cross-missing'));
  assert.ok(missing);
  assert.strictEqual(screens[screenIndexForCheck(missing, screens, s)].id, 'cross-right', 'reading 4 is the first missing');
  assert.strictEqual(screens[screenIndexForCheck({ code: 'startWall-large-lean' }, screens, s)].id, 'cross-left');
  assert.strictEqual(screens[screenIndexForCheck({ code: 'run0-floor-large-fall', runIndex: 0 }, screens, s)].id, 'cross-floor');
  assert.strictEqual(screens[screenIndexForCheck({ code: 'run0-ceiling-large-slope', runIndex: 0 }, screens, s)].id, 'cross-ceiling');
});

test('the summary lists what is missing, and points Change at the right screen', () => {
  const s = design('alcove-panel-door', 'packers');
  const rows = journeySummary(s);
  const byLabel = (l) => rows.find((r) => r.label === l);
  assert.strictEqual(byLabel('Width along the floor').value, '1100mm');
  assert.strictEqual(byLabel('Width at the top').status, 'optional');
  assert.strictEqual(byLabel('The left wall').status, 'missing');
  assert.strictEqual(byLabel('The left wall').screenId, 'wall-start');
  assert.strictEqual(byLabel('Floor').status, 'missing');
  assert.strictEqual(byLabel('Above the glass').status, 'optional');

  s.opening.startWall = { gapBottomMm: 6, gapMiddleMm: null, gapTopMm: 0 };
  s.opening.endWall = { gapBottomMm: 0, gapMiddleMm: null, gapTopMm: 0 };
  s.opening.runs[0] = { ...s.opening.runs[0], floorStartMm: 0, floorEndMm: 3, floorFallMm: 3, floorLowEnd: 'end' };
  const after = journeySummary(s);
  assert.match(after.find((r) => r.label === 'The left wall').value, /6mm out, leaning into the shower/);
  assert.strictEqual(after.find((r) => r.label === 'The right wall').value, 'Straight up');
  assert.strictEqual(after.find((r) => r.label === 'Floor').value, '3mm lower at the right wall');
});

test('the single-door summary lists the eight readings by number', () => {
  const s = design('alcove-door', 'laser', { isFloorToCeiling: true });
  const rows = journeySummary(s);
  assert.ok(rows.some((r) => r.label === '1. Left wall, at the bottom' && r.status === 'missing'));
  assert.ok(rows.some((r) => r.label === '8. Ceiling, on the right'));
  assert.ok(!journeySummary(design('alcove-door', 'laser')).some((r) => r.label.startsWith('7.')));
});
