/**
 * Fabrication spec builder.
 *
 * Turns the customer's configuration into the thing the glazier actually
 * receives: panel-by-panel cut sizes with the deductions spelled out, the
 * hardware that follows from the door size, and any warnings worth seeing
 * before glass is cut.
 *
 * The calculations live in fabrication.ts and rules.ts, and the numbers in
 * the Ruleset passed in. This module's job is
 * to feed them correctly and lay the answers out in one flat structure that
 * the review screen and the email can both render.
 */

import type { PanelModel } from './panelModel';
import {
  calculateDoorDeductions,
  calculateHandlePlacement,
  calculateHingePlacement,
  calculatePanelDeductions,
  checkSupportRequirements,
  selectHingeForDoor,
  type HandlePlacement,
  type HingePlacement,
  type PanelDeductions,
} from './fabrication';
import {
  derivePlanes,
  hasTransom,
  isSingleDoor,
  openingContext,
  type Plane,
  totalRunWidthMm,
} from './geometry';
import {
  ceilingSlope,
  describeOpening,
  describeWidths,
  LASER_OFFSET_DEFAULT_MM,
  METHOD_LABELS,
} from './measure';
import {
  checkDoorLimits,
  checkGlassSpec,
  checkPanelLimits,
  glassWeightKg,
  handleHoleHeightsMm,
  hingeHeightsMm,
  mateNotchHeightMm,
  type LimitCheck,
} from './rules';
import type { EngineContext } from './ruleset';
import { buildSlidingSpec, type PanelSliding, type SlidingSpec } from './sliding';
import type { ConfiguratorState } from './types';

export interface PanelSpec {
  id: string;
  label: string;
  kind: 'fixed' | 'door';
  plane: Plane;
  /** What the customer measured. */
  tightWidthMm: number;
  tightHeightMm: number;
  /** What to cut, after deductions. */
  cutWidthMm: number;
  cutHeightMm: number;
  weightKg: number;
  deductions: PanelDeductions;
  notches: { corner: string; widthMm: number; heightMm: number }[];
  /**
   * Where the holes and notches go, measured from the glass edges. The
   * workshop cuts from these, so they travel with the panel rather than
   * being re-derived at the far end.
   */
  cutouts: {
    description: string;
    /** Height above the bottom edge of this panel's glass. */
    heightMm: number;
    edge: 'hinge side' | 'handle side';
  }[];
  /** Door-only. */
  door?: {
    hingeSide: 'left' | 'right';
    swing: 'out' | 'both';
    sealType: string;
    swingDeductionMm: number;
    hingeBrand: string;
    hingeCount: number;
    hingeReason: string;
    /** Hinge centres above the bottom of the door glass. */
    hingeHeightsMm: number[];
    hingePlacement: HingePlacement;
    handlePlacement: HandlePlacement;
    handleHoleHeightsMm: { lowerMm: number; upperMm: number };
  };
  /**
   * Only on a sliding shower's panes: what the pane is, where it stands and
   * its holes. A sliding door has this and no `door`: it has no hinges.
   */
  sliding?: PanelSliding;
}

export interface ConfiguratorSpec {
  panels: PanelSpec[];
  cornerCount: number;
  totalRunWidthMm: number;
  wallRuns: { wall: string; widthMm: number }[];
  totalChannelLengthMm: number;
  heightMm: number;
  isFloorToCeiling: boolean;
  mounting: 'channel' | 'clamps';
  glassThicknessMm: number;
  totalGlassWeightKg: number;
  support: ReturnType<typeof checkSupportRequirements>;
  rakeNotes: string[];
  warnings: string[];
  /**
   * Things that stop the job rather than merely flag it — a door too wide for
   * any hinge we hang, a panel too narrow to fabricate. Kept apart from
   * warnings so the review screen can say "we can't build this as drawn"
   * rather than burying it in a list the customer scrolls past.
   */
  blockingIssues: string[];
  /** Only on a sliding shower: its kit, header and what is not yet confirmed. See sliding.ts. */
  sliding?: SlidingSpec;
}

