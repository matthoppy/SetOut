/**
 * A shower's panes for the workshop and the toughener, with every cut-out on
 * a stated edge, and where each stands for the fitters, from the engine. The
 * fixed rules (cut-outs, the gap a glass-to-glass hinge leaves) are SetOut's
 * own and the same for every company, so they are read from the engine's
 * defaults.
 */

import {
  DEFAULT_RULESET,
  doorHingeOf,
  fittingsOf,
  hingeMountOf,
  hingeStylesOf,
  panesOf,
  setOutOf,
  type ConfiguratorSpec,
  type ConfiguratorState,
  type Fitting,
  type HingeStyles,
  type Pane,
  type PaneFeature,
  type SetOut,
} from '@setout/engine';
import { lettersFor, partner, placing } from '../pages/PaneDrawing';

/** The shower's panes, cut for its hinges: its own, or the company's standard (`standards`). */
export function panes(design: ConfiguratorState, spec: ConfiguratorSpec, standards?: HingeStyles): Pane[] {
  return panesOf(design, spec, DEFAULT_RULESET.fixed, standards);
}

/** Where each pane stands and the gaps all round it, for the installation sheet. */
export function setOut(design: ConfiguratorState, spec: ConfiguratorSpec): SetOut {
  return setOutOf(design, spec, DEFAULT_RULESET.fixed);
}

/** What the fitter takes. */
export function fittings(design: ConfiguratorState, spec: ConfiguratorSpec): Fitting[] {
  return fittingsOf(design, spec, DEFAULT_RULESET.fixed);
}

/** The style of hinge a door hangs on, where its range offers more than one: "offset back plate". */
export function hingeStyle(design: ConfiguratorState, spec: ConfiguratorSpec, index: number, standards: HingeStyles): string | null {
  const door = spec.panels[index]?.door;
  if (!door) return null;
  const mount = hingeMountOf(design, spec, index) ?? 'wall-to-glass';
  return doorHingeOf(door.hingeBrand, mount, hingeStylesOf(design, standards)).style?.words ?? null;
}

const CORNER = { 'bottom-left': 'bottom left corner', 'bottom-right': 'bottom right corner' } as const;

/**
 * A cut-out in words, with its edge as seen from outside the shower, placed
 * as the toughener's orders place it: a notch by its near edge from the nearer
 * end, a hole by its centre from the bottom.
 */
export function describeFeature(f: PaneFeature, pane: Pane, letters: Map<string, string> = lettersFor([pane])): string {
  if (f.kind === 'corner') return `Notch, ${CORNER[f.corner]}: ${f.widthMm} wide × ${f.heightMm} high`;
  const letter = letters.get(f.template) ?? '?';
  const what = f.hinge ? `${f.name} (${f.hinge})` : f.name;
  const { bottomLeft, bottomRight, topLeft, topRight } = pane.outline;
  const length = f.side === 'left' ? topLeft.y - bottomLeft.y : topRight.y - bottomRight.y;
  const p = placing(length, f);
  if (f.kind === 'notch') {
    const shape = f.ears ? `with Ø${f.ears.diameterMm} ears` : `r${f.radiusMm}`;
    return `${letter}: ${what}, ${f.depthMm} deep × ${f.heightMm} high, ${shape}, ${f.side} edge, ${p.distanceMm}mm from the ${p.from} to its ${p.from === 'top' ? 'upper' : 'lower'} edge`;
  }
  const first = partner(pane, f);
  const where =
    first !== null
      ? `${Math.round(Math.abs(f.centreMm - first) * 10) / 10}mm from the other`
      : `centre ${p.distanceMm}mm ${p.from === 'top' ? 'down from the top' : 'up'}`;
  return `${letter}: Ø${f.diameterMm} hole, ${what}, ${f.insetMm}mm in from the ${f.side} edge, ${where}`;
}
