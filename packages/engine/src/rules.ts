/**
 * Fabrication rules: the calculations that read a Ruleset.
 *
 * The numbers themselves live in ruleset.ts and are passed in. What is here
 * is how they are applied, as confirmed against CRL's Smart Glazier:
 *
 *   [CONFIRMED]    read back from a live Smart Glazier server recalculation
 *   [MANUFACTURER] CRL's published catalogue or installation manual
 *   [OURS]         installer practice
 *
 * The distinction matters when something disagrees on site. A CONFIRMED rule
 * is what a trade designer with the same hardware produces; a MANUFACTURER
 * number is what the part is rated for; an OURS number is a decision that was
 * made and can change.
 */

import type { Ruleset } from './ruleset';

export type { HingeKit, HingeRating } from './ruleset';

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

/**
 * Glass weight from the *bounding box*, not the cut shape.
 *
 * [CONFIRMED] A raked panel weighs in as the full rectangle. That looks wrong
 * until you remember what the number is for: the toughener prices by the
 * rectangle it has to start from, and the fitter has to carry whatever arrives.
 * Using the true polygon area would under-report both.
 */
export function glassWeightKg(
  rules: Ruleset,
  widthMm: number,
  heightMm: number,
  thicknessMm: number
): number {
  const areaM2 = (widthMm / 1000) * (heightMm / 1000);
  return Math.round(areaM2 * thicknessMm * rules.fixed.glassDensityKgPerM2PerMm * 100) / 100;
}

// ---------------------------------------------------------------------------
// Corners
// ---------------------------------------------------------------------------

/**
 * Width lost by the panel that butts in behind at a corner.
 *
 * [OURS, matches CONFIRMED geometry] At 90° the butting panel sits behind the
 * full thickness of the running panel plus the silicone joint: 12mm for 10mm
 * glass with a 2mm joint. Smart Glazier's own default is t + 1 because it
 * uses a 1mm joint.
 *
 * For angles off 90° the glass is cut across a longer diagonal, so the loss
 * grows as t / sin θ. [CONFIRMED live at 60° → 12mm and at 90° → 11mm with
 * Smart Glazier's own 1mm joint.]
 *
 * The panel that runs through loses nothing: it reaches the outside corner.
 */
export function cornerButtDeductionMm(rules: Ruleset, thicknessMm: number, angleDeg = 90): number {
  const theta = (angleDeg * Math.PI) / 180;
  return Math.round(thicknessMm / Math.sin(theta)) + rules.making.glass.siliconeJointMm;
}

// ---------------------------------------------------------------------------
// Hinges
// ---------------------------------------------------------------------------

export interface HingeSelection {
  kitId: string;
  kitName: string;
  hingeCount: number;
  weightKg: number;
  reason: string;
  warnings: string[];
}

/**
 * Pick the lightest hardware that will actually hold the door.
 *
 * Both width and weight are checked, and they are checked independently.
 * [CONFIRMED] The server suppresses the weight warning when the width warning
 * fires, which can leave a door looking like it has one problem when it has
 * two. We report both, because the fix differs: too wide needs a narrower
 * door, too heavy needs thinner glass or another hinge.
 */
