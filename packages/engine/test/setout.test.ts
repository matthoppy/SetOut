/**
 * Setting the glass out: the gap from each pane to the floor, the ceiling,
 * the walls and the next pane, for the installation sheet. Worked from the
 * same lines the panes are cut to, so the sizes on the glass order and the
 * gaps on the installation sheet always add up to the opening.
 */
import { describe, expect, test } from 'vitest';
import {
  applyTemplate,
  buildSpec,
  createInitialState,
  DEFAULT_RULESET,
  setOutOf,
  shapesOf,
  TEMPLATES,
  type ConfiguratorState,
} from '../src';
import { GOLDEN_COMPANY, GOLDENS } from './goldens';

const context = { rules: DEFAULT_RULESET, companyName: GOLDEN_COMPANY };

/** A fixed panel on the left and a door hung from the right-hand wall, between two walls. */
function alcove(change: (s: ConfiguratorState) => ConfiguratorState = (s) => s): ConfiguratorState {
  const template = TEMPLATES.find((t) => t.id === 'alcove-panel-door');
  if (!template) throw new Error('no alcove template');
  return change(applyTemplate(createInitialState(10), template));
}

const run0 = (s: ConfiguratorState, patch: Partial<ConfiguratorState['opening']['runs'][number]>): ConfiguratorState => ({
  ...s,
  opening: { ...s.opening, runs: [{ ...s.opening.runs[0], ...patch }, ...s.opening.runs.slice(1)] },
});

describe('a square opening', () => {
  test('every gap is the deduction on that side', () => {
    const state = alcove();
    const spec = buildSpec(state, context);
    const { runs, panes } = setOutOf(state, spec, DEFAULT_RULESET.fixed);
    const [fixed, door] = panes;
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ label: 'The opening', panes: [0, 1], widthMm: 1100, floor: { startMm: 0, endMm: 0 }, ceiling: null });
    expect(fixed.left).toEqual({ meets: 'wall', bottomMm: spec.panels[0].deductions.horizontal.left, topMm: spec.panels[0].deductions.horizontal.left });
    // The door hangs off the right-hand wall, so its latch is against the fixed panel.
    expect(door.left).toEqual({ meets: 'glass', bottomMm: spec.panels[1].door!.swingDeductionMm, topMm: spec.panels[1].door!.swingDeductionMm });
    expect(fixed.right).toEqual(door.left);
    expect(door.right).toEqual({ meets: 'wall', bottomMm: spec.panels[1].deductions.horizontal.right, topMm: spec.panels[1].deductions.horizontal.right });
    for (const [i, pane] of panes.entries()) {
      expect(pane.floorGap).toEqual({ left: spec.panels[i].deductions.vertical.bottom, right: spec.panels[i].deductions.vertical.bottom });
      expect(pane.ceilingGap).toBeNull();
    }
    expect([fixed.fromMm, fixed.toMm, door.fromMm, door.toMm]).toEqual([0, 400, 400, 1100]);
  });
});

describe('a door hung from glass', () => {
  const hungFromPanel = (s: ConfiguratorState): ConfiguratorState => ({
    ...s,
    panels: s.panels.map((p) => (p.door ? { ...p, door: { ...p.door, hinge_side: 'left' as const } } : p)),
  });

  test('in line, the hinge keeps its gap and the latch has the rest, and the glass is the same size', () => {
    const state = alcove(hungFromPanel);
    const spec = buildSpec(state, context);
    const [fixed, door] = setOutOf(state, spec, DEFAULT_RULESET.fixed).panes;
    const hinge = DEFAULT_RULESET.fixed.hinges.glassToGlassGapMm;
    const swing = spec.panels[1].door!.swingDeductionMm;
    expect(hinge).toBe(3);
    expect(fixed.right).toEqual({ meets: 'glass', bottomMm: hinge, topMm: hinge });
    expect(door.left).toEqual(fixed.right);
    expect(door.right.bottomMm).toBe(swing - hinge + spec.panels[1].deductions.horizontal.right);
    expect(door.corners.bottomRight.x - door.corners.bottomLeft.x).toBe(spec.panels[1].cutWidthMm);
  });

  test('never more than the door’s own deduction', () => {
    const state = alcove(hungFromPanel);
    const spec = buildSpec(state, context);
    const wide = { ...DEFAULT_RULESET.fixed, hinges: { ...DEFAULT_RULESET.fixed.hinges, glassToGlassGapMm: 20 } };
    const [, door] = setOutOf(state, spec, wide).panes;
    expect(door.left.bottomMm).toBe(spec.panels[1].door!.swingDeductionMm);
    expect(door.right.bottomMm).toBe(spec.panels[1].deductions.horizontal.right);
  });

  test('hung from a wall, or from glass round a corner, the latch has all of it', () => {
    // The alcove's door hangs from the right-hand wall: its latch is against the fixed panel.
    const square = alcove();
    const squareSpec = buildSpec(square, context);
    const fromWall = setOutOf(square, squareSpec, DEFAULT_RULESET.fixed).panes[1];
    expect(fromWall.left.bottomMm).toBe(squareSpec.panels[1].door!.swingDeductionMm);
    expect(fromWall.right.bottomMm).toBe(squareSpec.panels[1].deductions.horizontal.right);

    // A door hung from the return round the corner: its latch is at the wall.
    const golden = GOLDENS.find((g) => g.name === 'layout-corner-door-return');
    if (!golden) throw new Error('missing golden');
    const design = structuredClone(golden.document.design);
    const doorAt = design.panels.findIndex((p) => p.kind === 'door');
    const towardsReturn: 'left' | 'right' = doorAt > 0 && design.junctions[doorAt - 1]?.angle_deg === 90 ? 'left' : 'right';
    const offReturn: ConfiguratorState = {
      ...design,
      panels: design.panels.map((p) => (p.door ? { ...p, door: { ...p.door, hinge_side: towardsReturn } } : p)),
    };
    const spec = buildSpec(offReturn, context);
    const door = setOutOf(offReturn, spec, DEFAULT_RULESET.fixed).panes[doorAt];
    const [hinge, latch] = towardsReturn === 'left' ? [door.left, door.right] : [door.right, door.left];
    expect(hinge.meets).toBe('corner');
    const wall = towardsReturn === 'left' ? spec.panels[doorAt].deductions.horizontal.right : spec.panels[doorAt].deductions.horizontal.left;
    expect(latch).toMatchObject({ meets: 'wall', bottomMm: spec.panels[doorAt].door!.swingDeductionMm + wall });
  });
});

