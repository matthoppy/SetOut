/**
 * A shower's panes for the workshop and the toughener, with every cut-out on
 * a stated edge, from the engine. The fixed cut-out rules are SetOut's own and
 * the same for every company, so they are read from the engine's defaults.
 */

import { DEFAULT_RULESET, panesOf, type ConfiguratorSpec, type ConfiguratorState, type Pane, type PaneFeature } from '@setout/engine';
import { TEMPLATES } from '../pages/PaneDrawing';

export function panes(design: ConfiguratorState, spec: ConfiguratorSpec): Pane[] {
  return panesOf(design, spec, DEFAULT_RULESET.fixed);
}

const CORNER = { 'bottom-left': 'bottom left corner', 'bottom-right': 'bottom right corner' } as const;

/** A cut-out in words, with its edge as seen from outside the shower. */
export function describeFeature(f: PaneFeature): string {
  if (f.kind === 'corner') return `Notch, ${CORNER[f.corner]}: ${f.widthMm} wide × ${f.heightMm} high`;
  const t = TEMPLATES[f.template];
  if (f.kind === 'notch') return `${t.letter}: ${t.name}, ${f.depthMm} deep × ${f.heightMm} high, r${f.radiusMm}, ${f.side} edge, centre ${f.centreMm}mm up`;
  return `${t.letter}: Ø${f.diameterMm} hole, ${f.insetMm}mm in from the ${f.side} edge, centre ${f.centreMm}mm up`;
}
