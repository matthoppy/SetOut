/**
 * Fabrication calculations: what comes off a measured size to give the size
 * the glass is cut to, where the hinges and handle go, and whether the
 * enclosure needs support.
 *
 * Every number comes from the Ruleset passed in. See ruleset.ts.
 */

import type { LatchMeets } from './geometry';
import type { MountingStyle, PanelModel } from './panelModel';
import { cornerButtDeductionMm, selectHinge } from './rules';
import type { Ruleset } from './ruleset';

// ============================================================================
// DEDUCTION CALCULATIONS
// ============================================================================

export interface VerticalDeductions {
  top: number;
  bottom: number;
  total: number;
  breakdown: string[];
}

export interface HorizontalDeductions {
  left: number;
  right: number;
  total: number;
  breakdown: string[];
}

export interface PanelDeductions {
  vertical: VerticalDeductions;
  horizontal: HorizontalDeductions;
  cutWidth: number;
  cutHeight: number;
}

/**
 * Calculate vertical (height) deductions for a panel
 */
export function calculateVerticalDeductions(
  rules: Ruleset,
  mountingStyle: MountingStyle,
  isFloorToCeiling: boolean,
  hasTopChannel: boolean,
  hasBottomChannel: boolean,
  glassAboveDoor: boolean = false,
  isDoor = false
): VerticalDeductions {
  const d = rules.making.deductions;
  const breakdown: string[] = [];
  let top = 0;
  let bottom = 0;

  if (isDoor) {
    // A door sits in no channel and no clamps (Matt, 14 November 2026:
    // "Doors don't take off the top unless it has a glass brace on top or a
    // transom above and that will be 4mm"). Below it is its gap above the tray.
    if (glassAboveDoor && d.door.glassAboveMm) {
      top = d.door.glassAboveMm;
      breakdown.push(`Glass over the door: -${top}mm`);
    }
    bottom = d.door.bottomMm;
    if (bottom) breakdown.push(`Door, bottom: -${bottom}mm`);
  } else if (mountingStyle === 'channel') {
    if (isFloorToCeiling) {
      // Glass to the ceiling sits in a top channel as well, and stands in the
      // bottom channel as any other does.
      if (hasTopChannel && d.channel.ceilingMm) {
        top = d.channel.ceilingMm;
        breakdown.push(`Top channel, to the ceiling: -${top}mm`);
      }
      if (hasBottomChannel && d.channel.bottomMm) {
        bottom = d.channel.bottomMm;
        breakdown.push(`Bottom channel: -${bottom}mm`);
      }
    } else {
      // Fixed glass short of the ceiling: its top is free, and it stands a
      // little way up in the bottom channel.
      if (hasTopChannel && d.channel.topMm) {
        top = d.channel.topMm;
        breakdown.push(`Top: -${top}mm`);
      }
      if (hasBottomChannel && d.channel.bottomMm) {
        bottom = d.channel.bottomMm;
        breakdown.push(`Bottom channel: -${bottom}mm`);
      }
    }
  } else {
    // Clamps: silicone along the bottom, and nothing off the top unless the
    // glass goes up to the ceiling.
    const clampTop = isFloorToCeiling ? d.clamps.ceilingMm : d.clamps.topMm;
    if (hasTopChannel && clampTop) {
      top = clampTop;
      breakdown.push(isFloorToCeiling ? `Top, to the ceiling: -${top}mm` : `Top: -${top}mm`);
    }
    if (hasBottomChannel && d.clamps.bottomMm) {
      bottom = d.clamps.bottomMm;
      breakdown.push(`Bottom, silicone: -${bottom}mm`);
    }
  }

  return {
    top,
    bottom,
    total: top + bottom,
    breakdown,
  };
}

/**
 * Calculate horizontal (width) deductions for a panel
 */
