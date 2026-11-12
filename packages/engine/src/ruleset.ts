/**
 * The making rules, as data.
 *
 * Every number the engine cuts glass by lives in a Ruleset and is passed in.
 * Nothing in the calculation code imports a constant, so two companies can
 * make the same design to different clearances, and an old revision can be
 * recomputed with the rules it was made under.
 *
 * A ruleset has two halves, and the split is deliberate:
 *
 *   making  What a company may adjust: clearances, deductions, default
 *           heights and its own size limits. A company's changes are stored
 *           as overrides and checked against ADJUSTABLE before they are used.
 *
 *   fixed   What SetOut holds for everyone: hinge ratings, fabrication limits
 *           and hardware geometry. A hinge is rated for what it is rated for,
 *           whoever fits it.
 *
 * The defaults are Custom Showers' own numbers. Each carries where it came
 * from, because that decides who may change it:
 *
 *   [CONFIRMED]    read back from a live CRL Smart Glazier recalculation
 *   [MANUFACTURER] CRL's published catalogue or installation manual
 *   [OURS]         installer practice, a decision that can be changed
 */

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface MakingRules {
  glass: {
    /** [OURS] The thickness a job is made in unless it says otherwise. */
    standardThicknessMm: number;
    /** [OURS] Glass-to-glass silicone at a butt joint. Smart Glazier uses 1. */
    siliconeJointMm: number;
  };
  /** What comes off a measured size to give the cut size. */
  deductions: {
    channel: {
      /** Top and bottom, each, for glass that stops short of the ceiling. */
      verticalMm: number;
      /** At each wall the glass meets. */
      horizontalMm: number;
      /** Top and bottom, each, when the glass is fitted floor to ceiling. */
      floorToCeilingMm: number;
    };
    /** Every edge held by clamps. */
    clampMm: number;
    door: {
      /** A door that only opens out, on a 90° stopper seal. */
      outOnlyMm: number;
      /** A door that swings both ways, on a bubble seal. */
      bothWaysMm: number;
    };
    /** Off the door's height when a support panel runs over its head. */
    supportPanelHeadMm: number;
  };
  heights: {
    /** [OURS] Air gap above a single door that goes up to the ceiling. */
    singleDoorTopGapMm: number;
    /** [OURS] Starting door height under a transom. */
    transomDoorHeightMm: number;
  };
  /** When a job stops being routine and is looked at by hand. Never blocks. */
  review: {
    standardHeightMaxMm: number;
    hingeReviewHeightMm: number;
  };
  support: {
    /** A fixed panel this narrow beside a door needs a support panel. */
    narrowFixedPanelMm: number;
    /** A return panel this wide on its own needs a support bar. */
    wideReturnPanelMm: number;
  };
  /** [OURS] The company's own size limits. */
  limits: {
    minDoorWidthMm: number;
    maxDoorWidthMm: number;
    minDoorHeightMm: number;
    minPanelWidthMm: number;
    maxPanelWeightKg: number;
  };
}

export interface HingeRating {
  /** How many hinges this rating assumes. */
  count: number;
  maxDoorWidthMm: number;
  maxDoorWeightKg: number;
}

export interface HingeKit {
  id: string;
  name: string;
  /** Glass thicknesses the hinge accepts. */
  glassMm: number[];
  ratings: HingeRating[];
  /** [MANUFACTURER] The published ceiling, where there is one. */
  maxDoorHeightMm: number | null;
}

export interface NotchCutout {
  widthMm: number;
  heightMm: number;
  radiusMm: number;
}

/**
 * The shape of a hinge's cut-out, in mm, as its maker's glass fabrication
 * template draws it. Heights are along the glass edge, depths into the glass.
 *
 *   notch       a notch with rounded inner corners
 *   notch-ears  a square-cornered notch with a round relief hole ("mouse
 *               ear") at each inner corner, as CRL's Geneva and Vienna
 *               templates have it: the ears' centres so far in from the glass
 *               edge and so far apart along it
 *   holes       a pair of holes, so far in from the glass edge and so far
 *               apart along it, centred on the hinge
 */
export type CutoutShape =
  | { kind: 'notch'; heightMm: number; depthMm: number; radiusMm: number }
  | { kind: 'notch-ears'; heightMm: number; depthMm: number; earDiameterMm: number; earInMm: number; earApartMm: number }
  | { kind: 'holes'; diameterMm: number; inMm: number; apartMm: number };

export interface CutoutTemplate {
  /** What it is, on the templates page. */
  name: string;
  /** Whose template its sizes are from. */
  source: string;
  shape: CutoutShape;
}