describe('the walls', () => {
  test('a pane following a leaning wall keeps its gap all the way up', () => {
    const state = alcove((s) => ({ ...s, opening: { ...s.opening, startWall: { gapBottomMm: 350, gapMiddleMm: null, gapTopMm: 356 } } }));
    const spec = buildSpec(state, context);
    const { runs, panes } = setOutOf(state, spec, DEFAULT_RULESET.fixed);
    expect(runs[0].start).toMatchObject({ meets: 'wall', leanMm: -6 });
    expect(panes[0].left).toEqual({ meets: 'wall', bottomMm: 10, topMm: 10 });
    // It leans out, so the top corner is further out than the bottom one.
    expect(panes[0].corners.topLeft.x).toBeLessThan(panes[0].corners.bottomLeft.x);
  });

  test('a plumb door beside a leaning wall has a different gap at the top', () => {
    const state = alcove((s) => ({ ...s, opening: { ...s.opening, endWall: { gapBottomMm: 350, gapMiddleMm: null, gapTopMm: 347 } } }));
    const spec = buildSpec(state, context);
    const { runs, panes } = setOutOf(state, spec, DEFAULT_RULESET.fixed);
    expect(runs[0].end).toMatchObject({ meets: 'wall', leanMm: 3 });
    const door = panes[1];
    expect(door.right.bottomMm).toBe(5);
    // The wall leans in 3mm over the glass height; the door's top is a little below it.
    const up = (door.corners.topRight.y - door.corners.bottomRight.y) / state.heightMm;
    expect(door.right.topMm).toBe(Math.round(5 - 3 * up));
    expect(door.right.topMm).toBeLessThan(door.right.bottomMm!);
  });
});

describe('the floor', () => {
  test('a fixed pane follows the floor and a door stays square, so the door’s gap takes the fall', () => {
    const state = alcove((s) => run0(s, { floorFallMm: 6, floorLowEnd: 'end' }));
    const spec = buildSpec(state, context);
    const { runs, panes } = setOutOf(state, spec, DEFAULT_RULESET.fixed);
    expect(runs[0].floor).toEqual({ startMm: 0, endMm: -6 });
    const [fixed, door] = panes;
    expect(fixed.floorGap).toEqual({ left: 10, right: 10 });
    // The floor falls 6mm over 1100; the door spans 405 to 1095 of it.
    expect(door.floorGap).toEqual({ left: Math.round(10 + (6 * 405) / 1100), right: Math.round(10 + (6 * 1095) / 1100) });
  });
});

