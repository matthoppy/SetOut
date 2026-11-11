/**
 * Each pane of a shower as the toughener draws it: its size, exactly where
 * every notch and hole is on it, and which corner takes the toughening stamp.
 *
 * Every position is on a stated edge, seen from outside the shower, the way
 * the elevation is drawn: a pane's left edge is on your left as you face it
 * from the room. Heights are to the centre of the cut-out, up from the pane's
 * bottom edge. For clear glass the toughener may turn a pane over, which
 * mirrors it; what has to be right is where each cut-out is against the
 * others, and that is what this keeps.
 *
 * The spec already holds the heights. What it does not say plainly is the
 * edge: on a fixed panel it names the mating hinge notch's edge "hinge side"
 * or "handle side", which a fixed panel does not have. This works the edge
 * out from the door the notch mates with, by the same rule the spec places
 * the notch with, and its tests hold every pane's heights to the spec's own.
 * It reads a stored spec as it is, so it draws designs saved before it.
 */

import type { ConfiguratorSpec } from './spec';
import type { ConfiguratorState } from './types';
import type { FixedRules } from './ruleset';
import { mateNotchHeightMm } from './rules';
import { shapesOf, type PaneShape } from './shapes';

export type PaneSide = 'left' | 'right';
export type PaneCorner = 'bottom-left' | 'bottom-right';

/** A notch cut into an edge for a glass hinge: so deep into the glass, so tall along the edge. */
export interface PaneNotch {
  kind: 'notch';
  template: 'door-hinge' | 'fixed-hinge';
  side: PaneSide;
  /** Its centre, up from the bottom edge. */
  centreMm: number;
  depthMm: number;
  heightMm: number;
  radiusMm: number;
}

/** A hole through the glass, for a handle. */
export interface PaneHole {
  kind: 'hole';
  template: 'handle';
  side: PaneSide;
  /** Its centre, up from the bottom edge. */
  centreMm: number;
  /** Its centre, in from the edge. */
  insetMm: number;
  diameterMm: number;
}

/** A notch out of a bottom corner, such as over a tray lip or a step. */
export interface PaneCornerNotch {
  kind: 'corner';
  corner: PaneCorner;
  widthMm: number;
  heightMm: number;
}

export type PaneFeature = PaneNotch | PaneHole | PaneCornerNotch;

export interface Pane {
  id: string;
  label: string;
  /** The rectangle the pane is cut from, around its shape. */
  widthMm: number;
  heightMm: number;
  /** By the rectangle, which is what the toughener starts from and the fitter carries. */
  weightKg: number;
  /** Its corners, from the rectangle's bottom-left, y up. See shapes.ts. */
  outline: PaneShape['corners'];
  /** True when the pane is cut to a shape, not square. */
  shaped: boolean;
  /** Each cut-out's centre is up from the bottom corner of the edge it is on. */
  features: PaneFeature[];
  /** Where the toughening stamp goes: a bottom corner, away from the hinges. */
  stamp: PaneCorner;
}

const other = (side: PaneSide): PaneSide => (side === 'left' ? 'right' : 'left');

/**
 * The panes of a worked-out shower, in order from left to right as seen from
 * outside. `fixed` is SetOut's own fixed rules, which no company changes.
 */
