/**
 * Sliding doors, on CRL's Serenity: the only sliding system Custom Showers
 * fits.
 *
 * A sliding shower is one fixed panel and one sliding door in line, hung from
 * a header bar that runs wall to wall, or wall to a 90° return panel. The two
 * panes lap each other, so nothing about them follows from a hinged door's
 * deductions: both are cut to CRL's own formula from the whole opening.
 *
 * Every number is in SetOut's fixed rules (ruleset.ts, `sliding.serenity`),
 * marked with where it came from. CRL's sheets are in docs/sliding/.
 *
 * [UNCONFIRMED] No job has been cut from these through SetOut, and Matt has
 * not yet said he cuts to CRL's formula as printed. So sliding is offered
 * only where a company has turned it on in Settings, every spec made here
 * says so in its first warning, and SetOut's own stand-ins (what CRL leaves
 * open) are listed in `unconfirmed` for the sheets to print. The questions
 * are in docs/sliding-plan.md.
 *
 * A design reaches this module only when it has `sliding` set. Hinged doors
 * and fixed panels are never worked out here.
 */

import type { PanelDeductions } from './fabrication';
import { derivePlanes, openingContext, runPanelIndices, totalRunWidthMm, type Plane } from './geometry';
import { describeOpening, describeWidths, LASER_OFFSET_DEFAULT_MM, METHOD_LABELS, signedLeanMm } from './measure';
import { checkGlassSpec, checkPanelLimits, glassWeightKg } from './rules';
import type { EngineContext, SerenityRules } from './ruleset';
import type { ChannelCut, ConfiguratorSpec, PanelSpec } from './spec';
import type { ConfiguratorState, SlidingSystem } from './types';

/** What a hole in a sliding pane is for. */
export type SlidingHolePart = 'roller' | 'track-holder' | 'pull' | 'return-fitting';

/** A hole through a sliding pane, placed as CRL's sheet places it. */
export interface SlidingHole {
  part: SlidingHolePart;
  /** What it is called on the glass order: "Serenity roller holes". */
  name: string;
  /** CRL's sheet it was taken from. */
  source: string;
  /** The edge it is measured in from, as seen from outside. */
  side: 'left' | 'right';
  /** Its centre, in from that edge. */
  insetMm: number;
  /** Its centre, down from the top of the glass, as CRL prints it. */
  downMm: number;
  /** The same centre, up from the bottom of the glass. */
  upMm: number;
  diameterMm: number;
  /** For one of a pair on the same edge, how far apart the two are. */
  apartMm: number | null;
}

/** A sliding shower's pane: what it is, where it stands in its run, and its holes. */
export interface PanelSliding {
  role: 'door' | 'fixed' | 'return';
  /** Its two edges along its run, in mm from the run's start, as seen from outside. */
  fromMm: number;
  toMm: number;
  holes: SlidingHole[];
}

/** What a sliding shower needs beside its panes. */
export interface SlidingSpec {
  system: SlidingSystem;
  /** CRL's kit, before its finish. */
  kit: string;
  /** CRL's kit for a 90° return, where the shower has one. */
  returnKit: string | null;
  /** Wall to wall, or wall to the inside face of the return panel. */
  overallWidthMm: number;
  /** Floor to the top of the glass. */
  overallHeightMm: number;
  /** How far the door laps the fixed panel when it is closed. */
  overlapMm: number;
  /** The gap left at each end of the front glass. */
  wallGapMm: number;
  /** The side the door closes to, as seen from outside. */
  doorCloses: 'left' | 'right';
  /** Wall to the fixed panel's free edge: the way in with the door slid right back, before the pull and the stopper. */
  clearOpeningMm: number;
  header: {
    lengthMm: number;
    /** Its centre line, up from the floor. */
    centreHeightMm: number;
    /** Holes for the fixed panel's fittings: their centres, from the wall or return at the fixed panel's end. */
    holesFromFixedEndMm: number[];
    holeDiameterMm: number;
  };
  /** SetOut's own stand-ins in this shower, each a question for Matt. */
  unconfirmed: string[];
}