/** Bridge the configurator's panel shape into the fabrication library's. */
function toPanelModel(
  state: ConfiguratorState,
  index: number,
  plane: Plane
): PanelModel {
  const p = state.panels[index];
  return {
    panel_id: p.id,
    panel_type: p.kind === 'door' ? 'door_hinged' : 'fixed',
    plane,
    position_index: index,
    hinge_side: p.door?.hinge_side ?? null,
    handle_side: p.door ? (p.door.hinge_side === 'left' ? 'right' : 'left') : null,
    notches: {
      bottom_left: p.notches?.bottom_left ?? false,
      bottom_right: p.notches?.bottom_right ?? false,
      width_mm: p.notches?.width_mm ?? null,
      height_mm: p.notches?.height_mm ?? null,
    },
    top_edge: { type: 'level', direction: null, drop_mm: null },
    mounting_style: state.mounting,
    wall_fix: {
      left: index === 0 && state.leftWall,
      right: index === state.panels.length - 1 && state.rightWall,
    },
    door_swing: p.door ? (p.door.swing === 'both' ? 'both' : 'outward') : null,
    width_mm: p.width_mm,
    height_mm: state.heightMm,
  };
}

function panelLabel(index: number, kind: 'fixed' | 'door', plane: Plane): string {
  const planeName =
    plane === 'return_left'
      ? 'Return left'
      : plane === 'return_right'
        ? 'Return right'
        : plane === 'back'
          ? 'Back'
          : 'Front';
  return `P${index + 1} — ${kind === 'door' ? 'Door' : 'Fixed'} (${planeName})`;
}

/**
 * The cut list for a design, made to one company's rules.
 *
 * Pure: the same design and the same context always give the same spec. The
 * server runs this on every design it receives and stores its own answer.
 */