export function calculateHorizontalDeductions(
  rules: Ruleset,
  mountingStyle: MountingStyle,
  hasLeftWallChannel: boolean,
  hasRightWallChannel: boolean,
  isLongPanel: boolean, // At corner: front panel is "long", return is "short"
  hasLeftCorner: boolean,
  hasRightCorner: boolean,
  glassThicknessMm: number,
  isDoor = false,
  /** A door's hinge side, what its hinges fix to, and whether it is fitted without seals. */
  door?: { hingeSide: 'left' | 'right'; hingeOnGlass: boolean; withoutSeals: boolean }
): HorizontalDeductions {
  const d = rules.making.deductions;
  const breakdown: string[] = [];
  let left = 0;
  let right = 0;

  // A door sits in no channel and no clamps. Its hinge side leaves the gap
  // its hinges need: on the wall, a bubble seal's, or CRL's gap for the hinge
  // without seals; on glass, the glass-to-glass hinge's. Its latch side loses
  // its seal alone, which the door's own deduction takes (calculateDoorDeductions).
  if (isDoor) {
    const hingeLeft = door?.hingeSide === 'left';
    const atWall = hingeLeft ? hasLeftWallChannel : hasRightWallChannel;
    const gap = door?.hingeOnGlass
      ? rules.fixed.hinges.glassToGlassGapMm
      : atWall
        ? door?.withoutSeals
          ? rules.fixed.hinges.wallGapWithoutSealsMm
          : d.door.hingeWallMm
        : 0;
    const what = door?.hingeOnGlass ? 'hinged on glass' : door?.withoutSeals ? 'hung on the wall, no seals' : 'hung on the wall, bubble seal';
    if (door && gap) {
      if (hingeLeft) left += gap;
      else right += gap;
      breakdown.push(`${hingeLeft ? 'Left' : 'Right'}, ${what}: -${gap}mm`);
    }
  } else if (mountingStyle === 'channel') {
    if (hasLeftWallChannel) {
      left += d.channel.horizontalMm;
      breakdown.push(`Left wall channel: -${d.channel.horizontalMm}mm`);
    }
    if (hasRightWallChannel) {
      right += d.channel.horizontalMm;
      breakdown.push(`Right wall channel: -${d.channel.horizontalMm}mm`);
    }
  } else {
    // Clamps
    if (hasLeftWallChannel) {
      left += d.clamps.wallMm;
      breakdown.push(`Left clamps: -${d.clamps.wallMm}mm`);
    }
    if (hasRightWallChannel) {
      right += d.clamps.wallMm;
      breakdown.push(`Right clamps: -${d.clamps.wallMm}mm`);
    }
  }

  // Corner deductions. The run carrying the door passes through to the
  // outside corner and loses nothing; the return butts in behind it and
  // loses the glass thickness plus the silicone joint.
  const cornerDeduction = isLongPanel ? 0 : cornerButtDeductionMm(rules, glassThicknessMm);
  if (hasLeftCorner) {
    left += cornerDeduction;
    breakdown.push(
      `Left corner (${isLongPanel ? 'runs through' : 'butts behind'}): -${cornerDeduction}mm`
    );
  }
  if (hasRightCorner) {
    right += cornerDeduction;
    breakdown.push(
      `Right corner (${isLongPanel ? 'runs through' : 'butts behind'}): -${cornerDeduction}mm`
    );
  }

  return {
    left,
    right,
    total: left + right,
    breakdown,
  };
}

/**
 * The seal on a door's latch side, and what it takes off the door (Matt, 14
 * November 2026: "an h stop is only against a glass to glass, you can have a
 * 90degree for a stop at a corner that goes on the fixed panel, but against a
 * wall it's a bubble that open both ways or you can silicone a 90degree clear
 * angle against the wall and that will be 5mm"). A door that swings both ways
 * closes on a bubble seal. One that opens out closes against a stop: an h seal
 * against glass in line, a 90° stop seal on the panel at a corner, or a clear
 * 90° angle siliconed to the wall.
 */
/**
 * The h seal is written in lower case, as it is shaped: one h seal where the
 * door closes against the fixed panel, glass to glass, and not the H-shaped
 * seal (Matt, 14 November 2026: "It's just 1 h seal and it's lower case as
 * there is another seal that looks like H, against fixed panel for glass to
 * glass").
 */
export type SealType = 'bubble seal' | 'h seal' | '90° stopper seal' | 'clear 90° angle';

