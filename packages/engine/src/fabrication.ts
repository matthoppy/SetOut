/**
 * Fabrication calculations: what comes off a measured size to give the size
 * the glass is cut to, where the hinges and handle go, and whether the
 * enclosure needs support.
 *
 * Every number comes from the Ruleset passed in. See ruleset.ts.
 */

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
  supportPanelRequired: boolean = false
): VerticalDeductions {
  const d = rules.making.deductions;
  const breakdown: string[] = [];
  let top = 0;
  let bottom = 0;

  if (mountingStyle === 'channel') {
    if (isFloorToCeiling) {
      // Floor-to-ceiling requires larger deduction for installation
      if (hasTopChannel) {
        top = d.channel.floorToCeilingMm;
        breakdown.push(`Top channel (F2C): -${top}mm`);
      }
      if (hasBottomChannel) {
        bottom = d.channel.floorToCeilingMm;
        breakdown.push(`Bottom channel (F2C): -${bottom}mm`);
      }
    } else {
      // Standard installation
      if (hasTopChannel) {
        top = d.channel.verticalMm;
        breakdown.push(`Top channel: -${top}mm`);
      }
      if (hasBottomChannel) {
        bottom = d.channel.verticalMm;
        breakdown.push(`Bottom channel: -${bottom}mm`);
      }
    }
  } else {
    // Clamps
    if (hasTopChannel) {
      top = d.clampMm;
      breakdown.push(`Top clamps: -${top}mm`);
    }
    if (hasBottomChannel) {
      bottom = d.clampMm;
      breakdown.push(`Bottom clamps: -${bottom}mm`);
    }
  }

  // Support panel deduction (affects door height)
  if (supportPanelRequired) {
    top += d.supportPanelHeadMm;
    breakdown.push(`Support panel clearance: -${d.supportPanelHeadMm}mm`);
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
  glassThicknessMm: number
): HorizontalDeductions {
  const d = rules.making.deductions;
  const breakdown: string[] = [];
  let left = 0;
  let right = 0;

  // Wall channel deductions
  if (mountingStyle === 'channel') {
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
      left += d.clampMm;
      breakdown.push(`Left clamps: -${d.clampMm}mm`);
    }
    if (hasRightWallChannel) {
      right += d.clampMm;
      breakdown.push(`Right clamps: -${d.clampMm}mm`);
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
 * Calculate door-specific deductions
 */
export function calculateDoorDeductions(
  rules: Ruleset,
  swingType: 'bi-swing' | 'out-only'
): { deduction: number; sealType: string } {
  const door = rules.making.deductions.door;
  if (swingType === 'bi-swing') {
    return {
      deduction: door.bothWaysMm,
      sealType: 'bubble seal',
    };
  } else {
    return {
      deduction: door.outOnlyMm,
      sealType: '90° stopper seal',
    };
  }
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
  supportPanelRequired: boolean,
  cornerConfig: {
    isLongPanel: boolean;
    hasLeftCorner: boolean;
    hasRightCorner: boolean;
    glassThicknessMm: number;
  }
): PanelDeductions {
  const vertical = calculateVerticalDeductions(
    rules,
    panel.mounting_style,
    isFloorToCeiling,
    true, // hasTopChannel - typically always true
    true, // hasBottomChannel - typically always true
    panel.panel_type === 'door_hinged' && supportPanelRequired
  );

  const horizontal = calculateHorizontalDeductions(
    rules,
    panel.mounting_style,
    panel.wall_fix.left,
    panel.wall_fix.right,
    cornerConfig.isLongPanel,
    cornerConfig.hasLeftCorner,
    cornerConfig.hasRightCorner,
    cornerConfig.glassThicknessMm
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
