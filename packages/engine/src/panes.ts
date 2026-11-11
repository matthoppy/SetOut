/**
 * Each pane of a shower as the toughener draws it: its size, exactly where
 * every notch and hole is on it (a pull handle's pair, or a knob's one), and
 * which corner takes the toughening stamp.
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
import type { CutoutTemplate, FixedRules } from './ruleset';
import { hingeMountOf, type HingeMount } from './fittings';
import { mateNotchHeightMm } from './rules';
import { shapesOf, type PaneShape } from './shapes';

export type PaneSide = 'left' | 'right';
export type PaneCorner = 'bottom-left' | 'bottom-right';

/**
 * Which template a cut-out is made to. The same key on every pane that uses
 * it, so a glass order can letter each template once. `name` and `source` are
 * for its templates page; a hinge cut-out with no `source` is SetOut's own
 * stand-in, to be checked against the template that comes with the hinge.
 */
interface Template {
  template: string;
  name: string;
  source: string | null;
}

/** What a cut-out is for: the door's own hinge, the panel a door hangs from, a pull handle, a knob. */
export type PaneFeatureRole = 'door-hinge' | 'panel-hinge' | 'handle' | 'knob';

/** A notch cut into an edge for a glass hinge: so deep into the glass, so tall along the edge. */
export interface PaneNotch extends Template {
  kind: 'notch';
  role: 'door-hinge' | 'panel-hinge';
  /** The hinge it is for, as the orders name it: "Gen - G/G - 90°". */
  hinge: string;
  side: PaneSide;
  /** Its centre, up from the bottom edge. */
  centreMm: number;
  depthMm: number;
  heightMm: number;
  /** Of its inner corners. */
  radiusMm: number;
  /** Round relief holes at its inner corners, where its template has them. */
  ears: { diameterMm: number; inMm: number; apartMm: number } | null;
}

/** A hole through the glass: one of a hinge's or a pull handle's pair, or a knob's one. */
export interface PaneHole extends Template {
  kind: 'hole';
  role: 'panel-hinge' | 'handle' | 'knob';
  /** For a hinge's holes, the hinge, as the orders name it. */
  hinge: string | null;
  side: PaneSide;
  /** Its centre, up from the bottom edge. */
  centreMm: number;
  /** Its centre, in from the edge. */
  insetMm: number;
  diameterMm: number;
  /** For one of a pair, how far apart the two are. */
  apartMm: number | null;
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
  /**
   * Where the toughening stamp goes: a bottom corner, so far in from its side
   * and up from the bottom. Away from the hinges on a fixed panel, on the
   * hinge side of a door, as Custom Showers' own orders have it.
   */
  stamp: PaneStamp;
}

export interface PaneStamp {
  corner: PaneCorner;
  inMm: number;
  upMm: number;
}

const other = (side: PaneSide): PaneSide => (side === 'left' ? 'right' : 'left');

