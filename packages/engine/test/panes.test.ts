/**
 * Where each cut-out is on each pane. A cut-out on the wrong edge is a pane
 * of toughened glass in the skip, so the heights are held to the spec's own,
 * for every known design, and the edges to the door each one serves.
 */
import { describe, expect, test } from 'vitest';
import {
  applyTemplate,
  buildSpec,
  createInitialState,
  DEFAULT_RULESET,
  panesOf,
  shapesOf,
  STANDARD_HINGES,
  TEMPLATES,
  type ConfiguratorState,
  type Pane,
  type PaneFeature,
  type PaneFeatureRole,
} from '../src';
import { GOLDEN_COMPANY, GOLDENS } from './goldens';

const context = { rules: DEFAULT_RULESET, companyName: GOLDEN_COMPANY };
const fixed = DEFAULT_RULESET.fixed;

/** The edges a pane's cut-outs for one purpose are on. */
const sides = (pane: Pane, role: PaneFeatureRole) => pane.features.flatMap((f) => (f.kind !== 'corner' && f.role === role ? [f.side] : []));

describe.each(GOLDENS)('$name', (golden) => {
  test('every cut-out the spec has, at the spec’s own place on the glass, and a knob’s hole', () => {
    const spec = buildSpec(structuredClone(golden.document.design), context);
    const panes = panesOf(golden.document.design, spec, fixed);
    const shapes = shapesOf(golden.document.design, spec, DEFAULT_RULESET.fixed);
    expect(panes.map((p) => [p.id, p.widthMm, p.heightMm])).toEqual(shapes.map((s) => [s.id, s.widthMm, s.heightMm]));
    spec.panels.forEach((panel, i) => {
      const heights = (list: number[]) => [...list].map((h) => Math.round(h * 10) / 10).sort((a, b) => a - b);
      // Back from the corner of its edge to the spec's own bottom edge.
      const back = (f: Exclude<PaneFeature, { kind: 'corner' }>) =>
        f.centreMm + (f.side === 'left' ? shapes[i].corners.bottomLeft.y : shapes[i].corners.bottomRight.y) - shapes[i].specBottomMm;
      // A hinge's pair of holes stands for the one cut-out the spec lists, at their middle.
      const hingeHoles = panes[i].features.filter((f) => f.kind === 'hole' && f.role === 'panel-hinge');
      const pairs = hingeHoles.flatMap((f, j) => (j % 2 === 0 && f.kind !== 'corner' && hingeHoles[j + 1]?.kind === 'hole' ? [(back(f) + back(hingeHoles[j + 1] as typeof f)) / 2] : []));
      const asSpec = panes[i].features.flatMap((f) => (f.kind === 'corner' || f.role === 'knob' || (f.kind === 'hole' && f.role === 'panel-hinge') ? [] : [back(f)]));
      expect(heights([...asSpec, ...pairs])).toEqual(heights(panel.cutouts.map((c) => c.heightMm)));
      // The spec lists no hole for a knob; the glass has one, at the knob's height.
      const knob = panes[i].features.filter((f) => f.kind === 'hole' && f.role === 'knob');
      expect(knob.map((f) => (f.kind === 'corner' ? 0 : back(f)))).toEqual(
        panel.door && golden.document.design.handleId === 'knob' ? [panel.door.handlePlacement.handleHeight] : []
      );
      expect(panes[i].features.filter((f) => f.kind === 'corner')).toHaveLength(panel.notches.length);
    });
  });
});

/** A fixed panel and a door, as the alcove template has them, hinged on the given side. */
function panelAndDoor(hingeSide: 'left' | 'right', handleId = 'pull'): ConfiguratorState {
  const template = TEMPLATES.find((t) => t.id === 'alcove-panel-door');
  if (!template) throw new Error('no alcove template');
  const state = applyTemplate(createInitialState(10), template);
  const doorIndex = state.panels.findIndex((p) => p.kind === 'door');
  const panels = state.panels.map((p) => (p.kind === 'door' ? { ...p, door: { ...p.door!, hinge_side: hingeSide } } : p));
  // Put the fixed panel on the side the door hangs from.
  const fixedPanel = panels.find((p) => p.kind === 'fixed')!;
  const door = panels[doorIndex];
  return { ...state, handleId, panels: hingeSide === 'left' ? [fixedPanel, door] : [door, fixedPanel] };
}