const PLANE_NAMES: Record<Plane, string> = { front: 'Front', return_left: 'Return left', return_right: 'Return right', back: 'Back' };

const SER78 = 'CRL 11M0347 (Deluxe Serenity SER78)';
const SER90 = 'CRL AVDB3176 (Serenity SER90 return)';

/** How a design's panels make a sliding shower, or why they do not. */
interface Layout {
  /** The run with the door in it: its two panels, by index, from the left. */
  run: number;
  fixed: number;
  door: number;
  /** The return panel and which end of the sliding run it joins. */
  returnPanel: { index: number; run: number; at: 'start' | 'end' } | null;
}

function layoutOf(state: ConfiguratorState): Layout | string {
  const runs = runPanelIndices(state.panels, state.junctions);
  const doors = state.panels.flatMap((p, i) => (p.kind === 'door' ? [i] : []));
  if (doors.length !== 1) return 'A sliding shower has one sliding door.';
  const run = runs.findIndex((r) => r.includes(doors[0]));
  const indices = runs[run];
  if (indices.length !== 2) return 'A sliding door runs across one fixed panel in line with it, and nothing else in that run.';
  const fixed = indices.find((i) => i !== doors[0]) as number;
  if (runs.length > 2) return 'A sliding shower has one return panel at most.';
  let returnPanel: Layout['returnPanel'] = null;
  if (runs.length === 2) {
    const other = run === 0 ? 1 : 0;
    if (runs[other].length !== 1) return 'A sliding shower’s return is one fixed panel.';
    returnPanel = { index: runs[other][0], run: other, at: other < run ? 'start' : 'end' };
  }
  // The header needs something to fix to at both ends, and so does the return.
  if (!state.leftWall || !state.rightWall) return 'A sliding shower runs wall to wall: its header fixes to a wall, or to a return panel that reaches one.';
  return { run, fixed, door: doors[0], returnPanel };
}

function label(index: number, what: string, plane: Plane): string {
  return `P${index + 1} — ${what} (${PLANE_NAMES[plane]})`;
}

/**
 * The cut list for a sliding shower, made to CRL's formula.
 *
 * Pure, like buildSpec, which hands it every design with `sliding` set.
 */
