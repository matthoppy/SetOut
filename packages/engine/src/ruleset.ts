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
 *   [UNCONFIRMED]  SetOut's own stand-in, not yet agreed with Matt or checked
 *                  against a job. Only the sliding door rules carry it, and
 *                  sliding stays hidden from customers until they are settled.
 *                  Each is a question in docs/sliding-plan.md.
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
      /**
       * [OURS] At each wall the glass meets: about half the channel's 19mm
       * depth, so the glass sits half way in it (Matt, 13 November 2026: "the
       * channel depth is 19mm and we deduct off 10mm from the glass so the
       * glass sits about half way in the channel"). CRL's own default is 5.
       */
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
      /**
       * [OURS] A door's edge at a wall on a channel job, where it hangs on
       * wall hinges or closes against the wall. It is not in the channel, so
       * it keeps the 5mm it has always had when the channel's own deduction
       * rose to 10 (13 November 2026). Matt to confirm the gap he leaves.
       */
      wallMm: number;
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
  /** A notch set in a shallow rebate along the edge, taller than the notch. */
  | { kind: 'notch-rebated'; heightMm: number; depthMm: number; radiusMm: number; rebateHeightMm: number; rebateDepthMm: number }
  | { kind: 'notch-ears'; heightMm: number; depthMm: number; earDiameterMm: number; earInMm: number; earApartMm: number }
  | { kind: 'holes'; diameterMm: number; inMm: number; apartMm: number };

export interface CutoutTemplate {
  /** What it is, on the templates page. */
  name: string;
  /**
   * Whose template its sizes are from. Null for a cut-out not checked against
   * the maker's drawing of the hinge it is for, to be checked against the
   * template in the box.
   */
  source: string | null;
  shape: CutoutShape;
}

/** A hinge kit's cut-outs: in the door, and in the panel it hangs from, in line or round a corner. */
export interface HingeCutouts {
  door?: CutoutTemplate;
  panelInLine?: CutoutTemplate;
  panelAtCorner?: CutoutTemplate;
  /** Vienna's rectangular cut-out, for the door and the panel in line, instead of the mouse ears. */
  rectangular?: { door: CutoutTemplate; panelInLine: CutoutTemplate };
  /** Bellagio's door notch when it is fitted without seals. */
  withoutSeals?: { door: CutoutTemplate };
}

/**
 * CRL's Deluxe Serenity sliding door kit (SER78), for 8 or 10mm glass: one
 * sliding door and one fixed panel, hung from a header bar.
 *
 * [MANUFACTURER] rules are from CRL's installation sheets, saved in
 * docs/sliding/: 11M0347 (CRL North America, 2023), AVDB3149 (CRL Europe) and
 * AVDB3176 (with the SER90 kit for a 90° return). No job has been cut from
 * them through SetOut yet, so a sliding shower says on every sheet that its
 * sizes are not confirmed.
 */
