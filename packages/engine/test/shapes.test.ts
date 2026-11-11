/**
 * Panes cut to the shape of the opening, by Matt's rules of 11 November 2026.
 * A wrong shape is a pane in the skip, so each rule is tried on its own, and
 * a square opening must give back the spec's own rectangles exactly.
 */
import { describe, expect, test } from 'vitest';
import {
  applyTemplate,
  buildSpec,
  createInitialState,
  DEFAULT_RULESET,
  shapesOf,
  TEMPLATES,
  type ConfiguratorState,
  type PaneShape,
} from '../src';
import { GOLDEN_COMPANY, GOLDENS } from './goldens';

const context = { rules: DEFAULT_RULESET, companyName: GOLDEN_COMPANY };

/** A fixed panel on the left and a door hung from it, between two walls. */
function alcove(change: (s: ConfiguratorState) => ConfiguratorState = (s) => s): ConfiguratorState {
  const template = TEMPLATES.find((t) => t.id === 'alcove-panel-door');
  if (!template) throw new Error('no alcove template');
  const state = applyTemplate(createInitialState(10), template);
  const fixed = state.panels.find((p) => p.kind === 'fixed')!;
  const door = state.panels.find((p) => p.kind === 'door')!;
  return change({ ...state, panels: [fixed, { ...door, door: { ...door.door!, hinge_side: 'left' } }] });
}

const run0 = (s: ConfiguratorState, patch: Partial<ConfiguratorState['opening']['runs'][number]>): ConfiguratorState => ({
  ...s,
  opening: { ...s.opening, runs: [{ ...s.opening.runs[0], ...patch }, ...s.opening.runs.slice(1)] },
});

const sizes = (shape: PaneShape) => [shape.widthMm, shape.heightMm];

describe('a square opening', () => {
  test.each(GOLDENS.map((g) => [g.name, g] as const))('%s: every corner on its rectangle, and a square pane is the spec’s own', (_name, golden) => {
    const spec = buildSpec(structuredClone(golden.document.design), context);
    const shapes = shapesOf(golden.document.design, spec);
    shapes.forEach((shape, i) => {
      for (const c of Object.values(shape.corners)) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThanOrEqual(shape.widthMm);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeLessThanOrEqual(shape.heightMm);
      }
      if (!shape.shaped) expect(sizes(shape)).toEqual([spec.panels[i].cutWidthMm, spec.panels[i].cutHeightMm]);
    });
  });

  test('is the spec’s own rectangles, exactly', () => {
    const state = alcove();
    const spec = buildSpec(state, context);
    const shapes = shapesOf(state, spec);
    expect(shapes.map(sizes)).toEqual(spec.panels.map((p) => [p.cutWidthMm, p.cutHeightMm]));
    expect(shapes.every((s) => !s.shaped)).toBe(true);
  });
});

describe('the walls', () => {
  test('a wall leaning in moves the top corner in, and the rectangle stays as it was', () => {
    const state = alcove((s) => ({ ...s, opening: { ...s.opening, startWall: { gapBottomMm: 353, gapMiddleMm: null, gapTopMm: 350 } } }));
    const spec = buildSpec(state, context);
    const [fixed, door] = shapesOf(state, spec);
    expect(fixed.shaped).toBe(true);
    expect(fixed.corners.bottomLeft).toEqual({ x: 0, y: 0 });
    expect(fixed.corners.topLeft.x).toBe(3);
    expect(fixed.widthMm).toBe(spec.panels[0].cutWidthMm);
    // The door hangs plumb, off the fixed panel's plumb edge.
    expect(door.shaped).toBe(false);
  });

  test('a wall leaning out makes the pane bigger, to follow it', () => {
    const state = alcove((s) => ({ ...s, opening: { ...s.opening, startWall: { gapBottomMm: 350, gapMiddleMm: null, gapTopMm: 353 } } }));
    const spec = buildSpec(state, context);
    const [fixed] = shapesOf(state, spec);
    expect(fixed.widthMm).toBe(spec.panels[0].cutWidthMm + 3);
    expect(fixed.corners.bottomLeft.x).toBe(3);
    expect(fixed.corners.topLeft.x).toBe(0);
    expect(fixed.heightMm).toBe(spec.panels[0].cutHeightMm);
  });
});

