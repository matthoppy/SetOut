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
import { TEMPLATES } from '../pages/PaneDrawing';

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

/** A cut-out in words, with its edge as seen from outside the shower. */
export function describeFeature(f: PaneFeature): string {
  if (f.kind === 'corner') return `Notch, ${CORNER[f.corner]}: ${f.widthMm} wide × ${f.heightMm} high`;
  const t = TEMPLATES[f.template];
  if (f.kind === 'notch') return `${t.letter}: ${t.name}, ${f.depthMm} deep × ${f.heightMm} high, r${f.radiusMm}, ${f.side} edge, centre ${f.centreMm}mm up`;
  return `${t.letter}: Ø${f.diameterMm} hole, ${f.insetMm}mm in from the ${f.side} edge, centre ${f.centreMm}mm up`;
}
