/**
 * How to fit a shower, step by step, for a fitter who has not fitted one of
 * ours before: a supply-only customer's own fitter, who has only the
 * installation sheet to go on.
 *
 * The steps are always in the same order, but what is in them is this
 * shower's own: its panes and their sizes, its channel cuts or clamps, each
 * door's hinges and how they fix, its seals and where each goes. A step with
 * nothing to do on this shower is left out. Nothing here is worked out
 * afresh: every size is the spec's, and every part is one of `fittings`, as
 * fittingsOf gives them.
 *
 * The hardware is this shower's own too. Its hinges are named by range and
 * style, as the shower or the company's standard has them, and a hinge that
 * fits differently says so: an adjustable one is set once hung, a pre-set
 * one does not close square.
 *
 * The words are a starting point that a company's staff read before any
 * customer does: a sheet is sent only once a member of staff has approved
 * it, and anything particular to a job goes in its installation comments.
 * What the guide cannot explain, because it is worked out by hand for the
 * job (a glass transom, say), is named in `byHand`: the sheet is not
 * approved until the installation comments say how it is fitted.
 *
 * Every kind of fitting has its step. A new kind does not build until it
 * has one (GUIDED, below), so no shower's guide can leave a part out.
 */

import type { Fitting, HingeMount } from './fittings';
import { hasTransom } from './geometry';
import { doorHingeOf, hingeStylesOf, STANDARD_HINGES, type HingeStyles } from './hinges';
import type { ConfiguratorSpec, PanelSpec } from './spec';
import type { ConfiguratorState } from './types';

export interface FittingStep {
  title: string;
  /** Each a sentence or two, in the order the fitter does them. */
  lines: string[];
}

export interface FittingGuide {
  steps: FittingStep[];
  /** Parts fitted as worked out by hand for the job, which the installation comments must explain. */
  byHand: string[];
  /** What makes the guide wrong until the shower changes: a hinge its range does not make. */
  problems: string[];
}

/**
 * Where each kind of fitting is covered. A kind added to Fitting without its
 * step here fails the type check, so a part is never left out of a guide.
 */
const GUIDED: { [K in Fitting['kind']]: string } = {
  channel: 'Fix the U-channel',
  clamps: 'Fix the clamps',
  'support-bar': 'Fit the support bar',
  'support-panel': 'Fit the support panel',
  hinges: 'Hang the door',
  handle: 'Hang the door',
  'sliding-kit': 'Fit the sliding door',
  'sliding-return-kit': 'Fit the sliding door',
  seal: 'Fit the seals',
  'bottom-seal': 'Fit the seals',
  threshold: 'Fit the seals',
};
export const GUIDED_STEPS: Readonly<Record<Fitting['kind'], string>> = GUIDED;

/** "P1" from "P1 — Door (Front)". */
const nameOf = (panel: PanelSpec | undefined) => (panel?.label ?? '').split(' — ')[0] || 'the';

const HUNG: Record<HingeMount, string> = {
  'wall-to-glass': 'hung from the wall',
  'glass-to-glass-180': 'hung from the glass beside it, in line,',
  'glass-to-glass-90': 'hung from the glass beside it, round the corner,',
};