/** A hinge kit's cut-outs: in the door, and in the panel it hangs from, in line or round a corner. */
export interface HingeCutouts {
  door?: CutoutTemplate;
  panelInLine?: CutoutTemplate;
  panelAtCorner?: CutoutTemplate;
}

export interface FixedRules {
  /** [CONFIRMED] Toughened glass density. 10mm glass weighs 25 kg/m². */
  glassDensityKgPerM2PerMm: number;
  /** [CONFIRMED] Thinner glass cannot carry a shower hinge. */
  minGlassForHingeMm: number;
  limits: {
    /** [MANUFACTURER] Bellagio's published ceiling. */
    maxDoorHeightMm: number;
    /** [CONFIRMED] A panel carrying any cutout must be at least this wide. */
    minPanelWidthWithCutoutsMm: number;
    /** [CONFIRMED] A hole centre nearer than this to an edge fails fabrication. */
    minHoleEdgeDistanceMm: number;
  };
  hinges: {
    kits: HingeKit[];
    /** [CONFIRMED] Hinges sit this far from the top and bottom of the door glass. */
    offsetMm: number;
    /** Height of the hinge notch, used to check the hinges and handle clear each other. */
    cutoutHeightMm: number;
    /** Less clear glass than this between two hinges is flagged. */
    minClearGapMm: number;
    /**
     * [OURS] Matt, 11 November 2026. The gap a glass-to-glass hinge leaves
     * between a door and the panel it hangs from, in line. It comes out of the
     * door's own deduction, so the cut size is the same and the rest of the
     * deduction stays at the latch.
     */
    glassToGlassGapMm: number;
    /**
     * [MANUFACTURER] Each kit's own cut-outs, by kit id, from its maker's
     * glass fabrication template. A cut-out not given here is SetOut's own
     * notch (cutouts.doorHingeNotch and cutouts.fixedHingeNotch), to be
     * checked against the template that comes with the hinge.
     */
    cutouts: Record<string, HingeCutouts>;
  };
  handle: {
    /** [CONFIRMED] Handle holes are 203mm apart: an 8 inch pull. */
    holeSpacingMm: number;
    /** [CONFIRMED] Hole centres sit this far in from the handle-side edge. */
    holeInsetMm: number;
    /** [CONFIRMED] Hole diameter through the glass. */
    holeDiameterMm: number;
    /** A knob sits at a fixed, comfortable height whatever the door. */
    knobCentreMm: number;
    knobHalfSpanMm: number;
    /** A handle nearer than this to a hinge notch is flagged. */
    hingeClearanceMm: number;
  };
  /**
   * [OURS] Where the toughening stamp goes, as on Custom Showers' own glass
   * orders (November 2026): a bottom corner, this far up, and this far in from
   * the side. A fixed panel has it away from its hinges; a door on its hinge
   * side.
   */
  stamp: {
    upMm: number;
    fixedInMm: number;
    doorInMm: number;
  };
  /** [CONFIRMED] Cutout sizes for the hardware. The toughener rejects sharper shapes. */
  cutouts: {
    /** Edge notch in the door leaf for a glass hinge. */
    doorHingeNotch: NotchCutout;
    /** Edge notch in the fixed panel that mates with it. */
    fixedHingeNotch: NotchCutout;
    /** Through-hole for a wall clamp. */
    clampHole: { diameterMm: number; insetMm: number };
  };
}

export interface Ruleset {
  making: MakingRules;
  fixed: FixedRules;
}