/** How a hinge is named on the orders: "Gen - G/G - 90°", "Bel - G/G", "Vienna - G/W". */
const SHORT: Record<string, string> = { Geneva: 'Gen', Bellagio: 'Bel' };
const MOUNT: Record<HingeMount, string> = { 'wall-to-glass': 'G/W', 'glass-to-glass-180': 'G/G', 'glass-to-glass-90': 'G/G - 90°' };
const hingeName = (brand: string, mount: HingeMount) => `${SHORT[brand] ?? brand} - ${MOUNT[mount]}`;
const key = (kit: string, t: CutoutTemplate) => `${kit}/${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/**
 * The panes of a worked-out shower, in order from left to right as seen from
 * outside. `fixed` is SetOut's own fixed rules, which no company changes.
 */
export function panesOf(
  design: ConfiguratorState,
  spec: ConfiguratorSpec,
  fixed: Pick<FixedRules, 'cutouts' | 'handle' | 'hinges' | 'stamp' | 'glassDensityKgPerM2PerMm'>
): Pane[] {
  // A notch from a template, or SetOut's own when the kit has none.
  const notchAt = (
    role: PaneNotch['role'],
    hinge: string,
    side: PaneSide,
    centreMm: number,
    kit: string | undefined,
    template: CutoutTemplate | undefined
  ): PaneFeature[] => {
    if (kit && template?.shape.kind === 'holes') {
      const { diameterMm, inMm, apartMm } = template.shape;
      return [-1, 1].map((sign) => ({
        kind: 'hole' as const,
        role: 'panel-hinge' as const,
        template: key(kit, template),
        name: template.name,
        source: template.source,
        hinge,
        side,
        centreMm: Math.round((centreMm + (sign * apartMm) / 2) * 10) / 10,
        insetMm: inMm,
        diameterMm,
        apartMm,
      }));
    }
    if (kit && template && template.shape.kind !== 'holes') {
      const shape = template.shape;
      return [
        {
          kind: 'notch',
          role,
          template: key(kit, template),
          name: template.name,
          source: template.source,
          hinge,
          side,
          centreMm,
          depthMm: shape.depthMm,
          heightMm: shape.heightMm,
          radiusMm: shape.kind === 'notch' ? shape.radiusMm : 0,
          ears: shape.kind === 'notch-ears' ? { diameterMm: shape.earDiameterMm, inMm: shape.earInMm, apartMm: shape.earApartMm } : null,
        },
      ];
    }
    const own = role === 'door-hinge' ? fixed.cutouts.doorHingeNotch : fixed.cutouts.fixedHingeNotch;
    return [
      {
        kind: 'notch',
        role,
        template: role === 'door-hinge' ? 'door-hinge' : 'fixed-hinge',
        name: role === 'door-hinge' ? 'Door hinge notch' : 'Mating hinge notch',
        source: null,
        hinge,
        side,
        centreMm,
        depthMm: own.widthMm,
        heightMm: own.heightMm,
        radiusMm: own.radiusMm,
        ears: null,
      },
    ];
  };

  const shapes = shapesOf(design, spec, fixed);
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
    stamp: { corner: 'bottom-right' as PaneCorner, inMm: fixed.stamp.fixedInMm, upMm: fixed.stamp.upMm },
  }));
  // The side each pane's hinges are on, if it has any, for where its stamp goes.
  const hingeSide = new Map<number, PaneSide>();

  spec.panels.forEach((panel, i) => {
    const door = panel.door;
    if (!door) return;
    const pane = panes[i];
    hingeSide.set(i, door.hingeSide);
    const kit = fixed.hinges.kits.find((k) => k.name === door.hingeBrand)?.id;
    const cutouts = kit ? fixed.hinges.cutouts[kit] : undefined;
    const mount = hingeMountOf(design, spec, i) ?? 'wall-to-glass';
    const hinge = hingeName(door.hingeBrand, mount);
    for (const centre of door.hingeHeightsMm) {
      pane.features.push(...notchAt('door-hinge', hinge, door.hingeSide, centre, kit, cutouts?.door));
    }
    if (design.handleId !== 'knob') {
      for (const centre of [door.handleHoleHeightsMm.lowerMm, door.handleHoleHeightsMm.upperMm]) {
        pane.features.push({
          kind: 'hole',
          role: 'handle',
          template: 'handle',
          name: 'Handle holes',
          source: 'SetOut',
          hinge: null,
          side: other(door.hingeSide),
          centreMm: centre,
          insetMm: fixed.handle.holeInsetMm,
          diameterMm: fixed.handle.holeDiameterMm,
          apartMm: fixed.handle.holeSpacingMm,
        });
      }
    } else {
      // A knob goes through one hole, at its own height whatever the door.
      pane.features.push({
        kind: 'hole',
        role: 'knob',
        template: 'knob',
        name: 'Knob hole',
        source: 'SetOut',
        hinge: null,
        side: other(door.hingeSide),
        centreMm: door.handlePlacement.handleHeight,
        insetMm: fixed.handle.holeInsetMm,
        diameterMm: fixed.handle.holeDiameterMm,
        apartMm: null,
      });
    }

    // The fixed panel the door hangs from takes a mating notch on the edge
    // that meets the door, set at the door hinge's height above the floor.
    const n = door.hingeSide === 'left' ? i - 1 : i + 1;
    const neighbour = spec.panels[n];
    if (!neighbour || neighbour.kind !== 'fixed') return;
    const meets: PaneSide = door.hingeSide === 'left' ? 'right' : 'left';
    hingeSide.set(n, meets);
    const onPanel = mount === 'glass-to-glass-90' ? cutouts?.panelAtCorner : cutouts?.panelInLine;
    for (const centre of door.hingeHeightsMm) {
      const at = mateNotchHeightMm(centre, panel.deductions.vertical.bottom, neighbour.deductions.vertical.bottom);
      panes[n].features.push(...notchAt('panel-hinge', hinge, meets, at, kit, onPanel));
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

  // The stamp goes in a bottom corner: away from the hinges on a fixed
  // panel, on the hinge side of a door, as Custom Showers' own orders have
  // it. A corner notch there moves it to the other corner, if that is clear.
  panes.forEach((pane, i) => {
    const door = spec.panels[i]?.door;
    const side = hingeSide.get(i);
    const onLeft = door ? side === 'left' : side === 'right';
    const first: PaneCorner = onLeft ? 'bottom-left' : 'bottom-right';
    const second: PaneCorner = first === 'bottom-right' ? 'bottom-left' : 'bottom-right';
    const notched = (c: PaneCorner) => pane.features.some((f) => f.kind === 'corner' && f.corner === c);
    pane.stamp = {
      corner: notched(first) && !notched(second) ? second : first,
      inMm: door ? fixed.stamp.doorInMm : fixed.stamp.fixedInMm,
      upMm: fixed.stamp.upMm,
    };
    pane.features.sort((a, b) => order(a) - order(b));
  });
  return panes;
}

/** Corner notches first, then hinge notches, then holes, each from the bottom up. */
function order(f: PaneFeature): number {
  if (f.kind === 'corner') return 0;
  return (f.kind === 'notch' ? 1 : 2) * 100_000 + f.centreMm;
}
