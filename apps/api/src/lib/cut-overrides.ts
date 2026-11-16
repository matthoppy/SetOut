/**
 * A different deduction for one pane of one job.
 *
 * The engine works out each pane's cut size from the company's rules, and
 * that answer is stored with the revision and never changed. Where staff have
 * set an override for a pane, the cut size is worked out again here from what
 * was measured, less the override's deductions, in place of the rule's. Each
 * deduction keeps the sides the rule put it on (the wall end for width, the
 * bottom channel for height), so the drawings and the glass order still place
 * the pane where it stands.
 *
 * Staff see both: the cut size from the override, and what the rule would
 * have taken off. The customer sees neither.
 */

import { DEFAULT_RULESET, type ConfiguratorSpec, type ConfiguratorState } from '@setout/engine';
import type { Row } from '../db/tables';

export const DEDUCTION_LIMIT_MM = 200;
export const REASON_LIMITS = { min: 3, max: 300 } as const;

/** What staff are shown about an override, beside the cut size. */
export interface CutOverrideView {
  id: string;
  designId: string;
  paneId: string;
  widthDeductionMm: number;
  heightDeductionMm: number;
  /** What the company's rule takes off, which the override is used instead of. */
  defaultWidthDeductionMm: number | null;
  defaultHeightDeductionMm: number | null;
  reason: string;
  revisionNumber: number;
  setBy: { name: string | null; email: string } | null;
  setAt: string;
}

/** Split a total over two sides as the rule split it; with nothing to go by, all on `fallback`. */
function split<A extends string, B extends string>(total: number, sides: Record<A | B, number>, a: A, b: B, fallback: A | B) {
  const was = sides[a] + sides[b];
  if (was <= 0) return { [a]: fallback === a ? total : 0, [b]: fallback === b ? total : 0 } as Record<A | B, number>;
  const first = Math.round((total * sides[a]) / was);
  return { [a]: first, [b]: total - first } as Record<A | B, number>;
}

const kg = (widthMm: number, heightMm: number, thicknessMm: number) =>
  Math.round((widthMm / 1000) * (heightMm / 1000) * thicknessMm * DEFAULT_RULESET.fixed.glassDensityKgPerM2PerMm * 100) / 100;

/**
 * The spec with each overridden pane cut from its override. A new object: the
 * stored revision is never changed. A sliding shower is cut to its maker's
 * formula, so it is left alone.
 */
export function applyCutOverrides(
  spec: ConfiguratorSpec,
  overrides: Pick<Row<'cut_overrides'>, 'pane_id' | 'width_deduction_mm' | 'height_deduction_mm'>[],
  design?: Pick<ConfiguratorState, 'leftWall' | 'rightWall'>
): ConfiguratorSpec {
  if (overrides.length === 0 || spec.sliding) return spec;
  const out = structuredClone(spec);
  let changed = false;
  out.panels = out.panels.map((panel) => {
    const o = overrides.find((x) => x.pane_id === panel.id);
    if (!o) return panel;
    changed = true;
    const h = panel.deductions.horizontal;
    const v = panel.deductions.vertical;
    const across = split(o.width_deduction_mm, { left: h.left, right: h.right }, 'left', 'right', design && !design.leftWall && design.rightWall ? 'right' : 'left');
    const upDown = split(o.height_deduction_mm, { top: v.top, bottom: v.bottom }, 'top', 'bottom', 'bottom');
    const cutWidthMm = panel.tightWidthMm - o.width_deduction_mm;
    const cutHeightMm = panel.tightHeightMm - o.height_deduction_mm;
    return {
      ...panel,
      cutWidthMm,
      cutHeightMm,
      weightKg: kg(cutWidthMm, cutHeightMm, spec.glassThicknessMm),
      deductions: {
        horizontal: { left: across.left, right: across.right, total: o.width_deduction_mm, breakdown: [`Override: -${o.width_deduction_mm}mm (standard ${h.total}mm)`] },
        vertical: { top: upDown.top, bottom: upDown.bottom, total: o.height_deduction_mm, breakdown: [`Override: -${o.height_deduction_mm}mm (standard ${v.total}mm)`] },
        cutWidth: cutWidthMm,
        cutHeight: cutHeightMm,
      },
    };
  });
  if (!changed) return spec;
  out.totalGlassWeightKg = Math.round(out.panels.reduce((sum, p) => sum + p.weightKg, 0) * 100) / 100;
  return out;
}

/** An override for staff, with what the rule would have taken off from the stored spec. */
export function viewOf(
  row: Row<'cut_overrides'>,
  storedSpec: ConfiguratorSpec | null,
  people: Record<string, { name: string | null; email: string }>
): CutOverrideView {
  const panel = storedSpec?.panels.find((p) => p.id === row.pane_id);
  return {
    id: row.id,
    designId: row.design_id,
    paneId: row.pane_id,
    widthDeductionMm: row.width_deduction_mm,
    heightDeductionMm: row.height_deduction_mm,
    defaultWidthDeductionMm: panel ? panel.deductions.horizontal.total : null,
    defaultHeightDeductionMm: panel ? panel.deductions.vertical.total : null,
    reason: row.reason,
    revisionNumber: row.revision_number,
    setBy: row.set_by ? (people[row.set_by] ?? null) : null,
    setAt: row.updated_at,
  };
}

/** A deduction as sent: a whole number of millimetres within the limit, or null. */
export function readDeduction(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= DEDUCTION_LIMIT_MM ? value : null;
}