export function panesOf(
  design: ConfiguratorState,
  spec: ConfiguratorSpec,
  fixed: Pick<FixedRules, 'cutouts' | 'handle' | 'glassDensityKgPerM2PerMm'>
): Pane[] {
  const shapes = shapesOf(design, spec);
  const panes: Pane[] = spec.panels.map((panel, i) => ({
    id: panel.id,
    label: panel.label,
    widthMm: shapes[i].widthMm,
    heightMm: shapes[i].heightMm,
    weightKg:
      Math.round((shapes[i].widthMm / 1000) * (shapes[i].heightMm / 1000) * spec.glassThicknessMm * fixed.glassDensityKgPerM2PerMm * 100) / 100,
    outline: shapes[i].corners,
    shaped: shapes[i].shaped,
    features: panel.notches.map((n) => ({
      kind: 'corner' as const,
      corner: n.corner.toLowerCase().includes('left') ? ('bottom-left' as const) : ('bottom-right' as const),
      widthMm: n.widthMm,
      heightMm: n.heightMm,
    })),
    stamp: 'bottom-right',
  }));
  // The side each pane's hinges are on, if it has any, for where its stamp goes.
  const hingeSide = new Map<number, PaneSide>();

  spec.panels.forEach((panel, i) => {
    const door = panel.door;
    if (!door) return;
    const pane = panes[i];
    hingeSide.set(i, door.hingeSide);
    for (const centre of door.hingeHeightsMm) {
      pane.features.push({
        kind: 'notch',
        template: 'door-hinge',
        side: door.hingeSide,
        centreMm: centre,
        depthMm: fixed.cutouts.doorHingeNotch.widthMm,
        heightMm: fixed.cutouts.doorHingeNotch.heightMm,
        radiusMm: fixed.cutouts.doorHingeNotch.radiusMm,
      });
    }
    if (design.handleId !== 'knob') {
      for (const centre of [door.handleHoleHeightsMm.lowerMm, door.handleHoleHeightsMm.upperMm]) {
        pane.features.push({
          kind: 'hole',
          template: 'handle',
          side: other(door.hingeSide),
          centreMm: centre,
          insetMm: fixed.handle.holeInsetMm,
          diameterMm: fixed.handle.holeDiameterMm,
        });
      }
    }

    // The fixed panel the door hangs from takes a mating notch on the edge
    // that meets the door, set at the door hinge's height above the floor.
    const n = door.hingeSide === 'left' ? i - 1 : i + 1;
    const neighbour = spec.panels[n];
    if (!neighbour || neighbour.kind !== 'fixed') return;
    const meets: PaneSide = door.hingeSide === 'left' ? 'right' : 'left';
    hingeSide.set(n, meets);
    for (const centre of door.hingeHeightsMm) {
      panes[n].features.push({
        kind: 'notch',
        template: 'fixed-hinge',
        side: meets,
        centreMm: mateNotchHeightMm(centre, panel.deductions.vertical.bottom, neighbour.deductions.vertical.bottom),
        depthMm: fixed.cutouts.fixedHingeNotch.widthMm,
        heightMm: fixed.cutouts.fixedHingeNotch.heightMm,
        radiusMm: fixed.cutouts.fixedHingeNotch.radiusMm,
      });
    }
  });

  // The spec measures each cut-out up from its own square bottom edge. On a
  // pane cut to shape, that edge is somewhere above the bottom corner of the
  // edge the cut-out is on, so the same point on the glass is that much
  // further up from the corner. Nothing moves; it is measured from the glass.
  panes.forEach((pane, i) => {
    const shape = shapes[i];
    for (const f of pane.features) {
      if (f.kind === 'corner') continue;
      const corner = f.side === 'left' ? shape.corners.bottomLeft.y : shape.corners.bottomRight.y;
      f.centreMm = Math.round((f.centreMm + shape.specBottomMm - corner) * 10) / 10;
    }
  });

  // The stamp goes in the bottom corner away from the hinges, unless a
  // corner notch is there and the other corner is clear.
  panes.forEach((pane, i) => {
    const away: PaneCorner = hingeSide.get(i) === 'right' ? 'bottom-left' : 'bottom-right';
    const notched = (c: PaneCorner) => pane.features.some((f) => f.kind === 'corner' && f.corner === c);
    const near: PaneCorner = away === 'bottom-right' ? 'bottom-left' : 'bottom-right';
    pane.stamp = notched(away) && !notched(near) ? near : away;
    pane.features.sort((a, b) => order(a) - order(b));
  });
  return panes;
}

/** Corner notches first, then hinge notches, then holes, each from the bottom up. */
function order(f: PaneFeature): number {
  if (f.kind === 'corner') return 0;
  return (f.kind === 'notch' ? 1 : 2) * 100_000 + f.centreMm;
}
