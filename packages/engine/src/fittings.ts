/**
 * What the fitter takes to a shower: the hinges on each door and how they
 * fix, its handle, its seal and the wipe under it, how the fixed glass is
 * held, and any support.
 *
 * Every number comes from the spec, and the seal's length from the glass the
 * door is cut to. The finish and handle are the company's own options, so
 * they are given by id and the caller names them.
 */

import { shapesOf, type ShapeRules } from './shapes';
import type { ChannelCut, ConfiguratorSpec } from './spec';
import type { ConfiguratorState } from './types';

/** How a door's hinges fix: to the wall, or to the glass beside it, in line or round a corner. */
export type HingeMount = 'wall-to-glass' | 'glass-to-glass-180' | 'glass-to-glass-90';

export type Fitting =
  /** `pane` is the door's index in the spec's panels. */
  | { kind: 'hinges'; pane: number; count: number; brand: string; mount: HingeMount }
  | { kind: 'handle'; pane: number; handleId: string }
  /** Along the door's latch edge, as long as that edge. */
  | { kind: 'seal'; pane: number; seal: string; lengthMm: number }
  /** A wipe with a drip rail along the door's bottom edge, as long as that edge. */
  | { kind: 'bottom-seal'; pane: number; lengthMm: number }
  /** `cuts` is each length to cut, where the spec gives them. */
  | { kind: 'channel'; lengthMm: number; cuts: ChannelCut[] }
  | { kind: 'clamps' }
  | { kind: 'support-bar'; reason: string | null }
  | { kind: 'support-panel'; reason: string | null }
  /**
   * A sliding door's kit, in place of hinges, a handle and a door seal: its
   * header bar, rollers, track holders, pull, door guide and seal. `pane` is
   * the door. `series` is CRL's number for the kit before its finish.
   */
  | { kind: 'sliding-kit'; pane: number; series: string; headerLengthMm: number }
  /** The kit that fixes a sliding door's header to a 90° return panel. `pane` is the return. */
  | { kind: 'sliding-return-kit'; pane: number; series: string };

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

export function fittingsOf(state: ConfiguratorState, spec: ConfiguratorSpec, fixed: ShapeRules): Fitting[] {
  const shapes = shapesOf(state, spec, fixed);
  const fittings: Fitting[] = [];
  spec.panels.forEach((panel, i) => {
    const door = panel.door;
    if (!door) return;
    fittings.push({ kind: 'hinges', pane: i, count: door.hingeCount, brand: door.hingeBrand, mount: hingeMountOf(state, spec, i) ?? 'wall-to-glass' });
    fittings.push({ kind: 'handle', pane: i, handleId: state.handleId });
    const { bottomLeft, bottomRight, topLeft, topRight } = shapes[i].corners;
    const latch = door.hingeSide === 'left' ? topRight.y - bottomRight.y : topLeft.y - bottomLeft.y;
    fittings.push({ kind: 'seal', pane: i, seal: door.sealType, lengthMm: latch });
    // Every door has a wipe under it, as Custom Showers always fit.
    fittings.push({ kind: 'bottom-seal', pane: i, lengthMm: Math.round(Math.hypot(bottomRight.x - bottomLeft.x, bottomRight.y - bottomLeft.y)) });
  });
  if (spec.sliding) {
    const { kit, returnKit, header } = spec.sliding;
    fittings.push({ kind: 'sliding-kit', pane: spec.panels.findIndex((p) => p.sliding?.role === 'door'), series: kit, headerLengthMm: header.lengthMm });
    if (returnKit) fittings.push({ kind: 'sliding-return-kit', pane: spec.panels.findIndex((p) => p.sliding?.role === 'return'), series: returnKit });
  }
  fittings.push(spec.mounting === 'channel' ? { kind: 'channel', lengthMm: spec.totalChannelLengthMm, cuts: spec.channelCuts ?? [] } : { kind: 'clamps' });
  if (spec.support.supportBarRequired) fittings.push({ kind: 'support-bar', reason: spec.support.supportBarReason });
  if (spec.support.supportPanelRequired) fittings.push({ kind: 'support-panel', reason: spec.support.supportPanelReason });
  return fittings;
}
