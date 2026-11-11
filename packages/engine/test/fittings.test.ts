/** What the fitter takes to each known design: one set of door hardware per door, and one way of fixing the glass. */
import { describe, expect, test } from 'vitest';
import { applyTemplate, buildSpec, createInitialState, DEFAULT_RULESET, fittingsOf, hingeMountOf, TEMPLATES, type ConfiguratorState } from '../src';
import { GOLDEN_COMPANY, GOLDENS } from './goldens';

const context = { rules: DEFAULT_RULESET, companyName: GOLDEN_COMPANY };
const golden = (name: string) => {
  const found = GOLDENS.find((g) => g.name === name);
  if (!found) throw new Error(`missing golden ${name}`);
  return structuredClone(found.document.design);
};
const hingedOn = (state: ConfiguratorState, side: 'left' | 'right'): ConfiguratorState => ({
  ...state,
  panels: state.panels.map((p) => (p.door ? { ...p, door: { ...p.door, hinge_side: side } } : p)),
});

describe('the door hardware', () => {
  test('a door hung from the wall: its hinges, handle and a seal the length of its latch edge', () => {
    const template = TEMPLATES.find((t) => t.id === 'alcove-panel-door');
    if (!template) throw new Error('no template');
    const state = applyTemplate(createInitialState(10), template);
    const spec = buildSpec(state, context);
    const door = spec.panels[1];
    expect(fittingsOf(state, spec)).toEqual([
      { kind: 'hinges', pane: 1, count: door.door!.hingeCount, brand: door.door!.hingeBrand, mount: 'wall-to-glass' },
      { kind: 'handle', pane: 1, handleId: 'pull' },
      { kind: 'seal', pane: 1, seal: '90° stopper seal', lengthMm: door.cutHeightMm },
      { kind: 'channel', lengthMm: spec.totalChannelLengthMm },
    ]);
  });

  test('a door hung from the glass beside it, in line, swinging both ways', () => {
    const state = golden('panel-door-hinged-off-glass-both-ways');
    const spec = buildSpec(state, context);
    const fittings = fittingsOf(state, spec);
    expect(fittings.find((f) => f.kind === 'hinges')).toMatchObject({ mount: 'glass-to-glass-180' });
    expect(fittings.find((f) => f.kind === 'seal')).toMatchObject({ seal: 'bubble seal' });
  });

  test('a door beside a return hangs from the return round the corner, or from the wall on its other side', () => {
    const state = golden('layout-corner-door-return');
    const doorAt = state.panels.findIndex((p) => p.kind === 'door');
    const towardsReturn = doorAt > 0 && state.junctions[doorAt - 1]?.angle_deg === 90 ? 'left' : 'right';
    const awayFromReturn = towardsReturn === 'left' ? 'right' : 'left';
    const offReturn = hingedOn(state, towardsReturn);
    expect(hingeMountOf(offReturn, buildSpec(offReturn, context), doorAt)).toBe('glass-to-glass-90');
    const offWall = hingedOn(state, awayFromReturn);
    expect(hingeMountOf(offWall, buildSpec(offWall, context), doorAt)).toBe('wall-to-glass');
  });

  test('a fixed pane has no hinges of its own', () => {
    const state = golden('layout-walk-in');
    expect(hingeMountOf(state, buildSpec(state, context), 0)).toBeNull();
  });
});

describe('every known design', () => {
  test.each(GOLDENS.map((g) => [g.name, g] as const))('%s', (_name, g) => {
    const state = structuredClone(g.document.design);
    const spec = buildSpec(state, context);
    const fittings = fittingsOf(state, spec);
    const doors = spec.panels.flatMap((p, i) => (p.door ? [i] : []));
    for (const kind of ['hinges', 'handle', 'seal'] as const) {
      expect(fittings.filter((f) => f.kind === kind).map((f) => (f as { pane: number }).pane)).toEqual(doors);
    }
    for (const f of fittings) {
      if (f.kind === 'hinges') expect(f.count).toBe(spec.panels[f.pane].door!.hingeCount);
      if (f.kind === 'seal') expect(f.lengthMm).toBeGreaterThan(0);
    }
    expect(fittings.filter((f) => f.kind === 'channel' || f.kind === 'clamps')).toEqual([
      spec.mounting === 'channel' ? { kind: 'channel', lengthMm: spec.totalChannelLengthMm } : { kind: 'clamps' },
    ]);
    expect(fittings.some((f) => f.kind === 'support-bar')).toBe(spec.support.supportBarRequired);
    expect(fittings.some((f) => f.kind === 'support-panel')).toBe(spec.support.supportPanelRequired);
  });
});