export function selectHinge(
  rules: Ruleset,
  doorWidthMm: number,
  doorHeightMm: number,
  thicknessMm: number
): HingeSelection {
  const { fixed } = rules;
  const weightKg = glassWeightKg(rules, doorWidthMm, doorHeightMm, thicknessMm);
  const warnings: string[] = [];

  if (thicknessMm < fixed.minGlassForHingeMm) {
    warnings.push(
      `${thicknessMm}mm glass is too thin for a shower hinge — ${fixed.minGlassForHingeMm}mm is the minimum.`
    );
  }

  const candidates = fixed.hinges.kits.filter((k) => k.glassMm.includes(thicknessMm));

  // Fewest hinges first, then kit order. A third hinge raises the rating, but
  // it is also another notch in the door, another in the panel beside it, and
  // another thing to line up on site — so two of a stronger hinge beats three
  // of a weaker one whenever both will carry the leaf.
  const ratings = candidates
    .flatMap((kit) => kit.ratings.map((rating) => ({ kit, rating })))
    .sort((a, b) => a.rating.count - b.rating.count);

  for (const { kit, rating } of ratings) {
    if (doorWidthMm <= rating.maxDoorWidthMm && weightKg <= rating.maxDoorWeightKg) {
      const heightWarnings = [...warnings];
      if (kit.maxDoorHeightMm && doorHeightMm > kit.maxDoorHeightMm) {
        heightWarnings.push(
          `Door is ${doorHeightMm}mm tall; ${kit.name} is rated to ${kit.maxDoorHeightMm}mm.`
        );
      }
      return {
        kitId: kit.id,
        kitName: kit.name,
        hingeCount: rating.count,
        weightKg,
        reason: `${rating.count} × ${kit.name} carries ${doorWidthMm}mm / ${weightKg}kg (rated ${rating.maxDoorWidthMm}mm / ${rating.maxDoorWeightKg}kg).`,
        warnings: heightWarnings,
      };
    }
  }

  // Nothing fits. Name the best available rating and say which limit it broke,
  // so the review screen can tell the customer what to change.
  const best = candidates
    .flatMap((k) => k.ratings.map((r) => ({ kit: k, rating: r })))
    .sort((a, b) => b.rating.maxDoorWeightKg - a.rating.maxDoorWeightKg)[0];

  if (!best) {
    warnings.push(`No hinge in our range takes ${thicknessMm}mm glass.`);
    return {
      kitId: 'none',
      kitName: 'None',
      hingeCount: 0,
      weightKg,
      reason: 'No suitable hinge.',
      warnings,
    };
  }

  if (doorWidthMm > best.rating.maxDoorWidthMm) {
    warnings.push(
      `Door is ${doorWidthMm}mm wide; the widest we hang is ${best.rating.maxDoorWidthMm}mm (${best.rating.count} × ${best.kit.name}).`
    );
  }
  if (weightKg > best.rating.maxDoorWeightKg) {
    // The width this door *could* be at its current height and thickness —
    // the number a customer can act on.
    const maxWidth = Math.floor(
      (best.rating.maxDoorWeightKg /
        ((doorHeightMm / 1000) * thicknessMm * fixed.glassDensityKgPerM2PerMm)) *
        1000
    );
    warnings.push(
      `Door weighs ${weightKg}kg; the limit is ${best.rating.maxDoorWeightKg}kg. At ${doorHeightMm}mm tall in ${thicknessMm}mm glass the widest it can be is ${maxWidth}mm.`
    );
  }

  return {
    kitId: best.kit.id,
    kitName: best.kit.name,
    hingeCount: best.rating.count,
    weightKg,
    reason: `Beyond the range of ${best.rating.count} × ${best.kit.name} — needs a different design.`,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Hinge and handle placement
// ---------------------------------------------------------------------------

/**
 * Hinge centre heights, measured up from the bottom of the door glass.
 *
 * [CONFIRMED] Top and bottom sit a fixed distance from their own end; a third
 * hinge is centred on the leaf rather than spaced evenly between the other two.
 */
export function hingeHeightsMm(rules: Ruleset, doorHeightMm: number, count = 2): number[] {
  if (count < 2) return [doorHeightMm / 2];
  const offset = rules.fixed.hinges.offsetMm;
  const heights = [offset, doorHeightMm - offset];
  if (count >= 3) heights.splice(1, 0, Math.round(doorHeightMm / 2));
  return heights.sort((a, b) => a - b);
}

/**
 * Where the mating notch goes in the fixed panel beside the door.
 *
 * [CONFIRMED] This is the rule that catches people out. The notch is set at
 * the door hinge's *absolute height above the floor*, not at the same number
 * from the fixed panel's own edge — the two panels sit on different gaps, so
 * matching the numbers would misalign the hinge leaves.
 *
 * Smart Glazier's worked example: door bottom 10mm off the floor, side panel
 * in a 7mm channel → the side's notch reads 253mm, against the door's 250mm.
 */
export function mateNotchHeightMm(
  hingeHeightOnDoorMm: number,
  doorBottomAboveFloorMm: number,
  panelBottomAboveFloorMm: number
): number {
  return Math.round(hingeHeightOnDoorMm + doorBottomAboveFloorMm - panelBottomAboveFloorMm);
}

/**
 * Handle hole heights, measured up from the bottom of the door glass.
 *
 * [CONFIRMED] The handle is centred vertically on the leaf. Smart Glazier can
 * also lock it to a fixed height from an end; we centre it, which is what a
 * 1990mm door's 893.5 / 1096.5 pair comes from.
 */
export function handleHoleHeightsMm(
  rules: Ruleset,
  doorHeightMm: number
): {
  centreMm: number;
  lowerMm: number;
  upperMm: number;
} {
  const spacing = rules.fixed.handle.holeSpacingMm;
  const centreMm = Math.round((doorHeightMm / 2) * 10) / 10;
  return {
    centreMm,
    lowerMm: Math.round((centreMm - spacing / 2) * 10) / 10,
    upperMm: Math.round((centreMm + spacing / 2) * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Fabrication limits
// ---------------------------------------------------------------------------

export interface LimitCheck {
  code: string;
  severity: 'warning' | 'blocking';
  message: string;
}

/**
 * Size checks for one door leaf.
 *
 * [CONFIRMED] Smart Glazier enforces none of these: no minimum door width, no
 * maximum door height, no panel size limits. It accepted a 100mm door and a
 * 3990mm one. Nothing upstream will catch a nonsense size, so these have to
 * be the engine's.
 */
export function checkDoorLimits(rules: Ruleset, widthMm: number, heightMm: number): LimitCheck[] {
  const limits = rules.making.limits;
  const maxDoorHeightMm = rules.fixed.limits.maxDoorHeightMm;
  const out: LimitCheck[] = [];
  if (widthMm < limits.minDoorWidthMm) {
    out.push({
      code: 'door-too-narrow',
      severity: 'blocking',
      message: `Door is ${widthMm}mm wide. Below ${limits.minDoorWidthMm}mm it is not comfortable to use — widen the door or change the layout.`,
    });
  }
  if (widthMm > limits.maxDoorWidthMm) {
    out.push({
      code: 'door-too-wide',
      severity: 'blocking',
      message: `Door is ${widthMm}mm wide. ${limits.maxDoorWidthMm}mm is the widest single hinged door we hang — consider a double door.`,
    });
  }
  if (heightMm > maxDoorHeightMm) {
    out.push({
      code: 'door-too-tall',
      severity: 'blocking',
      message: `Door is ${heightMm}mm tall. ${maxDoorHeightMm}mm is the published maximum for our hinges.`,
    });
  }
  if (heightMm < limits.minDoorHeightMm) {
    out.push({
      code: 'door-too-short',
      severity: 'warning',
      message: `Door is only ${heightMm}mm tall — check this is what you meant.`,
    });
  }
  return out;
}

/** Size checks for any panel. */
export function checkPanelLimits(
  rules: Ruleset,
  widthMm: number,
  heightMm: number,
  thicknessMm: number,
  hasCutouts: boolean
): LimitCheck[] {
  const limits = rules.making.limits;
  const minWithCutoutsMm = rules.fixed.limits.minPanelWidthWithCutoutsMm;
  const out: LimitCheck[] = [];

  const floor = hasCutouts ? minWithCutoutsMm : limits.minPanelWidthMm;
  if (widthMm < floor) {
    out.push({
      code: 'panel-too-narrow',
      severity: 'blocking',
      message: hasCutouts
        ? `Panel is ${widthMm}mm wide. A panel with a hinge or clamp cutout must be at least ${minWithCutoutsMm}mm — there is not enough glass around the cutout otherwise.`
        : `Panel is ${widthMm}mm wide, below our ${limits.minPanelWidthMm}mm minimum.`,
    });
  }

  const weight = glassWeightKg(rules, widthMm, heightMm, thicknessMm);
  if (weight > limits.maxPanelWeightKg) {
    out.push({
      code: 'panel-too-heavy',
      severity: 'warning',
      message: `Panel weighs ${weight}kg — over our ${limits.maxPanelWeightKg}kg handling limit. It will need extra fixing and more than two people to fit.`,
    });
  }

  return out;
}

/**
 * Seals and gaskets are thickness-specific.
 *
 * [CONFIRMED] Changing a job from 10mm to 12mm silently dropped the PCR10 and
 * P990WS seals from the parts list and moved the door base gap from 10mm back
 * to 7mm — flagged only as a low-severity note, easy to click past. Worth
 * saying loudly whenever the glass is not the company's standard.
 */
export function checkGlassSpec(rules: Ruleset, thicknessMm: number): LimitCheck[] {
  const standard = rules.making.glass.standardThicknessMm;
  if (thicknessMm === standard) return [];
  return [
    {
      code: 'non-standard-glass',
      severity: 'warning',
      message: `${thicknessMm}mm glass is a special — our standard is ${standard}mm. Seals, gaskets and channel are all thickness-specific, so the whole hardware list changes with it.`,
    },
  ];
}