export interface SerenityRules {
  /** [MANUFACTURER] The glass the Deluxe kit takes. 12mm takes the Senior kit, which SetOut does not design. */
  glassMm: number[];
  /** [MANUFACTURER] "Do not exceed either 30 inches (762mm) wide or 88 pounds (40kg)." */
  maxDoorWidthMm: number;
  maxDoorWeightKg: number;
  /**
   * [MANUFACTURER] "Sliding door and fixed panel width: overall width divided
   * by 2, plus 7/8 inch (22mm)."
   */
  halfWidthPlusMm: number;
  /**
   * [MANUFACTURER] "Standard gap between wall and fixed and/or sliding glass
   * is 1/8 inch (3mm)." With the formula's widths this leaves the door
   * lapping the fixed panel by 50mm, which CRL calls 2 inches (51mm).
   * [UNCONFIRMED] One drawing in 11M0347 shows 6mm at the door's wall, for the
   * L-seal. Matt to say which he leaves.
   */
  wallGapMm: number;
  /** [MANUFACTURER] "Fixed panel height: overall height minus 3/16 inch (5mm)", for clamps or U-channel and a setting block. */
  fixedBottomGapMm: number;
  /** [MANUFACTURER] "Sliding door height: overall height minus 5/16 inch (8mm)." The tops of the two are level. */
  doorBottomGapMm: number;
  header: {
    /** [MANUFACTURER] "Track is cut 1 inch (25mm) less than opening width and centred in opening." */
    shorterThanOpeningMm: number;
    /** [MANUFACTURER] Its centre line is 3 inches (76mm) below the top of the glass. */
    centreBelowGlassTopMm: number;
    /** [MANUFACTURER] The kit's header bar is 78-3/4 inches (2m) long. */
    stockLengthMm: number;
    /** [MANUFACTURER] Holes through the header for the fixed panel's fittings, in line with the panel's own. */
    holeDiameterMm: number;
  };
  /** [MANUFACTURER] Four holes in the door for its rollers: a pair near each side, one above the header and one below. */
  rollerHoles: { diameterMm: number; inMm: number; downMm: [number, number] };
  /**
   * [MANUFACTURER] Two holes in the fixed panel for its track holder fittings.
   * [UNCONFIRMED] 11M0347 prints the half inch hole as 12mm; AVDB3149 and
   * AVDB3176 as 13mm.
   */
  fixedPanelHoles: { diameterMm: number; inMm: number; downMm: number };
  /** [MANUFACTURER] One hole in a 90° return panel for the SER90 fitting, in from its edge at the corner (AVDB3176). */
  returnPanelHole: { diameterMm: number; inMm: number; downMm: number };
  /**
   * [MANUFACTURER] The through-glass pull is 2-1/2 inches (64mm) in from the
   * door's closing edge and, as CRL suggests, half way up.
   * [UNCONFIRMED] CRL gives its hole as 47 to 50mm (46 to 50 on the European
   * sheet). SetOut drills the largest; Matt to say the size and the height.
   */
  pullHole: { diameterMm: number; inMm: number };
  /**
   * [UNCONFIRMED] How far the channel under the fixed panel stops short of
   * the panel's free end, for the bottom door guide. CRL gives 19mm when the
   * guide caps the end of the panel and 24mm when it sits under it.
   */
  channelShortOfPanelEndMm: number;
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
  /** Sliding door systems, by system. See sliding.ts. */
  sliding: { serenity: SerenityRules };
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
  /**
   * The glass thicknesses the company offers its customers. Glass in one of
   * them is the company's own choice, so it is not flagged as a special.
   * Where this is not given, only the ruleset's standard thickness is not.
   */
  glassThicknessesMm?: readonly number[];
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
    channel: { verticalMm: 10, horizontalMm: 10, floorToCeilingMm: 12 },
    clampMm: 3,
    door: { outOnlyMm: 5, bothWaysMm: 9, wallMm: 5 },
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
        // CRL's V1E037 template and V1E044 drawing, in inches: 3" overall,
        // ears 2-3/4" apart and 1-9/16" in, 1-13/16" deep, 5/8" ears. To the
        // nearest mm: bigger than Geneva's. In line (V1E180) the panel takes
        // the same cut-out, as with Geneva; the 90° hinge (V1E092) takes two
        // holes in the panel, whose sizes are not published, so SetOut's own
        // notch stands in for those, flagged.
        door: {
          name: 'Vienna hinge notch',
          source: 'CRL V1E037 and V1E044 glass fabrication drawings, mouse-ear cut-out',
          shape: { kind: 'notch-ears', heightMm: 76, depthMm: 46, earDiameterMm: 16, earInMm: 40, earApartMm: 70 },
        },
        panelInLine: {
          name: 'Vienna hinge notch',
          source: 'CRL V1E037 and V1E044 glass fabrication drawings, mouse-ear cut-out',
          shape: { kind: 'notch-ears', heightMm: 76, depthMm: 46, earDiameterMm: 16, earInMm: 40, earApartMm: 70 },
        },
        // CRL's other option on the V1E044 drawing: the same 3" by 1-13/16"
        // with a 1/2" (12mm) hole drilled at each inner corner instead of the
        // ears. The fitters take two screws out of the hinge (Matt, 12
        // November 2026).
        rectangular: {
          door: {
            name: 'Vienna hinge notch, rectangular',
            source: 'CRL V1E044 glass fabrication drawing, rectangular cut-out, 12mm holes at the inner corners',
            shape: { kind: 'notch', heightMm: 76, depthMm: 46, radiusMm: 6 },
          },
          panelInLine: {
            name: 'Vienna hinge notch, rectangular',
            source: 'CRL V1E044 glass fabrication drawing, rectangular cut-out, 12mm holes at the inner corners',
            shape: { kind: 'notch', heightMm: 76, depthMm: 46, radiusMm: 6 },
          },
        },
      },
      bellagio: {
        // CRL Europe's BEL344, BEL380 and BEL392 drawings (from Custom
        // Showers' own site, docs/hinge-templates/), in mm. Fitted with
        // seals, as usual: the door notch is 58 high and 47 deep with 6mm
        // inner corners, the same in all three, as CRL North America's BEL344
        // sheet has it. Fitted without seals, as a bigger shower often is
        // (Matt, 12 November 2026): the door's notch is 58 high and 52 deep,
        // set in a rebate 6 deep and 84 high. The panels are the same either
        // way.
        door: {
          name: 'Bellagio hinge notch',
          source: 'CRL Europe BEL344, BEL380 and BEL392 drawings, fitted with seals',
          shape: { kind: 'notch', heightMm: 58, depthMm: 47, radiusMm: 6 },
        },
        withoutSeals: {
          door: {
            name: 'Bellagio hinge notch, without seals',
            source: 'CRL Europe BEL344, BEL380 and BEL392 drawings, fitted without seals',
            shape: { kind: 'notch-rebated', heightMm: 58, depthMm: 52, radiusMm: 6, rebateHeightMm: 84, rebateDepthMm: 6 },
          },
        },
        panelInLine: {
          name: 'Bellagio 180° panel notch',
          source: 'CRL Europe BEL380 drawing',
          shape: { kind: 'notch', heightMm: 52, depthMm: 33, radiusMm: 6 },
        },
        panelAtCorner: {
          name: 'Bellagio 90° hinge holes',
          source: 'CRL Europe BEL392 drawing',
          shape: { kind: 'holes', diameterMm: 16, inMm: 33, apartMm: 50 },
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
  sliding: {
    serenity: {
      glassMm: [8, 10],
      maxDoorWidthMm: 762,
      maxDoorWeightKg: 40,
      halfWidthPlusMm: 22,
      wallGapMm: 3,
      fixedBottomGapMm: 5,
      doorBottomGapMm: 8,
      header: { shorterThanOpeningMm: 25, centreBelowGlassTopMm: 76, stockLengthMm: 2000, holeDiameterMm: 6 },
      rollerHoles: { diameterMm: 16, inMm: 89, downMm: [44, 106] },
      fixedPanelHoles: { diameterMm: 12, inMm: 89, downMm: 76 },
      returnPanelHole: { diameterMm: 13, inMm: 22, downMm: 76 },
      pullHole: { diameterMm: 50, inMm: 64 },
      channelShortOfPanelEndMm: 19,
    },
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
  'deductions.channel.horizontalMm': { min: 2, max: 15 },
  'deductions.channel.floorToCeilingMm': { min: 8, max: 20 },
  'deductions.clampMm': { min: 2, max: 6 },
  'deductions.door.outOnlyMm': { min: 3, max: 8 },
  'deductions.door.bothWaysMm': { min: 6, max: 12 },
  'deductions.door.wallMm': { min: 2, max: 10 },
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