export function calculateDoorDeductions(
  rules: Ruleset,
  swingType: 'bi-swing' | 'out-only',
  meets: LatchMeets = 'open'
): { deduction: number; sealType: SealType } {
  const door = rules.making.deductions.door;
  if (swingType === 'bi-swing') return { deduction: door.bothWaysMm, sealType: 'bubble seal' };
  const sealType: SealType = meets === 'glass' ? 'h seal' : meets === 'wall' ? 'clear 90° angle' : '90° stopper seal';
  return { deduction: door.outOnlyMm, sealType };
}

/**
 * Calculate complete panel deductions and cut size
 */
export function calculatePanelDeductions(
  rules: Ruleset,
  tightWidthMm: number,
  tightHeightMm: number,
  panel: PanelModel,
  isFloorToCeiling: boolean,
  /** Glass runs over the door's head: a support panel bracing it, or a transom. */
  glassAboveDoor: boolean,
  cornerConfig: {
    isLongPanel: boolean;
    hasLeftCorner: boolean;
    hasRightCorner: boolean;
    glassThicknessMm: number;
    door?: { hingeSide: 'left' | 'right'; hingeOnGlass: boolean; withoutSeals: boolean };
  }
): PanelDeductions {
  const vertical = calculateVerticalDeductions(
    rules,
    panel.mounting_style,
    isFloorToCeiling,
    true, // hasTopChannel - typically always true
    true, // hasBottomChannel - typically always true
    panel.panel_type === 'door_hinged' && glassAboveDoor,
    panel.panel_type === 'door_hinged'
  );

  const horizontal = calculateHorizontalDeductions(
    rules,
    panel.mounting_style,
    panel.wall_fix.left,
    panel.wall_fix.right,
    cornerConfig.isLongPanel,
    cornerConfig.hasLeftCorner,
    cornerConfig.hasRightCorner,
    cornerConfig.glassThicknessMm,
    panel.panel_type === 'door_hinged',
    cornerConfig.door
  );

  return {
    vertical,
    horizontal,
    cutWidth: tightWidthMm - horizontal.total,
    cutHeight: tightHeightMm - vertical.total,
  };
}

// ============================================================================
// HINGE PLACEMENT
// ============================================================================

export interface HingePlacement {
  topHingeOffset: number; // Distance from top edge to center of top hinge
  bottomHingeOffset: number; // Distance from bottom edge to center of bottom hinge
  clearGap: number; // Space between hinges
  warning: string | null;
}

/**
 * Calculate hinge placement (edge-based, 2-hinge system)
 *
 * Hinges sit a fixed distance from the top and bottom of the door glass, not
 * a percentage of the height. Confirmed against CRL's own designer: a 1990mm
 * door and a 2290mm door both place their hinges at 250mm.
 */
export function calculateHingePlacement(rules: Ruleset, glassHeightMm: number): HingePlacement {
  const hinges = rules.fixed.hinges;
  const offset = hinges.offsetMm;

  // Calculate clear gap between hinges
  const clearGap = glassHeightMm - 2 * offset - 2 * (hinges.cutoutHeightMm / 2);

  // Warning if gap is too small
  let warning: string | null = null;
  if (clearGap < hinges.minClearGapMm) {
    warning = `Hinge clear gap (${clearGap}mm) is less than ${hinges.minClearGapMm}mm minimum`;
  }

  return {
    topHingeOffset: offset,
    bottomHingeOffset: offset,
    clearGap,
    warning,
  };
}

// ============================================================================
// HANDLE PLACEMENT
// ============================================================================

export interface HandlePlacement {
  handleHeight: number; // Height to center/bottom of handle
  edgeClearance: number; // Distance from edge of glass
  isValid: boolean;
  warning: string | null;
}

/**
 * Calculate handle placement.
 *
 * A pull handle is centred vertically on the leaf: its two holes straddle the
 * centre, set in from the handle edge. On a 1990mm door with a 203mm pull
 * that puts them at 893.5mm and 1096.5mm.
 *
 * A knob keeps its fixed height, which is a comfortable grab height
 * regardless of how tall the door is.
 */