export function buildSpec(state: ConfiguratorState, context: EngineContext): ConfiguratorSpec {
  // A sliding shower is cut to its maker's formula, not by the deductions
  // below. Nothing else takes this turn.
  if (state.sliding) return buildSlidingSpec(state, context);
  const { rules, companyName } = context;
  const { making, fixed } = rules;
  const planes = derivePlanes(state.panels, state.junctions);
  const panelModels = state.panels.map((_, i) => toPanelModel(state, i, planes[i]));
  const support = checkSupportRequirements(
    rules,
    panelModels,
    state.junctions.some((j) => j.angle_deg === 90)
  );

  const warnings: string[] = [];
  const blockingIssues: string[] = [];

  /** Route a limit check to the right list, prefixed with the panel it is about. */
  const record = (label: string, checks: LimitCheck[]) => {
    for (const c of checks) {
      (c.severity === 'blocking' ? blockingIssues : warnings).push(`${label}: ${c.message}`);
    }
  };

  record('Glass', checkGlassSpec(context, state.glassThicknessMm));

  if (state.heightMm > making.review.standardHeightMaxMm) {
    warnings.push(
      `Review: the glass is ${state.heightMm}mm tall, over ${making.review.standardHeightMaxMm}mm. ${companyName} will check the opening and ceiling by hand before the glass is ordered.`
    );
  }

  const panels: PanelSpec[] = state.panels.map((p, i) => {
    const plane = planes[i];
    const model = panelModels[i];

    const hasLeftCorner = state.junctions[i - 1]?.angle_deg === 90;
    const hasRightCorner = state.junctions[i]?.angle_deg === 90;

    // A single door stops short of the ceiling by its air gap, and a door
    // under a transom stops at its own height. Neither is clamped between
    // floor and ceiling, so neither takes the floor-to-ceiling deduction.
    const underTransom = p.kind === 'door' && hasTransom(state);
    const tightHeight = underTransom
      ? (state.doorHeightMm ?? making.heights.transomDoorHeightMm)
      : state.heightMm;
    const deductions = calculatePanelDeductions(
      rules,
      p.width_mm,
      tightHeight,
      model,
      state.isFloorToCeiling && !isSingleDoor(state) && !underTransom,
      support.supportPanelRequired,
      {
        // At a corner the panel in the front plane runs long and the return
        // tucks behind it, so only one of the pair takes the glass thickness.
        isLongPanel: plane === 'front' || plane === 'back',
        hasLeftCorner,
        hasRightCorner,
        glassThicknessMm: state.glassThicknessMm,
      }
    );

    const notches: PanelSpec['notches'] = [];
    if (p.notches?.bottom_left) {
      notches.push({ corner: 'Bottom left', widthMm: p.notches.width_mm, heightMm: p.notches.height_mm });
    }
    if (p.notches?.bottom_right) {
      notches.push({ corner: 'Bottom right', widthMm: p.notches.width_mm, heightMm: p.notches.height_mm });
    }

    const spec: PanelSpec = {
      id: p.id,
      label: panelLabel(i, p.kind, plane),
      kind: p.kind,
      plane,
      tightWidthMm: p.width_mm,
      tightHeightMm: tightHeight,
      cutWidthMm: deductions.cutWidth,
      cutHeightMm: deductions.cutHeight,
      weightKg: glassWeightKg(rules, deductions.cutWidth, deductions.cutHeight, state.glassThicknessMm),
      deductions,
      notches,
      cutouts: [],
    };

    if (p.kind === 'door' && p.door) {
      const doorDeduction = calculateDoorDeductions(
        rules,
        p.door.swing === 'both' ? 'bi-swing' : 'out-only'
      );

      // The swing deduction comes off the door leaf on top of the mounting
      // deductions already applied above. Everything that follows is sized
      // against the finished leaf, so it has to happen first — picking a
      // hinge against the pre-deduction width is how a door ends up on
      // hardware a few millimetres under-rated.
      spec.cutWidthMm -= doorDeduction.deduction;
      spec.weightKg = glassWeightKg(rules, spec.cutWidthMm, spec.cutHeightMm, state.glassThicknessMm);

      const hinge = selectHingeForDoor(rules, spec.cutWidthMm, spec.cutHeightMm, state.glassThicknessMm);
      const hingePlacement = calculateHingePlacement(rules, spec.cutHeightMm);
      const handlePlacement = calculateHandlePlacement(
        rules,
        spec.cutHeightMm,
        state.handleId === 'knob' ? 'knob' : 'pull_handle',
        hingePlacement
      );
      const hingeHeights = hingeHeightsMm(rules, spec.cutHeightMm, hinge.hingeCount);
      const handleHoles = handleHoleHeightsMm(rules, spec.cutHeightMm);

      spec.door = {
        hingeSide: p.door.hinge_side,
        swing: p.door.swing,
        sealType: doorDeduction.sealType,
        swingDeductionMm: doorDeduction.deduction,
        hingeBrand: hinge.brand,
        hingeCount: hinge.hingeCount,
        hingeReason: hinge.reason,
        hingeHeightsMm: hingeHeights,
        hingePlacement,
        handlePlacement,
        handleHoleHeightsMm: { lowerMm: handleHoles.lowerMm, upperMm: handleHoles.upperMm },
      };

      for (const h of hingeHeights) {
        spec.cutouts.push({
          description: `Hinge notch ${fixed.cutouts.doorHingeNotch.widthMm} × ${fixed.cutouts.doorHingeNotch.heightMm}, r${fixed.cutouts.doorHingeNotch.radiusMm}`,
          heightMm: h,
          edge: 'hinge side',
        });
      }
      if (state.handleId !== 'knob') {
        for (const h of [handleHoles.lowerMm, handleHoles.upperMm]) {
          spec.cutouts.push({
            description: `Handle hole Ø${fixed.handle.holeDiameterMm}, ${fixed.handle.holeInsetMm}mm in from the edge`,
            heightMm: h,
            edge: 'handle side',
          });
        }
      }

      for (const w of hinge.warnings) warnings.push(`${spec.label}: ${w}`);
      if (spec.cutHeightMm > making.review.hingeReviewHeightMm) {
        warnings.push(
          `${spec.label}: Review: the door is ${spec.cutHeightMm}mm tall, over ${making.review.hingeReviewHeightMm}mm. ${companyName} will check the hinge by hand against the door's ${spec.weightKg}kg weight and the maker's current limits.`
        );
      }
      if (hingePlacement.warning) warnings.push(`${spec.label}: ${hingePlacement.warning}`);
      if (handlePlacement.warning) warnings.push(`${spec.label}: ${handlePlacement.warning}`);
      record(spec.label, checkDoorLimits(rules, spec.cutWidthMm, spec.cutHeightMm));
    }

    record(
      spec.label,
      checkPanelLimits(
        rules,
        spec.cutWidthMm,
        spec.cutHeightMm,
        state.glassThicknessMm,
        spec.cutouts.length > 0 || notches.length > 0
      )
    );

    if (spec.cutWidthMm <= 0 || spec.cutHeightMm <= 0) {
      warnings.push(`${spec.label}: deductions exceed the measured size — check the measurements.`);
    }

    return spec;
  });

  // Second pass: mating hinge notches in the fixed panel beside a door.
  //
  // These can only be worked out once every panel's bottom gap is known,
  // because the notch is set at the door hinge's height *above the floor*,
  // not at the same number measured from the fixed panel's own edge. The two
  // panels sit on different gaps — a door 10mm clear of the floor beside a
  // panel in a 7mm channel — so matching the printed numbers would put the
  // hinge leaves 3mm out of line.
  panels.forEach((doorSpec, i) => {
    if (!doorSpec.door) return;
    const neighbourIndex = doorSpec.door.hingeSide === 'left' ? i - 1 : i + 1;
    const neighbour = panels[neighbourIndex];
    // No neighbour means the door hangs off the wall on a wall-to-glass
    // hinge, which needs no glass processing on the other side.
    if (!neighbour || neighbour.kind !== 'fixed') return;

    for (const h of doorSpec.door.hingeHeightsMm) {
      neighbour.cutouts.push({
        description: `Hinge notch ${fixed.cutouts.fixedHingeNotch.widthMm} × ${fixed.cutouts.fixedHingeNotch.heightMm}, r${fixed.cutouts.fixedHingeNotch.radiusMm} — mates with ${doorSpec.label}`,
        heightMm: mateNotchHeightMm(
          h,
          doorSpec.deductions.vertical.bottom,
          neighbour.deductions.vertical.bottom
        ),
        edge: doorSpec.door.hingeSide === 'left' ? 'handle side' : 'hinge side',
      });
    }
  });

  // The channel runs along the bottom of every panel, and up the height of
  // each notch where one is cut.
  const notchAllowance = panels.reduce(
    (sum, p) => sum + p.notches.reduce((n, notch) => n + notch.heightMm, 0),
    0
  );

  // Site conditions, as the customer measured them. Carried through verbatim:
  // these are what the glass is cut to follow, and the workshop should see
  // both the numbers and how they were arrived at.
  const o = state.opening;
  const ctx = openingContext(state);
  const rakeNotes: string[] = [describeWidths(o, ctx)];
  const condition = describeOpening(o, ctx);
  rakeNotes.push(
    condition === 'Square and level throughout.'
      ? 'Customer reports the opening as square and level.'
      : `Out of true: ${condition}`
  );
  if (o.method) {
    rakeNotes.push(
      o.method === 'laser'
        ? `Checked with: ${METHOD_LABELS.laser}, set ${o.laserOffsetMm ?? LASER_OFFSET_DEFAULT_MM}mm off the wall.`
        : `Checked with: ${METHOD_LABELS[o.method]}.`
    );
  }

  if (state.isFloorToCeiling && isSingleDoor(state)) {
    const gap = state.topGapMm ?? making.heights.singleDoorTopGapMm;
    rakeNotes.push(
      o.ceilingHeightMm
        ? `Single door to the ceiling: ceiling ${o.ceilingHeightMm}mm (lowest side), door ${state.heightMm}mm, leaving a ${gap}mm air gap above it.`
        : `Single door to the ceiling with a ${gap}mm air gap above it. Ceiling height not measured.`
    );
  }
  // Ceiling heights at each end of each run, where they were taken. The cut
  // heights above are bounding boxes; a slope here is cut as one straight line
  // between the two readings, and the workshop needs both numbers to do it.
  // The single door reports its ceiling from the cross, above.
  o.runs.forEach((run, i) => {
    if (isSingleDoor(state) && i === 0) return;
    const slope = ceilingSlope(run);
    if (!slope) return;
    const label = ctx.labels?.[i] ?? `Run ${i + 1}`;
    rakeNotes.push(
      slope.dropMm === 0
        ? `${label}: ceiling ${slope.highMm}mm at both ends.`
        : `${label}: ceiling ${slope.highMm}mm at one end falling ${slope.dropMm}mm to ${slope.lowMm}mm at the ${slope.lowEnd} — top edge cut as one straight line between them.`
    );
    if (state.isFloorToCeiling && slope.dropMm > 0) {
      warnings.push(
        `Review: the ceiling along the ${label.toLowerCase()} slopes ${slope.dropMm}mm. The glass on that run is cut to the ${slope.highMm}mm bounding height with a raked top edge; ${companyName} will confirm the ceiling line before ordering.`
      );
    }
    if (!state.isFloorToCeiling && slope.lowMm <= state.heightMm) {
      warnings.push(
        `Review: the ceiling over the ${label.toLowerCase()} is ${slope.lowMm}mm at its lowest, not above the ${state.heightMm}mm glass. ${companyName} will confirm the height with you.`
      );
    }
  });

  if (hasTransom(state)) {
    const doorH = state.doorHeightMm ?? making.heights.transomDoorHeightMm;
    const doors = state.panels.filter((p) => p.kind === 'door');
    if (state.heightMm <= doorH) {
      warnings.push(
        `Review: the glass goes to the ceiling with a transom above the door, but the glass height (${state.heightMm}mm) is not above the door height (${doorH}mm). ${companyName} will confirm the ceiling height with you.`
      );
    } else if (state.aboveDoor === 'glass') {
      warnings.push(
        `Review: glass transom above the door, about ${doors.map((d) => d.width_mm).join(' / ')} × ${state.heightMm - doorH}mm before deductions (door ${doorH}mm, glass to ${state.heightMm}mm). ${companyName} will size the transom and its fixings by hand.`
      );
    } else if (state.aboveDoor === 'open') {
      warnings.push(
        `Review: open transom above the door for ventilation (door ${doorH}mm, fixed glass to ${state.heightMm}mm). ${companyName} will check how the top is fixed by hand.`
      );
    } else {
      warnings.push(
        `Review: the glass goes to the ceiling but nothing is chosen for above the door. ${companyName} will confirm with you.`
      );
    }
  }

  if (support.supportPanelRequired && support.supportPanelReason) {
    warnings.push(`Support panel required: ${support.supportPanelReason}`);
  }
  if (support.supportBarRequired && support.supportBarReason) {
    warnings.push(`Support bar required: ${support.supportBarReason}`);
  }
  if (!state.panels.some((p) => p.kind === 'door')) {
    warnings.push('No door in this run — quoted as fixed panels only.');
  }

  // Calculate per-wall runs for corner units
  const wallRuns: { wall: string; widthMm: number }[] = [];
  const cornerCount = state.junctions.filter((j) => j.angle_deg === 90).length;
  
  if (cornerCount > 0) {
    // Group panels by wall based on corners
    let currentWallIndex = 0;
    let currentWallWidth = 0;
    
    state.panels.forEach((panel, i) => {
      currentWallWidth += panel.width_mm;
      
      // If there's a corner after this panel, save the wall and start a new one
      if (i < state.junctions.length && state.junctions[i].angle_deg === 90) {
        wallRuns.push({ 
          wall: `Wall ${currentWallIndex + 1}`, 
          widthMm: currentWallWidth 
        });
        currentWallIndex++;
        currentWallWidth = 0;
      }
    });
    
    // Add the final wall
    if (currentWallWidth > 0 || wallRuns.length === 0) {
      wallRuns.push({ 
        wall: `Wall ${currentWallIndex + 1}`, 
        widthMm: currentWallWidth 
      });
    }
  }

  return {
    panels,
    cornerCount,
    totalRunWidthMm: totalRunWidthMm(state.panels),
    wallRuns,
    totalChannelLengthMm: totalRunWidthMm(state.panels) + notchAllowance,
    heightMm: state.heightMm,
    // A single door stops short of the ceiling by its air gap, so the glass
    // itself is not floor to ceiling. The note in the opening says why.
    isFloorToCeiling: state.isFloorToCeiling && !isSingleDoor(state),
    mounting: state.mounting,
    glassThicknessMm: state.glassThicknessMm,
    totalGlassWeightKg: Math.round(panels.reduce((s, p) => s + p.weightKg, 0) * 10) / 10,
    support,
    rakeNotes,
    warnings,
    blockingIssues,
  };
}