export function buildSlidingSpec(state: ConfiguratorState, context: EngineContext): ConfiguratorSpec {
  const { rules, companyName } = context;
  const { making, fixed } = rules;
  const s: SerenityRules = fixed.sliding.serenity;
  const t = state.glassThicknessMm;
  const H = state.heightMm;
  const planes = derivePlanes(state.panels, state.junctions);

  const warnings: string[] = [
    `Sliding door: these sizes are worked out from CRL’s Serenity installation sheets and are not confirmed yet. ${companyName} will check every size by hand before the glass is ordered.`,
  ];
  const blockingIssues: string[] = [];
  const unconfirmed: string[] = [];

  for (const c of checkGlassSpec(context, t)) (c.severity === 'blocking' ? blockingIssues : warnings).push(`Glass: ${c.message}`);
  if (!s.glassMm.includes(t)) {
    blockingIssues.push(
      `Glass: the Deluxe Serenity kit takes ${s.glassMm.join(' or ')}mm glass, not ${t}mm. 12mm glass takes CRL’s Senior kit, which is not designed here yet.`
    );
  }
  if (state.isFloorToCeiling) {
    blockingIssues.push('A sliding door hangs from rollers over its header and is lifted on, so its glass cannot go to the ceiling.');
  }
  if (H > making.review.standardHeightMaxMm) {
    warnings.push(
      `Review: the glass is ${H}mm tall, over ${making.review.standardHeightMaxMm}mm. ${companyName} will check the opening and ceiling by hand before the glass is ordered.`
    );
  }

  const layout = layoutOf(state);
  const plain = (bottom: number): PanelDeductions['vertical'] => ({ top: 0, bottom, total: bottom, breakdown: bottom ? [`Serenity bottom gap: -${bottom}mm`] : [] });

  // A layout Serenity does not make is refused, with every pane left at the
  // size it was given so the pages that list them still can.
  if (typeof layout === 'string') {
    blockingIssues.push(`${layout} Choose one of the sliding layouts, or a hinged door.`);
    const panels: PanelSpec[] = state.panels.map((p, i) => ({
      id: p.id,
      label: label(i, p.kind === 'door' ? 'Sliding door' : 'Fixed', planes[i]),
      kind: p.kind,
      plane: planes[i],
      tightWidthMm: p.width_mm,
      tightHeightMm: H,
      cutWidthMm: p.width_mm,
      cutHeightMm: H,
      weightKg: glassWeightKg(rules, p.width_mm, H, t),
      deductions: { vertical: plain(0), horizontal: { left: 0, right: 0, total: 0, breakdown: [] }, cutWidth: p.width_mm, cutHeight: H },
      notches: [],
      cutouts: [],
    }));
    return finish(state, context, panels, [], warnings, blockingIssues);
  }

  const runs = runPanelIndices(state.panels, state.junctions);
  const runWidth = runs[layout.run].reduce((sum, i) => sum + state.panels[i].width_mm, 0);
  const ret = layout.returnPanel;

  // The front glass stands between the wall and the inside face of the
  // return panel, which runs past its end (AVDB3176).
  const x0 = ret?.at === 'start' ? t : 0;
  const x1 = runWidth - (ret?.at === 'end' ? t : 0);
  const W = x1 - x0;
  if (ret) {
    unconfirmed.push(
      `Return panel: the front glass is set out from the wall to the inside face of the return panel, taken as the front run less the ${t}mm glass. The return is cut to its own run less ${s.wallGapMm}mm at the wall. CRL gives the return’s hole but not its size.`
    );
  }

  // CRL: each pane is half the overall width plus 22mm. Whole millimetres:
  // an odd one goes on the fixed panel, so the lap is the same every time.
  const formulaDoor = Math.floor(W / 2) + s.halfWidthPlusMm;
  const doorW = Math.min(formulaDoor, s.maxDoorWidthMm);
  const overlap = 2 * s.halfWidthPlusMm + 2 * s.wallGapMm;
  const fixedW = W - 2 * s.wallGapMm - doorW + overlap;
  if (formulaDoor > s.maxDoorWidthMm) {
    const note = `The opening is ${W}mm, wider than two equal panes allow: CRL’s formula would make the door ${formulaDoor}mm, over its ${s.maxDoorWidthMm}mm limit. The door is held at ${s.maxDoorWidthMm}mm and the fixed panel takes the rest.`;
    unconfirmed.push(note);
    warnings.push(`Review: ${note} ${companyName} will confirm how it is divided.`);
  }

  const doorOnRight = layout.door > layout.fixed;
  const fixedFrom = doorOnRight ? x0 + s.wallGapMm : x1 - s.wallGapMm - fixedW;
  const doorFrom = doorOnRight ? x1 - s.wallGapMm - doorW : x0 + s.wallGapMm;
  const fixedH = H - s.fixedBottomGapMm;
  const doorH = H - s.doorBottomGapMm;
  // Each pane's edge at its own end of the opening, and the one that laps the other.
  const fixedOuter = doorOnRight ? 'left' : 'right';
  const doorOuter = doorOnRight ? 'right' : 'left';
  const otherSide = (side: 'left' | 'right') => (side === 'left' ? 'right' : 'left');

  const hole = (
    part: SlidingHolePart,
    name: string,
    source: string,
    side: 'left' | 'right',
    insetMm: number,
    downMm: number,
    heightMm: number,
    diameterMm: number,
    apartMm: number | null = null
  ): SlidingHole => ({ part, name, source, side, insetMm, downMm, upMm: Math.round((heightMm - downMm) * 10) / 10, diameterMm, apartMm });

  const [upper, lower] = s.rollerHoles.downMm;
  const doorHoles: SlidingHole[] = (['left', 'right'] as const).flatMap((side) =>
    [upper, lower].map((down) =>
      hole('roller', 'Serenity roller holes', SER78, side, s.rollerHoles.inMm, down, doorH, s.rollerHoles.diameterMm, lower - upper)
    )
  );
  // The pull is by the edge the door closes on, half way up.
  doorHoles.push(hole('pull', 'Serenity through-glass pull', SER78, doorOuter, s.pullHole.inMm, Math.round(doorH / 2), doorH, s.pullHole.diameterMm));
  unconfirmed.push(
    `Pull: its hole is drilled ${s.pullHole.diameterMm}mm (CRL gives 47 to 50mm), half way up the door as CRL suggests.`,
    `Fixed panel: its two track holder holes are ${s.fixedPanelHoles.diameterMm}mm. CRL prints the same half inch hole as 12mm on one sheet and 13mm on two.`,
    `Gaps: ${s.wallGapMm}mm at each end of the front glass, which leaves the door lapping the fixed panel by ${overlap}mm. One of CRL’s drawings shows 6mm at the door’s wall, for the L-seal.`
  );
  const fixedHoles: SlidingHole[] = (['left', 'right'] as const).map((side) =>
    hole('track-holder', 'Serenity track holder holes', SER78, side, s.fixedPanelHoles.inMm, s.fixedPanelHoles.downMm, fixedH, s.fixedPanelHoles.diameterMm)
  );

  const side = (edge: 'left' | 'right', outer: 'left' | 'right') => (edge === outer ? s.wallGapMm : 0);
  const across = (outer: 'left' | 'right', what: string): PanelDeductions['horizontal'] => ({
    left: side('left', outer),
    right: side('right', outer),
    total: s.wallGapMm,
    breakdown: [`Serenity: ${what}`, `${outer === 'left' ? 'Left' : 'Right'} end gap: -${s.wallGapMm}mm`],
  });

  const pane = (
    index: number,
    what: string,
    cutW: number,
    cutH: number,
    bottomGap: number,
    horizontal: PanelDeductions['horizontal'],
    sliding: PanelSliding
  ): PanelSpec => {
    const p = state.panels[index];
    const notches: PanelSpec['notches'] = [];
    if (p.notches?.bottom_left) notches.push({ corner: 'Bottom left', widthMm: p.notches.width_mm, heightMm: p.notches.height_mm });
    if (p.notches?.bottom_right) notches.push({ corner: 'Bottom right', widthMm: p.notches.width_mm, heightMm: p.notches.height_mm });
    return {
      id: p.id,
      label: label(index, what, planes[index]),
      kind: p.kind,
      plane: planes[index],
      tightWidthMm: p.width_mm,
      tightHeightMm: H,
      cutWidthMm: cutW,
      cutHeightMm: cutH,
      weightKg: glassWeightKg(rules, cutW, cutH, t),
      deductions: { vertical: plain(bottomGap), horizontal, cutWidth: cutW, cutHeight: cutH },
      notches,
      cutouts: [],
      sliding,
    };
  };

  const formula = formulaDoor > s.maxDoorWidthMm ? 'the door held at CRL’s limit, the fixed panel the rest' : `half the ${W}mm opening plus ${s.halfWidthPlusMm}mm`;
  const panels: PanelSpec[] = [];
  panels[layout.fixed] = pane(layout.fixed, 'Fixed', fixedW, fixedH, s.fixedBottomGapMm, across(fixedOuter, formula), {
    role: 'fixed',
    fromMm: fixedFrom,
    toMm: fixedFrom + fixedW,
    holes: fixedHoles,
  });
  panels[layout.door] = pane(layout.door, 'Sliding door', doorW, doorH, s.doorBottomGapMm, across(doorOuter, formula), {
    role: 'door',
    fromMm: doorFrom,
    toMm: doorFrom + doorW,
    holes: doorHoles,
  });

  // Only fixed glass is in channel, along the floor: the fixed panel's, and a return's.
  const channel: ChannelCut[] = [];
  const underFixed = Math.max(fixedW - s.channelShortOfPanelEndMm, 0);
  if (underFixed) channel.push({ runs: 'floor', paneId: state.panels[layout.fixed].id, label: `Floor, under P${layout.fixed + 1}`, lengthMm: underFixed });
  unconfirmed.push(
    `Channel: the U-channel under the fixed panel stops ${s.channelShortOfPanelEndMm}mm short of its free end, for the bottom door guide to cap the panel. CRL gives 24mm when the guide sits under it.`
  );
  if (ret) {
    const returnRun = runs[ret.run].reduce((sum, i) => sum + state.panels[i].width_mm, 0);
    const cutW = returnRun - s.wallGapMm;
    // Seen from outside, a return before the front run has the wall on its
    // left and the corner on its right; one after it, the other way round.
    const corner: 'left' | 'right' = ret.at === 'start' ? 'right' : 'left';
    const wall = otherSide(corner);
    panels[ret.index] = pane(
      ret.index,
      'Fixed return',
      cutW,
      fixedH,
      s.fixedBottomGapMm,
      { left: side('left', wall), right: side('right', wall), total: s.wallGapMm, breakdown: ['Serenity return: runs through to the outside corner', `${wall === 'left' ? 'Left' : 'Right'} wall gap: -${s.wallGapMm}mm`] },
      {
        role: 'return',
        fromMm: wall === 'left' ? s.wallGapMm : 0,
        toMm: wall === 'left' ? returnRun : cutW,
        holes: [hole('return-fitting', 'Serenity 90° return fitting hole', SER90, corner, s.returnPanelHole.inMm, s.returnPanelHole.downMm, fixedH, s.returnPanelHole.diameterMm)],
      }
    );
    channel.push({ runs: 'floor', paneId: state.panels[ret.index].id, label: `Floor, under P${ret.index + 1}`, lengthMm: cutW });
    // Which pane stands next to the return: the door closing on glass is not drawn by CRL.
    const doorAtReturn = (ret.at === 'start') !== doorOnRight;
    if (doorAtReturn) {
      const note = 'The door closes against the return panel, not a wall. CRL’s sheets show the fixed panel beside the return.';
      unconfirmed.push(note);
      warnings.push(`Review: ${note} ${companyName} will confirm it can be fitted this way.`);
    }
  }

  // The limits CRL gives the kit.
  const doorSpec = panels[layout.door];
  if (doorSpec.weightKg > s.maxDoorWeightKg) {
    blockingIssues.push(
      `${doorSpec.label}: the door weighs ${doorSpec.weightKg}kg. CRL’s limit for a Serenity door is ${s.maxDoorWeightKg}kg: lower the glass or use thinner glass.`
    );
  }
  const headerLength = W - s.header.shorterThanOpeningMm;
  if (headerLength > s.header.stockLengthMm) {
    blockingIssues.push(
      `The opening is ${W}mm wide, which needs a ${headerLength}mm header. The Serenity kit’s header bar is ${s.header.stockLengthMm}mm long.`
    );
  }
  const clearOpening = W - s.wallGapMm - fixedW;
  if (clearOpening < making.limits.minDoorWidthMm) {
    warnings.push(
      `Review: with the door slid right back the way in is about ${clearOpening}mm, under ${making.limits.minDoorWidthMm}mm. ${companyName} will confirm the opening is wide enough for a sliding door.`
    );
  }
  for (const p of panels) {
    for (const c of checkPanelLimits(rules, p.cutWidthMm, p.cutHeightMm, t, true)) {
      (c.severity === 'blocking' ? blockingIssues : warnings).push(`${p.label}: ${c.message}`);
    }
    if (p.cutWidthMm <= 0 || p.cutHeightMm <= 0) blockingIssues.push(`${p.label}: the opening is too small for a sliding door. Check the measurements.`);
  }

  // Sliding glass is cut square. An opening that is not gets a person.
  const o = state.opening;
  const out: string[] = [];
  if (signedLeanMm(o.startWall) !== 0 || signedLeanMm(o.endWall) !== 0) out.push('a wall leans');
  if (o.runs.some((r) => (r?.floorFallMm ?? 0) !== 0)) out.push('the floor falls');
  const top = o.runs[layout.run]?.widthAtTopCheckMm;
  if (typeof top === 'number' && top !== o.runs[layout.run].widthAtFloorMm) out.push('the opening is a different width at the top');
  if (out.length > 0) {
    const note = `Sliding glass is cut square, to the width at the floor, and here ${out.join(' and ')}.`;
    unconfirmed.push(`${note} CRL’s sheets give no allowance for an opening out of square.`);
    warnings.push(`Review: ${note} ${companyName} will set the sizes by hand so the door runs level and closes on the wall.`);
  }

  const sliding: SlidingSpec = {
    system: 'serenity',
    kit: 'SER78',
    returnKit: ret ? 'SER90' : null,
    overallWidthMm: W,
    overallHeightMm: H,
    overlapMm: overlap,
    wallGapMm: s.wallGapMm,
    doorCloses: doorOuter,
    clearOpeningMm: clearOpening,
    header: {
      lengthMm: headerLength,
      centreHeightMm: H - s.header.centreBelowGlassTopMm,
      holesFromFixedEndMm: [s.wallGapMm + s.fixedPanelHoles.inMm, s.wallGapMm + fixedW - s.fixedPanelHoles.inMm],
      holeDiameterMm: s.header.holeDiameterMm,
    },
    unconfirmed,
  };
  return { ...finish(state, context, panels, channel, warnings, blockingIssues), sliding };
}