describe('the edges', () => {
  test('a door hung on its left, from the panel to its left', () => {
    const state = panelAndDoor('left');
    const [panel, door] = panesOf(state, buildSpec(state, context), fixed);
    expect(new Set(sides(door, 'door-hinge'))).toEqual(new Set(['left']));
    expect(new Set(sides(door, 'handle'))).toEqual(new Set(['right']));
    expect(new Set(sides(panel, 'panel-hinge'))).toEqual(new Set(['right']));
    // On the door the stamp is on its hinge side, 50 in; on the panel, away from its hinges, 59 in.
    expect(door.stamp).toEqual({ corner: 'bottom-left', inMm: 50, upMm: 5 });
    expect(panel.stamp).toEqual({ corner: 'bottom-left', inMm: 59, upMm: 5 });
  });

  test('a door hung on its right is the mirror of it', () => {
    const state = panelAndDoor('right');
    const [door, panel] = panesOf(state, buildSpec(state, context), fixed);
    expect(new Set(sides(door, 'door-hinge'))).toEqual(new Set(['right']));
    expect(new Set(sides(door, 'handle'))).toEqual(new Set(['left']));
    expect(new Set(sides(panel, 'panel-hinge'))).toEqual(new Set(['left']));
    expect(door.stamp).toEqual({ corner: 'bottom-right', inMm: 50, upMm: 5 });
    expect(panel.stamp).toEqual({ corner: 'bottom-right', inMm: 59, upMm: 5 });
  });
});

/** The door in the alcove made so wide that a heavier hinge carries it. */
const widened = (state: ConfiguratorState, widthMm: number): ConfiguratorState => ({
  ...state,
  panels: state.panels.map((p) => (p.kind === 'door' ? { ...p, width_mm: widthMm } : p)),
});

