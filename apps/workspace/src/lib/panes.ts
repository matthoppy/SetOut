/**
 * A shower's panes for the workshop and the toughener, with every cut-out on
 * a stated edge, and where each stands for the fitters, from the engine. The
 * fixed rules (cut-outs, the gap a glass-to-glass hinge leaves) are SetOut's
 * own and the same for every company, so they are read from the engine's
 * defaults.
 */

import {
  DEFAULT_RULESET,
  fittingsOf,
  panesOf,
  setOutOf,
  type ConfiguratorSpec,
  type ConfiguratorState,
  type Fitting,
  type Pane,
  type PaneFeature,
  type SetOut,
} from '@setout/engine';
import { placing, TEMPLATES } from '../pages/PaneDrawing';

export function panes(design: ConfiguratorState, spec: ConfiguratorSpec): Pane[] {
  return panesOf(design, spec, DEFAULT_RULESET.fixed);
}

/** Where each pane stands and the gaps all round it, for the installation sheet. */
export function setOut(design: ConfiguratorState, spec: ConfiguratorSpec): SetOut {
  return setOutOf(design, spec, DEFAULT_RULESET.fixed);
}

/** What the fitter takes. */
export function fittings(design: ConfiguratorState, spec: ConfiguratorSpec): Fitting[] {
  return fittingsOf(design, spec, DEFAULT_RULESET.fixed);
}

const CORNER = { 'bottom-left': 'bottom left corner', 'bottom-right': 'bottom right corner' } as const;

/**
 * A cut-out in words, with its edge as seen from outside the shower, placed
 * as the toughener's orders place it: a notch by its near edge from the nearer
 * end, a hole by its centre from the bottom.
 */
export function describeFeature(f: PaneFeature, pane: Pane): string {
  if (f.kind === 'corner') return `Notch, ${CORNER[f.corner]}: ${f.widthMm} wide × ${f.heightMm} high`;
  const t = TEMPLATES[f.template];
  const { bottomLeft, bottomRight, topLeft, topRight } = pane.outline;
  const length = f.side === 'left' ? topLeft.y - bottomLeft.y : topRight.y - bottomRight.y;
  const p = placing(length, f);
  if (f.kind === 'notch') {
    return `${t.letter}: ${t.name}, ${f.depthMm} deep × ${f.heightMm} high, r${f.radiusMm}, ${f.side} edge, ${p.distanceMm}mm from the ${p.from} to its ${p.from === 'top' ? 'upper' : 'lower'} edge`;
  }
  return `${t.letter}: Ø${f.diameterMm} hole, ${f.insetMm}mm in from the ${f.side} edge, centre ${p.distanceMm}mm up`;
}
