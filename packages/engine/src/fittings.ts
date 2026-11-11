/**
 * What the fitter takes to a shower: the hinges on each door and how they
 * fix, its handle and its seal, how the fixed glass is held, and any support.
 *
 * Every number comes from the spec, and the seal's length from the glass the
 * door is cut to. The finish and handle are the company's own options, so
 * they are given by id and the caller names them.
 */

import { shapesOf } from './shapes';
import type { ConfiguratorSpec } from './spec';
import type { ConfiguratorState } from './types';

/** How a door's hinges fix: to the wall, or to the glass beside it, in line or round a corner. */
export type HingeMount = 'wall-to-glass' | 'glass-to-glass-180' | 'glass-to-glass-90';

export type Fitting =
  /** `pane` is the door's index in the spec's panels. */
  | { kind: 'hinges'; pane: number; count: number; brand: string; mount: HingeMount }
  | { kind: 'handle'; pane: number; handleId: string }
  /** Along the door's latch edge, as long as that edge. */
  | { kind: 'seal'; pane: number; seal: string; lengthMm: number }
  | { kind: 'channel'; lengthMm: number }
  | { kind: 'clamps' }
  | { kind: 'support-bar'; reason: string | null }
  | { kind: 'support-panel'; reason: string | null };

/**
 * What a door hangs from. By the same rule the spec places the mating hinge
 * notches by: the pane on its hinge side, or the wall when there is none.
 */
export function hingeMountOf(state: ConfiguratorState, spec: ConfiguratorSpec, index: number): HingeMount | null {
  const door = spec.panels[index]?.door;
  if (!door) return null;
  const n = door.hingeSide === 'left' ? index - 1 : index + 1;
  if (!spec.panels[n]) return 'wall-to-glass';
  // junctions[i] joins panel i to panel i + 1.
  return state.junctions[Math.min(index, n)]?.angle_deg === 90 ? 'glass-to-glass-90' : 'glass-to-glass-180';
}

export function fittingsOf(state: ConfiguratorState, spec: ConfiguratorSpec): Fitting[] {
  const shapes = shapesOf(state, spec);
  const fittings: Fitting[] = [];
  spec.panels.forEach((panel, i) => {
    const door = panel.door;
    if (!door) return;
    fittings.push({ kind: 'hinges', pane: i, count: door.hingeCount, brand: door.hingeBrand, mount: hingeMountOf(state, spec, i) ?? 'wall-to-glass' });
    fittings.push({ kind: 'handle', pane: i, handleId: state.handleId });
    const { bottomLeft, bottomRight, topLeft, topRight } = shapes[i].corners;
    const latch = door.hingeSide === 'left' ? topRight.y - bottomRight.y : topLeft.y - bottomLeft.y;
    fittings.push({ kind: 'seal', pane: i, seal: door.sealType, lengthMm: latch });
  });
  fittings.push(spec.mounting === 'channel' ? { kind: 'channel', lengthMm: spec.totalChannelLengthMm } : { kind: 'clamps' });
  if (spec.support.supportBarRequired) fittings.push({ kind: 'support-bar', reason: spec.support.supportBarReason });
  if (spec.support.supportPanelRequired) fittings.push({ kind: 'support-panel', reason: spec.support.supportPanelReason });
  return fittings;
}