export function calculateHandlePlacement(
  rules: Ruleset,
  glassHeightMm: number,
  handleType: 'knob' | 'pull_handle',
  hingePlacement: HingePlacement
): HandlePlacement {
  const { handle, hinges } = rules.fixed;

  // Handle extent, measured from the bottom of the glass.
  const centre = handleType === 'knob' ? handle.knobCentreMm : glassHeightMm / 2;
  const halfSpan = handleType === 'knob' ? handle.knobHalfSpanMm : handle.holeSpacingMm / 2;
  const handleBottom = centre - halfSpan;
  const handleTop = centre + halfSpan;

  // Check for interference with hinges
  const bottomHingeTop = hingePlacement.bottomHingeOffset + hinges.cutoutHeightMm / 2;
  const topHingeBottom = glassHeightMm - hingePlacement.topHingeOffset - hinges.cutoutHeightMm / 2;

  let warning: string | null = null;
  let isValid = true;

  if (
    handleBottom < bottomHingeTop + handle.hingeClearanceMm ||
    handleTop > topHingeBottom - handle.hingeClearanceMm
  ) {
    warning = 'Handle position may conflict with hinge location';
    isValid = false;
  }

  return {
    handleHeight: Math.round(centre * 10) / 10,
    edgeClearance: handle.holeInsetMm,
    isValid,
    warning,
  };
}

// ============================================================================
// SUPPORT STRUCTURE CHECKS
// ============================================================================

export interface SupportCheck {
  supportPanelRequired: boolean;
  supportPanelReason: string | null;
  supportBarRequired: boolean;
  supportBarReason: string | null;
  supportBarPanelId: string | null;
}

/**
 * Check if support structures are needed based on panel configuration
 */
export function checkSupportRequirements(
  rules: Ruleset,
  panels: PanelModel[],
  isSquareShower: boolean
): SupportCheck {
  const support = rules.making.support;
  const result: SupportCheck = {
    supportPanelRequired: false,
    supportPanelReason: null,
    supportBarRequired: false,
    supportBarReason: null,
    supportBarPanelId: null,
  };

  if (!isSquareShower) return result;

  // Find door panels
  const doorPanels = panels.filter((p) => p.panel_type === 'door_hinged');
  const returnPanels = panels.filter((p) => p.plane === 'return_left' || p.plane === 'return_right');

  // Check for support panel need (narrow adjacent fixed panel)
  for (const door of doorPanels) {
    const adjacentPanels = panels.filter(
      (p) => p.panel_type === 'fixed' && Math.abs(p.position_index - door.position_index) === 1
    );

    for (const adjacent of adjacentPanels) {
      if (adjacent.width_mm && adjacent.width_mm <= support.narrowFixedPanelMm) {
        result.supportPanelRequired = true;
        result.supportPanelReason = `Narrow fixed panel ${adjacent.panel_id} (${adjacent.width_mm}mm) adjacent to door`;
        break;
      }
    }
  }

  // Check for support bar need (wide return panel)
  for (const returnPanel of returnPanels) {
    if (returnPanel.width_mm && returnPanel.width_mm >= support.wideReturnPanelMm) {
      // Check if it's "on its own" (not tied into other structure)
      const hasSupportPanelTieIn = result.supportPanelRequired;

      if (!hasSupportPanelTieIn) {
        result.supportBarRequired = true;
        result.supportBarReason = `Return panel ${returnPanel.panel_id} is ${returnPanel.width_mm}mm+ and free-standing`;
        result.supportBarPanelId = returnPanel.panel_id;
        break;
      }
    }
  }

  return result;
}

// ============================================================================
// HINGE SELECTION
// ============================================================================

export interface DoorHingeSelection {
  brand: string;
  /** How many hinges the rating assumes: a third hinge raises the limits. */
  hingeCount: number;
  weightKg: number;
  isAutoSelected: boolean;
  reason: string;
  warnings: string[];
}

/**
 * Select appropriate hinge hardware based on door dimensions.
 *
 * The limits, and the fact that a third hinge changes them, are in the
 * ruleset's hinge kits.
 */
export function selectHingeForDoor(
  rules: Ruleset,
  doorWidthMm: number,
  doorHeightMm: number,
  glassThicknessMm: number
): DoorHingeSelection {
  const picked = selectHinge(rules, doorWidthMm, doorHeightMm, glassThicknessMm);
  return {
    brand: picked.kitName,
    hingeCount: picked.hingeCount,
    weightKg: picked.weightKg,
    isAutoSelected: true,
    reason: picked.reason,
    warnings: picked.warnings,
  };
}
