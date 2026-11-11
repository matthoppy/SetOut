/**
 * Where each cut-out is on each pane. A cut-out on the wrong edge is a pane
 * of toughened glass in the skip, so the heights are held to the spec's own,
 * for every known design, and the edges to the door each one serves.
 */
import { describe, expect, test } from 'vitest';
import { applyTemplate, buildSpec, createInitialState, DEFAULT_RULESET, panesOf, shapesOf, TEMPLATES, type ConfiguratorState, type Pane, type PaneFeature } from '../src';
import { GOLDEN_COMPANY, GOLDENS } from './goldens';

const context = { rules: DEFAULT_RULESET, companyName: GOLDEN_COMPANY };
const fixed = DEFAULT_RULESET.fixed;

/** The edges a pane's notches or holes are on. */
const sides = (pane: Pane, kind: 'notch' | 'hole') => pane.features.flatMap((f) => (f.kind === kind ? [f.side] : []));

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
      const asSpec = panes[i].features.flatMap((f) => (f.kind === 'corner' || (f.kind === 'hole' && f.template === 'knob') ? [] : [back(f)]));
      expect(heights(asSpec)).toEqual(heights(panel.cutouts.map((c) => c.heightMm)));
      // The spec lists no hole for a knob; the glass has one, at the knob's height.
      const knob = panes[i].features.filter((f) => f.kind === 'hole' && f.template === 'knob');
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
    expect(new Set(sides(door, 'notch'))).toEqual(new Set(['left']));
    expect(new Set(sides(door, 'hole'))).toEqual(new Set(['right']));
    expect(sides(panel, 'notch')).toEqual(['right', 'right']);
    // On the door the stamp is on its hinge side, 50 in; on the panel, away from its hinges, 59 in.
    expect(door.stamp).toEqual({ corner: 'bottom-left', inMm: 50, upMm: 5 });
    expect(panel.stamp).toEqual({ corner: 'bottom-left', inMm: 59, upMm: 5 });
  });

  test('a door hung on its right is the mirror of it', () => {
    const state = panelAndDoor('right');
    const [door, panel] = panesOf(state, buildSpec(state, context), fixed);
    expect(new Set(sides(door, 'notch'))).toEqual(new Set(['right']));
    expect(new Set(sides(door, 'hole'))).toEqual(new Set(['left']));
    expect(sides(panel, 'notch')).toEqual(['left', 'left']);
    expect(door.stamp).toEqual({ corner: 'bottom-right', inMm: 50, upMm: 5 });
    expect(panel.stamp).toEqual({ corner: 'bottom-right', inMm: 59, upMm: 5 });
  });

  test('the hinge notches are the rules’ sizes, and a knob goes through one hole at its own height', () => {
    const state = panelAndDoor('left', 'knob');
    const spec = buildSpec(state, context);
    const [panel, door] = panesOf(state, spec, fixed);
    expect(door.features.filter((f) => f.kind === 'hole')).toEqual([
      {
        kind: 'hole',
        template: 'knob',
        side: 'right',
        centreMm: spec.panels[1].door!.handlePlacement.handleHeight,
        insetMm: fixed.handle.holeInsetMm,
        diameterMm: fixed.handle.holeDiameterMm,
      },
    ]);
    expect(spec.panels[1].door!.handlePlacement.handleHeight).toBe(fixed.handle.knobCentreMm);
    const doorNotch = door.features.find((f) => f.kind === 'notch');
    expect(doorNotch).toMatchObject({ template: 'door-hinge', depthMm: 58, heightMm: 47, radiusMm: 8 });
    expect(panel.features.find((f) => f.kind === 'notch')).toMatchObject({ template: 'fixed-hinge', depthMm: 52, heightMm: 33, radiusMm: 8 });
  });
});