/** The rest of the spec, as buildSpec lays it out: the runs, the glass and what was measured. */
function finish(
  state: ConfiguratorState,
  context: EngineContext,
  panels: PanelSpec[],
  channelCuts: ChannelCut[],
  warnings: string[],
  blockingIssues: string[]
): ConfiguratorSpec {
  const o = state.opening;
  const ctx = openingContext(state);
  const rakeNotes: string[] = [describeWidths(o, ctx)];
  const condition = describeOpening(o, ctx);
  rakeNotes.push(condition === 'Square and level throughout.' ? 'Customer reports the opening as square and level.' : `Out of true: ${condition}`);
  if (o.method) {
    rakeNotes.push(
      o.method === 'laser'
        ? `Checked with: ${METHOD_LABELS.laser}, set ${o.laserOffsetMm ?? LASER_OFFSET_DEFAULT_MM}mm off the wall.`
        : `Checked with: ${METHOD_LABELS[o.method]}.`
    );
  }

  const cornerCount = state.junctions.filter((j) => j.angle_deg === 90).length;
  const wallRuns =
    cornerCount > 0
      ? runPanelIndices(state.panels, state.junctions).map((indices, i) => ({
          wall: `Wall ${i + 1}`,
          widthMm: indices.reduce((sum, n) => sum + state.panels[n].width_mm, 0),
        }))
      : [];

  return {
    panels,
    cornerCount,
    totalRunWidthMm: totalRunWidthMm(state.panels),
    wallRuns,
    channelCuts,
    totalChannelLengthMm: channelCuts.reduce((sum, cut) => sum + cut.lengthMm, 0),
    heightMm: state.heightMm,
    isFloorToCeiling: false,
    mounting: state.mounting,
    glassThicknessMm: state.glassThicknessMm,
    totalGlassWeightKg: Math.round(panels.reduce((sum, p) => sum + p.weightKg, 0) * 10) / 10,
    // The header carries the door and ties the fixed panel to the walls.
    support: { supportPanelRequired: false, supportPanelReason: null, supportBarRequired: false, supportBarReason: null, supportBarPanelId: null },
    rakeNotes,
    warnings,
    blockingIssues,
  };
}