export function fittingGuideOf(
  design: ConfiguratorState,
  spec: ConfiguratorSpec,
  fittings: Fitting[],
  standards: HingeStyles = STANDARD_HINGES
): FittingGuide {
  const steps: FittingStep[] = [];
  const byHand: string[] = [];
  const problems: string[] = [];
  const styles = hingeStylesOf(design, standards);
  const panes = spec.panels;
  const of = <K extends Fitting['kind']>(kind: K) => fittings.filter((f): f is Extract<Fitting, { kind: K }> => f.kind === kind);
  const doorName = (pane: number) => `${nameOf(panes[pane])} door`;
  // A sliding door rolls on its header and stands in nothing; every other
  // pane that is not hung on hinges is fixed glass.
  const fixed = panes.filter((p) => !p.door && p.sliding?.role !== 'door');
  const channel = of('channel')[0];
  const clamps = of('clamps').length > 0;
  const sliding = of('sliding-kit')[0];
  const hinges = of('hinges');

  steps.push({
    title: 'Before you start',
    lines: [
      `Check every pane against this sheet before any fixing goes in: its size, its notches and its holes. Toughened glass cannot be cut, drilled or ground once it is made.`,
      `There ${panes.length === 1 ? 'is 1 pane' : `are ${panes.length} panes`} of ${spec.glassThicknessMm}mm toughened glass${
        spec.totalGlassWeightKg > 0 ? `, about ${Math.round(spec.totalGlassWeightKg)}kg in all` : ''
      }. Carry each pane on its edge with two people and glass suction lifters, and stand it on rubber or timber, never on a corner.`,
      `The tray or floor and the walls should be finished, tiled and grouted, and the tray level, before the glass goes in.`,
      `Check the opening against the out-of-square figures on the sheet. If the walls, floor or tray are not as measured, stop and call us before fitting anything.`,
    ],
  });

  steps.push({
    title: 'Mark out',
    lines: [
      `Mark where the glass stands on the ${spec.isFloorToCeiling ? 'floor or tray, up each wall and across the ceiling' : 'floor or tray and up each wall'}, using the set-out gaps on the sheet.`,
      `Check each line with a spirit level. The glass stands plumb even where a wall is not, and the sheet's gaps already allow for that.`,
    ],
  });

  if (channel) {
    const cuts = channel.cuts.map((cut) => `${cut.label}: ${cut.lengthMm}mm`);
    steps.push({
      title: 'Fix the U-channel',
      lines: [
        cuts.length
          ? `Cut the channel to these lengths: ${cuts.join('; ')}.`
          : `There is ${(channel.lengthMm / 1000).toFixed(2)}m of channel in all. Cut it to fit on site.`,
        `Fix the length along the floor first. Each length up a wall stands on it${spec.isFloorToCeiling ? ', and stops under the length along the ceiling' : ''}.`,
        `Bed each length on a bead of silicone and screw it along your marks, with fixings to suit the wall. Drill tiles with a tile bit and the hammer action off.`,
      ],
    });
  } else if (clamps && fixed.length > 0) {
    steps.push({
      title: 'Fix the clamps',
      lines: [
        `The fixed glass is held in glass clamps, not channel. Fix them along your marks, on the walls and the floor or tray, as the clamps' own instructions say.`,
        `Drill tiles with a tile bit and the hammer action off, and use fixings to suit the wall.`,
      ],
    });
  }

  if (fixed.length > 0) {
    const held = channel ? 'in the channel' : 'in its clamps';
    steps.push({
      title: fixed.length === 1 ? 'Stand the fixed panel' : 'Stand the fixed panels',
      lines: [
        ...fixed.map((p) => `${nameOf(p)}: ${p.cutWidthMm} × ${p.cutHeightMm}mm.`),
        `Stand each panel ${held} on setting blocks, so the glass never touches metal, and pack it to the gaps on the sheet.`,
        `Check each panel is plumb and level, and that its gaps match the sheet, before it is wedged or clamped tight.`,
      ],
    });
  }

  for (const f of of('support-bar')) {
    steps.push({
      title: 'Fit the support bar',
      lines: [
        ...(f.reason ? [`${f.reason}.`] : []),
        `Fix the support bar from the top of the fixed glass to the wall before hanging any door, and tighten it once the glass is plumb.`,
      ],
    });
  }
  for (const f of of('support-panel')) {
    steps.push({
      title: 'Fit the support panel',
      lines: [...(f.reason ? [`${f.reason}.`] : []), `Fix the support panel where the sheet shows it, before hanging any door.`],
    });
  }

  for (const h of hinges) {
    const door = panes[h.pane];
    const handle = fittings.some((f) => f.kind === 'handle' && f.pane === h.pane);
    // The range's own style where it makes more than one, as this shower takes it.
    const hinge = doorHingeOf(h.brand, h.mount, styles);
    const style = hinge.style ? (h.mount === 'wall-to-glass' ? styles.wall : styles.inLine) : null;
    const preset = style?.endsWith('preset') ?? false;
    const adjustable = style?.endsWith('adjustable') ?? false;
    const lines = [
      `${doorName(h.pane)}: ${door ? `${door.cutWidthMm} × ${door.cutHeightMm}mm, ` : ''}${HUNG[h.mount]} on ${h.count} ${h.brand}${
        hinge.style ? ` ${hinge.style.words}` : ''
      } hinges.`,
      h.mount === 'wall-to-glass'
        ? `Fit the hinges to the door. Hold the door in place on packers at the gaps on the sheet, mark the hinge plates on the wall, then take the door down, drill and plug the wall, and fix the hinges.`
        : `The hinges clamp through the holes in the door and the panel beside it. Fit them loosely, set the door's gaps with packers, then tighten them.`,
    ];
    if (hinge.style && !hinge.series) problems.push(`${h.brand} makes no ${hinge.style.words} hinge, which the ${doorName(h.pane)} is set to hang on.`);
    if (h.brand === 'Vienna' && styles.viennaCutout === 'rectangular') {
      lines.push(`The glass is cut with rectangular cut-outs for these hinges: take the two screws out of each hinge before fitting it.`);
    }
    if (h.brand === 'Bellagio' && styles.bellagioFit === 'without-seals') lines.push(`These hinges are fitted without their seals.`);
    if (preset) {
      lines.push(`These hinges are set at the factory to close the door 5° further into the shower, so it closes onto its seal, not square. Do not pack it square.`);
    }
    if (adjustable) {
      lines.push(`Once the door is hung, set where it closes with the hinges' own adjustment, as their instructions say. It can be adjusted later without taking the door down.`);
    }
    lines.push(
      `Check the door opens ${door?.door?.swing === 'both' ? 'both ways' : 'outwards'} freely and closes ${preset ? 'onto its seal' : 'square'}, without touching glass, tiles or the tray, before going on.`
    );
    if (handle) lines.push(`Fit the handle through the holes in the door.`);
    steps.push({ title: hinges.length > 1 ? `Hang the ${doorName(h.pane)}` : 'Hang the door', lines });
  }

  // Above a door, to the ceiling: a glass transom, or a gap left open, is
  // sized and fixed by hand for the job, so the comments say how it goes in.
  if (hasTransom(design) && hinges.length > 0) {
    const what =
      design.aboveDoor === 'glass'
        ? 'the glass over the door'
        : design.aboveDoor === 'open'
          ? 'the top of the glass, with the space over the door left open'
          : 'what goes over the door';
    byHand.push(what);
    steps.push({
      title: design.aboveDoor === 'open' ? 'Fix the top of the glass' : 'Fit the glass over the door',
      lines: [
        design.aboveDoor === 'open'
          ? `The space over the door is left open for air. The fixed glass runs to the ceiling: fix its top as the installation comments say.`
          : `The glass over the door is sized and fixed for this job. Fit it as the installation comments say, once the door is hung and closes as it should.`,
      ],
    });
  }

  if (sliding) {
    const returnKit = of('sliding-return-kit').length > 0;
    steps.push({
      title: 'Fit the sliding door',
      lines: [
        `Cut the header bar to ${sliding.headerLengthMm}mm.`,
        `Fit the header, rollers, stopper and track holders as the sliding kit's own instructions say${returnKit ? ', with the return kit fixing the header to the return panel' : ''}, then hang the door on its rollers.`,
        `Fit the door guide on the floor and the pull through the door, and check the door runs its full travel without touching the fixed glass.`,
      ],
    });
  }

  const seals = of('seal').map((s) => {
    const where =
      s.edge === 'hinge'
        ? `down the ${doorName(s.pane)}'s hinge edge`
        : s.meets === 'wall'
          ? `siliconed to the wall where the ${doorName(s.pane)} closes`
          : s.meets === 'corner'
            ? `on the panel at the corner, where the ${doorName(s.pane)} closes`
            : s.meets === 'glass'
              ? `where the ${doorName(s.pane)} closes against the fixed panel`
              : `on the ${doorName(s.pane)}'s latch edge`;
    // The h seal keeps its lower case: a capital H is another seal.
    const seal = s.seal === 'h seal' ? s.seal : `${s.seal.charAt(0).toUpperCase()}${s.seal.slice(1)}`;
    return `${seal} ${where}, ${s.lengthMm}mm.`;
  });
  const wipes = of('bottom-seal').map((s) => `Bottom wipe along the ${doorName(s.pane)}'s bottom edge, ${s.lengthMm}mm.`);
  const thresholds = of('threshold').map((s) => `Clear threshold on the tray under the ${doorName(s.pane)}, ${s.lengthMm}mm, where the wipe closes onto it.`);
  if (seals.length + wipes.length + thresholds.length > 0) {
    steps.push({
      title: 'Fit the seals',
      lines: [
        ...seals,
        ...wipes,
        ...thresholds,
        `The lengths are the glass edges. Offer each seal up and trim it on site, so it ends neatly and the door still closes onto it.`,
      ],
    });
  }

  steps.push({
    title: 'Silicone',
    lines: [
      ...(fixed.length === 0
        ? []
        : channel
          ? [`Run clear sanitary silicone where the channel meets the walls and the floor or tray, and where the fixed glass meets the channel, inside and out.`]
          : [`Run clear sanitary silicone down both sides of the fixed glass where it meets the walls and the floor or tray.`]),
      ...(hinges.length > 0 || sliding ? [`Never silicone a door's edges, its hinges or anything that moves.`] : []),
      `Leave the silicone 24 hours before the shower is used.`,
    ],
  });

  steps.push({
    title: 'Final checks',
    lines: [
      ...(hinges.length + (sliding ? 1 : 0) > 0 ? [`Every door opens and closes freely, closes onto its seals, and touches no glass, tile or tray.`] : []),
      `Every fixing is tight, and every pane is plumb with its gaps as the sheet gives them.`,
      `Clean off any marks, labels and spare silicone.`,
    ],
  });

  return { steps, byHand, problems };
}