describe('each hinge is cut to its own template', () => {
  test('a Geneva door hung in line: CRL’s notch with its ears, in the door and in the panel it hangs from', () => {
    const state = panelAndDoor('left', 'knob');
    const spec = buildSpec(state, context);
    expect(spec.panels[1].door!.hingeBrand).toBe('Geneva');
    const [panel, door] = panesOf(state, spec, fixed);
    const template = fixed.hinges.cutouts.geneva;
    const notches = door.features.filter((f) => f.kind === 'notch');
    expect(notches).toHaveLength(spec.panels[1].door!.hingeCount);
    const eared = { depthMm: 44, heightMm: 63, ears: { diameterMm: 16, inMm: 38, apartMm: 57 }, hinge: 'Gen - G/G' };
    expect(notches[0]).toMatchObject({ role: 'door-hinge', ...eared, name: template.door!.name, source: template.door!.source });
    // The same hinge either side: the same cut-out in the panel, at the spec's own mating heights.
    const mates = panel.features.filter((f) => f.kind === 'notch');
    expect(mates).toHaveLength(spec.panels[1].door!.hingeCount);
    expect(mates[0]).toMatchObject({ role: 'panel-hinge', ...eared });
    expect(panel.features.some((f) => f.kind === 'hole')).toBe(false);
    // A knob goes through one hole at its own height.
    expect(door.features.filter((f) => f.kind === 'hole')).toEqual([
      {
        kind: 'hole',
        role: 'knob',
        template: 'knob',
        name: 'Knob hole',
        source: 'SetOut',
        hinge: null,
        side: 'right',
        centreMm: spec.panels[1].door!.handlePlacement.handleHeight,
        insetMm: fixed.handle.holeInsetMm,
        diameterMm: fixed.handle.holeDiameterMm,
        apartMm: null,
      },
    ]);
    expect(spec.panels[1].door!.handlePlacement.handleHeight).toBe(fixed.handle.knobCentreMm);
  });

  test('a Geneva door hung round a corner: two 16mm holes in the panel, 57 apart, either side of the spec’s mating height', () => {
    const golden = GOLDENS.find((g) => g.name === 'layout-three-sided');
    if (!golden) throw new Error('missing golden');
    const design = structuredClone(golden.document.design);
    const spec = buildSpec(design, context);
    const doorAt = spec.panels.findIndex((p) => p.door);
    const hangsFrom = spec.panels[doorAt].door!.hingeSide === 'left' ? doorAt - 1 : doorAt + 1;
    expect(spec.panels[doorAt].door!.hingeBrand).toBe('Geneva');
    const panes = panesOf(design, spec, fixed);
    const holes = panes[hangsFrom].features.filter((f) => f.kind === 'hole');
    expect(holes).toHaveLength(2 * spec.panels[doorAt].door!.hingeCount);
    expect(holes.every((h) => h.kind === 'hole' && h.diameterMm === 16 && h.insetMm === 37 && h.apartMm === 57 && h.hinge === 'Gen - G/G - 90°')).toBe(true);
    const centres = holes.map((h) => (h.kind === 'hole' ? h.centreMm : 0));
    expect(centres[1] - centres[0]).toBe(57);
    expect(panes[hangsFrom].features.some((f) => f.kind === 'notch')).toBe(false);
  });

  test('a door hung from the wall is named for it, and cut to the same template', () => {
    const template = TEMPLATES.find((t) => t.id === 'alcove-panel-door');
    if (!template) throw new Error('no alcove template');
    const state = applyTemplate(createInitialState(10), template);
    const spec = buildSpec(state, context);
    const door = panesOf(state, spec, fixed)[1];
    expect(door.features.find((f) => f.kind === 'notch')).toMatchObject({ hinge: 'Gen - G/W', heightMm: 63 });
  });

  test('a Vienna door hung in line: CRL’s V1E037 notch in the door and the panel', () => {
    const state = widened(panelAndDoor('left'), 800);
    const spec = buildSpec(state, context);
    expect(spec.panels[1].door!.hingeBrand).toBe('Vienna');
    const [panel, door] = panesOf(state, spec, fixed);
    const eared = { heightMm: 76, depthMm: 46, ears: { diameterMm: 16, inMm: 40, apartMm: 70 }, hinge: 'Vienna - G/G' };
    expect(door.features.find((f) => f.kind === 'notch')).toMatchObject(eared);
    expect(panel.features.find((f) => f.kind === 'notch')).toMatchObject({ role: 'panel-hinge', ...eared });
  });

  test('a Bellagio door: CRL Europe’s notch, 58 high and 47 deep, and the panel’s 52 by 33, both with 6mm corners', () => {
    const state = widened(panelAndDoor('left'), 950);
    const spec = buildSpec(state, context);
    expect(spec.panels[1].door!.hingeBrand).toBe('Bellagio');
    const [panel, door] = panesOf(state, spec, fixed);
    const doorNotch = door.features.find((f) => f.kind === 'notch');
    expect(doorNotch).toMatchObject({ hinge: 'Bel - G/G', heightMm: 58, depthMm: 47, radiusMm: 6, ears: null });
    expect(doorNotch?.kind === 'notch' && doorNotch.source).toContain('CRL Europe');
    expect(panel.features.find((f) => f.kind === 'notch')).toMatchObject({ role: 'panel-hinge', hinge: 'Bel - G/G', heightMm: 52, depthMm: 33, radiusMm: 6 });
  });

  test('a Vienna door cut rectangular: the same 76 by 46, with 12mm holes at its inner corners instead of the ears', () => {
    const state = widened(panelAndDoor('left'), 800);
    const spec = buildSpec(state, context);
    expect(spec.panels[1].door!.hingeBrand).toBe('Vienna');
    const rectangular = { heightMm: 76, depthMm: 46, radiusMm: 6, ears: null, name: 'Vienna hinge notch, rectangular, standard' };
    // The company's standard, or the shower's own choice.
    for (const [design, standards] of [
      [state, { ...STANDARD_HINGES, viennaCutout: 'rectangular' as const }],
      [{ ...state, viennaCutout: 'rectangular' as const }, STANDARD_HINGES],
    ] as const) {
      const [panel, door] = panesOf(design, spec, fixed, standards);
      expect(door.features.find((f) => f.kind === 'notch')).toMatchObject(rectangular);
      expect(panel.features.find((f) => f.kind === 'notch')).toMatchObject({ role: 'panel-hinge', ...rectangular });
    }
  });

  test('a hinge whose cut-out has not been checked against CRL’s drawing of it is named for itself and marked to check', () => {
    const template = TEMPLATES.find((t) => t.id === 'alcove-panel-door');
    if (!template) throw new Error('no alcove template');
    const state = applyTemplate(createInitialState(10), template);
    const spec = buildSpec(state, context);
    expect(spec.panels[1].door!.hingeBrand).toBe('Geneva');
    const notch = (wallHinge: 'offset' | 'full' | 'short' | 'h-plate') => panesOf({ ...state, wallHinge }, spec, fixed)[1].features.find((f) => f.kind === 'notch');
    // CRL's GEN037 and GEN044 drawings show the Geneva cut-out.
    expect(notch('offset')).toMatchObject({ name: 'Geneva hinge notch', heightMm: 63 });
    expect(notch('full')?.kind === 'notch' && notch('full')?.source).toBeTruthy();
    // No drawing of the short back plate or the H plate: the same notch, marked.
    expect(notch('short')).toMatchObject({ name: 'Geneva hinge notch, short back plate', source: null, heightMm: 63 });
    expect(notch('h-plate')).toMatchObject({ name: 'Geneva hinge notch, H wall plate', source: null });
    // Each gets its own template letter, so the glass order draws it apart.
    expect(notch('short')?.kind === 'notch' && notch('short')?.template).not.toBe(notch('offset')?.kind === 'notch' && notch('offset')?.template);
  });
});