describe('the floor', () => {
  test('a fixed pane’s bottom follows the floor and its top stays level, so it is taller at the low end', () => {
    const state = alcove((s) => run0(s, { floorFallMm: 6, floorLowEnd: 'end' }));
    const spec = buildSpec(state, context);
    const [fixed, door] = shapesOf(state, spec);
    const runWidth = spec.panels[0].tightWidthMm + spec.panels[1].tightWidthMm;
    const drop = Math.round((6 * spec.panels[0].tightWidthMm) / runWidth);
    expect(fixed.corners.bottomRight.y).toBe(0);
    expect(fixed.corners.bottomLeft.y).toBe(drop);
    expect(fixed.corners.topLeft.y).toBe(fixed.corners.topRight.y);
    expect(fixed.heightMm).toBe(spec.panels[0].cutHeightMm + drop);
    // The spec's bottom edge is where the floor is highest, so it sits that far up.
    expect(fixed.specBottomMm).toBe(drop);
    // Below a level top, a door stays square and its gap takes the slope.
    expect(door.shaped).toBe(false);
    expect(sizes(door)).toEqual([spec.panels[1].cutWidthMm, spec.panels[1].cutHeightMm]);
  });

  test('the fall runs the other way too', () => {
    const state = alcove((s) => run0(s, { floorFallMm: 6, floorLowEnd: 'start' }));
    const spec = buildSpec(state, context);
    const [fixed] = shapesOf(state, spec);
    expect(fixed.corners.bottomLeft.y).toBe(0);
    expect(fixed.corners.bottomRight.y).toBeGreaterThan(0);
    expect(fixed.corners.topLeft.y).toBe(fixed.corners.topRight.y);
  });
});

describe('the ceiling', () => {
  const toCeiling = (s: ConfiguratorState) => run0({ ...s, isFloorToCeiling: true }, { ceilingStartMm: 2000, ceilingEndMm: 2008 });

  test('a fixed pane’s top follows a sloping ceiling', () => {
    const state = alcove(toCeiling);
    const spec = buildSpec(state, context);
    const [fixed] = shapesOf(state, spec);
    const runWidth = spec.panels[0].tightWidthMm + spec.panels[1].tightWidthMm;
    expect(fixed.corners.topRight.y - fixed.corners.topLeft.y).toBe(Math.round((8 * spec.panels[0].tightWidthMm) / runWidth));
    expect(fixed.corners.bottomLeft.y).toBe(fixed.corners.bottomRight.y);
  });

  test('a door to the ceiling rakes top and bottom, and its sides stay plumb', () => {
    const state = alcove((s) => run0(toCeiling(s), { floorFallMm: 4, floorLowEnd: 'end' }));
    const spec = buildSpec(state, context);
    const [, door] = shapesOf(state, spec);
    expect(door.shaped).toBe(true);
    expect(door.corners.topLeft.x).toBe(door.corners.bottomLeft.x);
    expect(door.corners.topRight.x).toBe(door.corners.bottomRight.x);
    expect(door.corners.topRight.y).not.toBe(door.corners.topLeft.y);
    expect(door.corners.bottomRight.y).not.toBe(door.corners.bottomLeft.y);
    expect(door.widthMm).toBe(spec.panels[1].cutWidthMm);
  });
});

describe('a known design with a sloping ceiling', () => {
  test('each return follows its own run’s ceiling, not the highest in the shower', () => {
    const golden = GOLDENS.find((g) => g.name === 'three-sided-to-sloping-ceiling');
    if (!golden) throw new Error('missing golden');
    const spec = buildSpec(structuredClone(golden.document.design), context);
    const [left, door, right] = shapesOf(golden.document.design, spec);
    // Left return: ceiling 2390 falling to 2382, less 12 at the top and 12 at the bottom.
    expect(left.heightMm).toBe(2390 - 24);
    expect(Math.abs(left.corners.topLeft.y - left.corners.topRight.y)).toBe(8);
    // Front: level at 2382. The door is square.
    expect(door.shaped).toBe(false);
    // Right return: ceiling 2382 falling to 2371. The spec's rectangle, cut
    // to the shower's highest ceiling, is 8mm taller than this pane can be.
    expect(right.heightMm).toBe(2382 - 24);
    expect(spec.panels[2].cutHeightMm).toBe(2390 - 24);
    expect(Math.abs(right.corners.topLeft.y - right.corners.topRight.y)).toBe(11);
  });
});
