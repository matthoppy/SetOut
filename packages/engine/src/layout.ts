/**
 * Keeping panel widths in step with the width the customer measured.
 *
 * A run's floor width is the wall it fills. The panels in that run have to
 * add up to it, or the cut sizes in the email disagree with the opening notes
 * beside them — and the workshop has to guess which the customer meant.
 *
 * Pure, alias-free, so it runs under Node for the tests.
 */

import type { ConfiguratorPanel } from './types';

/**
 * Spread a new width across one run's panels, keeping their proportions. The
 * rounding remainder goes on the widest panel, where a millimetre matters
 * least — the alternative is a run that does not add up to the wall it fills.
 */
export function scaleRunPanels(
  panels: ConfiguratorPanel[],
  indices: number[],
  targetMm: number
): ConfiguratorPanel[] {
  const total = indices.reduce((sum, i) => sum + panels[i].width_mm, 0);
  if (total <= 0 || targetMm <= 0 || indices.length === 0) return panels;

  const next = [...panels];
  for (const i of indices) {
    next[i] = {
      ...next[i],
      width_mm: Math.max(1, Math.round((panels[i].width_mm / total) * targetMm)),
    };
  }

  const drift = targetMm - indices.reduce((sum, i) => sum + next[i].width_mm, 0);
  if (drift !== 0) {
    const widest = indices.reduce((a, b) => (next[b].width_mm > next[a].width_mm ? b : a));
    next[widest] = { ...next[widest], width_mm: next[widest].width_mm + drift };
  }
  return next;
}

/** The narrowest a panel is allowed to go when another one grows into it. */
export const MIN_REBALANCE_PANEL_MM = 100;

/**
 * Change one panel's width and let the others in the run absorb the
 * difference, so the run still adds up to the measured total.
 *
 * The door is the size the customer cares about and the fixed panel is
 * "whatever is left", so the panel they typed into is honoured exactly and the
 * rest share the remainder in their existing proportions. A single-panel run
 * is left alone: its width *is* the measurement, and changing it here would
 * silently overrule the tape.
 */
export function rebalanceRun(
  panels: ConfiguratorPanel[],
  indices: number[],
  changedIndex: number,
  widthMm: number,
  totalMm: number
): ConfiguratorPanel[] {
  const others = indices.filter((i) => i !== changedIndex);
  if (others.length === 0 || totalMm <= 0 || !indices.includes(changedIndex)) return panels;

  const room = totalMm - others.length * MIN_REBALANCE_PANEL_MM;
  const width = Math.min(Math.max(1, Math.round(widthMm)), Math.max(1, room));
  const next = [...panels];
  next[changedIndex] = { ...next[changedIndex], width_mm: width };
  return scaleRunPanels(next, others, totalMm - width);
}

/** True when the panels in a run add up to the width that was measured for it. */
export function runAddsUp(panels: ConfiguratorPanel[], indices: number[], totalMm: number): boolean {
  return indices.reduce((sum, i) => sum + panels[i].width_mm, 0) === totalMm;
}
