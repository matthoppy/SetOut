/**
 * Where each cut-out is on each pane. A cut-out on the wrong edge is a pane
 * of toughened glass in the skip, so the heights are held to the spec's own,
 * for every known design, and the edges to the door each one serves.
 */
import { describe, expect, test } from 'vitest';
import { applyTemplate, buildSpec, createInitialState, DEFAULT_RULESET, panesOf, TEMPLATES, type ConfiguratorState, type Pane } from '../src';
import { GOLDEN_COMPANY, GOLDENS } from './goldens';

const context = { rules: DEFAULT_RULESET, companyName: GOLDEN_COMPANY };
const fixed = DEFAULT_RULESET.fixed;

/** The edges a pane's notches or holes are on. */
const sides = (pane: Pane, kind: 'notch' | 'hole') => pane.features.flatMap((f) => (f.kind === kind ? [f.side] : []));
/** The heights of a pane's notches and holes. */
const centres = (pane: Pane) => pane.features.flatMap((f) => (f.kind === 'corner' ? [] : [f.centreMm]));

describe.each(GOLDENS)('$name', (golden) => {
  test('every cut-out the spec has, at the spec’s own height, and nothing else', () => {
    const spec = buildSpec(structuredClone(golden.document.design), context);
    const panes = panesOf(golden.document.design, spec, fixed);
    expect(panes.map((p) => [p.id, p.widthMm, p.heightMm])).toEqual(spec.panels.map((p) => [p.id, p.cutWidthMm, p.cutHeightMm]));
    spec.panels.forEach((panel, i) => {
      const heights = (list: number[]) => [...list].sort((a, b) => a - b);
      expect(heights(centres(panes[i]))).toEqual(
        heights(panel.cutouts.map((c) => c.heightMm))
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
    // The stamp keeps away from the hinges on each pane.
    expect(door.stamp).toBe('bottom-right');
    expect(panel.stamp).toBe('bottom-left');
  });

  test('a door hung on its right is the mirror of it', () => {
    const state = panelAndDoor('right');
    const [door, panel] = panesOf(state, buildSpec(state, context), fixed);
    expect(new Set(sides(door, 'notch'))).toEqual(new Set(['right']));
    expect(new Set(sides(door, 'hole'))).toEqual(new Set(['left']));
    expect(sides(panel, 'notch')).toEqual(['left', 'left']);
    expect(door.stamp).toBe('bottom-left');
    expect(panel.stamp).toBe('bottom-right');
  });

  test('the hinge notches are the rules’ sizes, and a knob takes no handle holes', () => {
    const state = panelAndDoor('left', 'knob');
    const [panel, door] = panesOf(state, buildSpec(state, context), fixed);
    expect(door.features.some((f) => f.kind === 'hole')).toBe(false);
    const doorNotch = door.features.find((f) => f.kind === 'notch');
    expect(doorNotch).toMatchObject({ template: 'door-hinge', depthMm: 58, heightMm: 47, radiusMm: 8 });
    expect(panel.features.find((f) => f.kind === 'notch')).toMatchObject({ template: 'fixed-hinge', depthMm: 52, heightMm: 33, radiusMm: 8 });
  });
});