/** What the engine needs to know about the company it is working for. */
export interface EngineContext {
  rules: Ruleset;
  /** How the company is named in the review notes its customers read. */
  companyName: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_MAKING_RULES: MakingRules = {
  glass: {
    standardThicknessMm: 10,
    siliconeJointMm: 2,
  },
  deductions: {
    channel: { verticalMm: 10, horizontalMm: 5, floorToCeilingMm: 12 },
    clampMm: 3,
    door: { outOnlyMm: 5, bothWaysMm: 9 },
    supportPanelHeadMm: 4,
  },
  heights: {
    singleDoorTopGapMm: 30,
    transomDoorHeightMm: 2000,
  },
  review: {
    standardHeightMaxMm: 2000,
    hingeReviewHeightMm: 2200,
  },
  support: {
    narrowFixedPanelMm: 200,
    wideReturnPanelMm: 1200,
  },
  limits: {
    minDoorWidthMm: 450,
    maxDoorWidthMm: 1000,
    minDoorHeightMm: 1400,
    minPanelWidthMm: 150,
    maxPanelWeightKg: 50,
  },
};

export const FIXED_RULES: FixedRules = {
  glassDensityKgPerM2PerMm: 2.5,
  minGlassForHingeMm: 8,
  limits: {
    maxDoorHeightMm: 2500,
    minPanelWidthWithCutoutsMm: 120,
    minHoleEdgeDistanceMm: 25,
  },
  hinges: {
    /**
     * [CONFIRMED live] These were the only size limits Smart Glazier enforced
     * on the Custom Showers account. It accepted everything else, including a
     * 3990mm door.
     */
    kits: [
      {
        id: 'geneva',
        name: 'Geneva',
        glassMm: [8, 10, 12],
        ratings: [
          { count: 2, maxDoorWidthMm: 711, maxDoorWeightKg: 36 },
          { count: 3, maxDoorWidthMm: 813, maxDoorWeightKg: 54 },
        ],
        maxDoorHeightMm: null,
      },
      {
        // [MANUFACTURER] Checked against CRL's UK catalogue, November 2026
        // (docs/crl/): two Vienna hinges carry 45kg at 864mm on the offset
        // (V1E044) and short (V1E074) back plates in 10mm glass, and 50kg at
        // 914mm on the full back plate (V1E037) and glass to glass (V1E180,
        // V1E092); three carry 59kg and 63kg. The lower is held here, as
        // SetOut does not choose the back plate. CRL rates Vienna for 12mm
        // glass too (813mm on the offset plates); Custom Showers hangs 12mm
        // doors on Geneva, as Smart Glazier did on its account.
        id: 'vienna',
        name: 'Vienna',
        glassMm: [10],
        ratings: [{ count: 2, maxDoorWidthMm: 864, maxDoorWeightKg: 45 }],
        maxDoorHeightMm: null,
      },
      {
        id: 'bellagio',
        name: 'Bellagio',
        glassMm: [8, 10],
        ratings: [{ count: 2, maxDoorWidthMm: 1000, maxDoorWeightKg: 50 }],
        maxDoorHeightMm: 2500,
      },
    ],
    offsetMm: 250,
    cutoutHeightMm: 47,
    minClearGapMm: 400,
    glassToGlassGapMm: 3,
    cutouts: {
      geneva: {
        // CRL's Geneva door cut-out is the same in its wall mount (GEN037)
        // and glass-to-glass (GEN180) templates, in CRL's own mm. Custom
        // Showers' Geneva 90° orders show it too, ears and all.
        door: {
          name: 'Geneva hinge notch',
          source: 'CRL GEN037 and GEN180 glass fabrication templates',
          shape: { kind: 'notch-ears', heightMm: 63, depthMm: 44, earDiameterMm: 16, earInMm: 38, earApartMm: 57 },
        },
        // In line (GEN180) the panel takes the same cut-out as the door: the
        // hinge is the same either side. Only the 90° hinge (GEN092) takes two
        // holes in the fixed panel instead (CRL's UK brochure, SDH17UKA p.7):
        // 16mm, 37mm in as on Custom Showers' Geneva 90° orders, and 57 apart
        // as the hinge's screws are on CRL's GEN180 drawing.
        panelInLine: {
          name: 'Geneva hinge notch',
          source: 'CRL GEN037 and GEN180 glass fabrication templates',
          shape: { kind: 'notch-ears', heightMm: 63, depthMm: 44, earDiameterMm: 16, earInMm: 38, earApartMm: 57 },
        },
        panelAtCorner: {
          name: 'Geneva 90° hinge holes',
          source: 'CRL GEN092 (two holes in the fixed panel); 16mm, 37mm in as on Custom Showers’ orders',
          shape: { kind: 'holes', diameterMm: 16, inMm: 37, apartMm: 57 },
        },
      },
      vienna: {
        // CRL's V1E037 template, in inches: 3" overall, ears 2-3/4" apart
        // and 1-9/16" in, 1-13/16" deep, 5/8" ears. To the nearest mm. In
        // line (V1E180) the panel takes the same cut-out, as with Geneva; the
        // 90° hinge (V1E092) takes two holes in the panel, whose sizes are not
        // published, so SetOut's own notch stands in for those, flagged.
        door: {
          name: 'Vienna hinge notch',
          source: 'CRL V1E037 glass fabrication template',
          shape: { kind: 'notch-ears', heightMm: 76, depthMm: 46, earDiameterMm: 16, earInMm: 40, earApartMm: 70 },
        },
        panelInLine: {
          name: 'Vienna hinge notch',
          source: 'CRL V1E037 glass fabrication template',
          shape: { kind: 'notch-ears', heightMm: 76, depthMm: 46, earDiameterMm: 16, earInMm: 40, earApartMm: 70 },
        },
      },
    },
  },
  handle: {
    holeSpacingMm: 203,
    holeInsetMm: 76,
    holeDiameterMm: 12,
    knobCentreMm: 950,
    knobHalfSpanMm: 25,
    hingeClearanceMm: 50,
  },
  stamp: { upMm: 5, fixedInMm: 59, doorInMm: 50 },
  cutouts: {
    doorHingeNotch: { widthMm: 58, heightMm: 47, radiusMm: 8 },
    fixedHingeNotch: { widthMm: 52, heightMm: 33, radiusMm: 8 },
    clampHole: { diameterMm: 16, insetMm: 25 },
  },
};

/** SetOut's rules with no company changes. */
export const DEFAULT_RULESET: Ruleset = {
  making: DEFAULT_MAKING_RULES,
  fixed: FIXED_RULES,
};

// ---------------------------------------------------------------------------
// Company overrides
// ---------------------------------------------------------------------------

/** A whole number of millimetres or kilograms between two bounds, or one of a list. */
export type Adjustable = { min: number; max: number } | { oneOf: number[] };

/**
 * Every rule a company may change, and how far.
 *
 * PROVISIONAL. The mechanism is settled; the bounds are a first, cautious
 * guess and are to be agreed with a glazier before the company settings
 * screen lets anyone use them. Until then no company has overrides, so every
 * design is made with the defaults above.
 */
export const ADJUSTABLE = {
  'glass.standardThicknessMm': { oneOf: [8, 10, 12] },
  'glass.siliconeJointMm': { min: 1, max: 3 },
  'deductions.channel.verticalMm': { min: 5, max: 15 },
  'deductions.channel.horizontalMm': { min: 2, max: 10 },
  'deductions.channel.floorToCeilingMm': { min: 8, max: 20 },
  'deductions.clampMm': { min: 2, max: 6 },
  'deductions.door.outOnlyMm': { min: 3, max: 8 },
  'deductions.door.bothWaysMm': { min: 6, max: 12 },
  'deductions.supportPanelHeadMm': { min: 0, max: 8 },
  'heights.singleDoorTopGapMm': { min: 10, max: 100 },
  'heights.transomDoorHeightMm': { min: 1800, max: 2200 },
  'review.standardHeightMaxMm': { min: 1800, max: 2400 },
  'review.hingeReviewHeightMm': { min: 2000, max: 2500 },
  'support.narrowFixedPanelMm': { min: 150, max: 300 },
  'support.wideReturnPanelMm': { min: 900, max: 1500 },
  'limits.minDoorWidthMm': { min: 400, max: 600 },
  'limits.maxDoorWidthMm': { min: 700, max: 1000 },
  'limits.minDoorHeightMm': { min: 1000, max: 1800 },
  'limits.minPanelWidthMm': { min: 120, max: 300 },
  'limits.maxPanelWeightKg': { min: 30, max: 60 },
} as const satisfies Record<string, Adjustable>;

export type AdjustableRule = keyof typeof ADJUSTABLE;

/** A company's changes to the making rules, by rule name. */
export type RulesetOverrides = Partial<Record<AdjustableRule, number>>;

export class RulesetError extends Error {
  constructor(
    readonly rule: string,
    message: string
  ) {
    super(message);
    this.name = 'RulesetError';
  }
}

function setByPath(target: Record<string, unknown>, path: string, value: number): void {
  const keys = path.split('.');
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>;
  node[keys[keys.length - 1]] = value;
}

/**
 * The rules a company's designs are made with: the defaults, with that
 * company's overrides applied.
 *
 * Throws a RulesetError for a rule that does not exist, is not adjustable, or
 * is outside its bounds. Overrides come from a settings screen and are stored
 * as JSON, so they are checked here every time they are read, not trusted.
 */
export function resolveRuleset(overrides: unknown = {}): Ruleset {
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new RulesetError('', 'Ruleset overrides must be an object of rule names to numbers.');
  }
  const making = structuredClone(DEFAULT_MAKING_RULES);

  for (const [rule, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(ADJUSTABLE, rule)) {
      throw new RulesetError(rule, `"${rule}" is not a rule a company can change.`);
    }
    const bounds: Adjustable = ADJUSTABLE[rule as AdjustableRule];
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new RulesetError(rule, `"${rule}" must be a whole number.`);
    }
    if ('oneOf' in bounds) {
      if (!bounds.oneOf.includes(value)) {
        throw new RulesetError(rule, `"${rule}" must be one of ${bounds.oneOf.join(', ')}.`);
      }
    } else if (value < bounds.min || value > bounds.max) {
      throw new RulesetError(rule, `"${rule}" must be between ${bounds.min} and ${bounds.max}.`);
    }
    setByPath(making as unknown as Record<string, unknown>, rule, value);
  }

  return { making, fixed: FIXED_RULES };
}