describe('the ceiling', () => {
  test('glass to a sloping ceiling keeps its top gap along it', () => {
    const state = alcove((s) => run0({ ...s, isFloorToCeiling: true }, { ceilingStartMm: 2000, ceilingEndMm: 2008 }));
    const spec = buildSpec(state, context);
    const { runs, panes } = setOutOf(state, spec, DEFAULT_RULESET.fixed);
    expect(runs[0].ceiling).toEqual({ startMm: 2000, endMm: 2008 });
    expect(panes[0].ceilingGap).toEqual({ left: spec.panels[0].deductions.vertical.top, right: spec.panels[0].deductions.vertical.top });
  });

  test('glass that stops short of the ceiling has no top gap, even where the ceiling was measured', () => {
    const state = alcove((s) => run0(s, { ceilingStartMm: 2300, ceilingEndMm: 2300 }));
    const spec = buildSpec(state, context);
    const { runs, panes } = setOutOf(state, spec, DEFAULT_RULESET.fixed);
    expect(runs[0].ceiling).toEqual({ startMm: 2300, endMm: 2300 });
    expect(panes.every((p) => p.ceilingGap === null)).toBe(true);
  });

  test('a door under a transom has none either: there is a transom between it and the ceiling', () => {
    const golden = GOLDENS.find((g) => g.name === 'panel-door-to-ceiling-transom-glass');
    if (!golden) throw new Error('missing golden');
    const spec = buildSpec(structuredClone(golden.document.design), context);
    const [fixed, door] = setOutOf(golden.document.design, spec, DEFAULT_RULESET.fixed).panes;
    expect(fixed.ceilingGap).not.toBeNull();
    expect(door.ceilingGap).toBeNull();
  });
});

describe('corners and open ends', () => {
  test('a walk-in’s open end and a corner are named, with no gap given', () => {
    const golden = GOLDENS.find((g) => g.name === 'layout-walk-in-return');
    if (!golden) throw new Error('missing golden');
    const spec = buildSpec(structuredClone(golden.document.design), context);
    const { runs, panes } = setOutOf(golden.document.design, spec, DEFAULT_RULESET.fixed);
    expect(runs.map((r) => [r.start.meets, r.end.meets])).toEqual([
      ['wall', 'corner'],
      ['corner', 'open'],
    ]);
    expect(panes[0].right).toEqual({ meets: 'corner', bottomMm: null, topMm: null });
    expect(panes[1].left).toEqual({ meets: 'corner', bottomMm: null, topMm: null });
    expect(panes[1].right).toEqual({ meets: 'open', bottomMm: null, topMm: null });
  });
});

describe('every known design', () => {
  test.each(GOLDENS.map((g) => [g.name, g] as const))('%s: stands where its glass is cut, and every gap adds up', (_name, golden) => {
    const design = golden.document.design;
    const spec = buildSpec(structuredClone(design), context);
    const { runs, panes } = setOutOf(design, spec, DEFAULT_RULESET.fixed);
    const shapes = shapesOf(design, spec, DEFAULT_RULESET.fixed);
    expect(panes).toHaveLength(spec.panels.length);
    expect(runs.flatMap((r) => r.panes).sort((a, b) => a - b)).toEqual(spec.panels.map((_, i) => i));

    panes.forEach((pane, i) => {
      // The same corners as the pane is cut to, wherever it stands.
      const all = Object.values(pane.corners);
      const minX = Math.min(...all.map((c) => c.x));
      const minY = Math.min(...all.map((c) => c.y));
      for (const key of ['bottomLeft', 'bottomRight', 'topRight', 'topLeft'] as const) {
        expect(Math.abs(pane.corners[key].x - minX - shapes[i].corners[key].x)).toBeLessThanOrEqual(1);
        expect(Math.abs(pane.corners[key].y - minY - shapes[i].corners[key].y)).toBeLessThanOrEqual(1);
      }
      // Nothing is set out into a wall, the floor, the ceiling or the next pane.
      for (const gap of [pane.left.bottomMm, pane.left.topMm, pane.right.bottomMm, pane.right.topMm]) if (gap !== null) expect(gap).toBeGreaterThanOrEqual(0);
      expect(pane.floorGap.left).toBeGreaterThanOrEqual(0);
      expect(pane.floorGap.right).toBeGreaterThanOrEqual(0);
      if (pane.ceilingGap) expect(Math.min(pane.ceilingGap.left, pane.ceilingGap.right)).toBeGreaterThanOrEqual(0);
    });

    // Along the floor, a run between two plumb walls is its glass and its gaps.
    for (const run of runs) {
      if (run.start.meets !== 'wall' || run.end.meets !== 'wall' || run.start.leanMm !== 0 || run.end.leanMm !== 0) continue;
      const first = panes[run.panes[0]];
      const glass = run.panes.reduce((sum, i) => sum + (panes[i].corners.bottomRight.x - panes[i].corners.bottomLeft.x), 0);
      const between = run.panes.slice(1).reduce((sum, i) => sum + (panes[i].left.bottomMm ?? 0), 0);
      expect(Math.round((first.left.bottomMm ?? 0) + glass + between + (panes[run.panes[run.panes.length - 1]].right.bottomMm ?? 0))).toBe(run.widthMm);
    }
  });
});
