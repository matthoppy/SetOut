/**
 * What the readings say about the room, in words, for the list under the
 * drawing of any layout but the single door, which has its own.
 */

import { ceilingSlope, leanScale, runEndNames, runNames, runViews, walkInGapMm, wallLean, wallNames, type ConfiguratorState, type DeckOptions } from '@setout/engine';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function enclosureFindings(state: ConfiguratorState, options: DeckOptions): string[] {
  const m = state.opening;
  const names = runNames(state);
  const walls = wallNames(state);
  const multi = m.runs.length > 1;
  const floor = options.overBath ? 'bath rim' : 'floor';
  const out: string[] = [];

  for (const [name, wall] of [
    [walls.start, m.startWall],
    [walls.end, m.endWall],
  ] as const) {
    if (!name) continue;
    const lean = wallLean(wall, leanScale(m, state.heightMm));
    if (!lean) continue;
    // 'the back wall, at the left end' reads better without its comma in a sentence.
    const called = cap(name.replace(',', ''));
    out.push(lean.leanMm > 0 ? `${called} leans ${lean.leanMm}mm ${lean.direction} at the top` : `${called} is straight up`);
  }

  const views = runViews(state, options);
  m.runs.forEach((run, i) => {
    const where = multi ? ` along ${names[i]}` : '';
    const ends = runEndNames(state, i);
    // A run between two corners has to say which.
    const between = views[i]?.left === 'corner' && views[i]?.right === 'corner';
    const end = (which: 'start' | 'end') =>
      between ? `the ${which === 'start' ? 'left' : 'right'} corner` : ends[which] === 'open end' ? 'the open end' : `the ${ends[which]}`;
    if (run.floorStartMm != null && run.floorEndMm != null) {
      out.push(run.floorFallMm > 0 && run.floorLowEnd ? `${cap(floor)} ${run.floorFallMm}mm lower at ${end(run.floorLowEnd)}${where}` : `${cap(floor)} level${where}`);
    }
    const slope = state.isFloorToCeiling ? ceilingSlope(run) : null;
    if (slope) {
      out.push(slope.dropMm > 0 && slope.lowEnd ? `Ceiling ${slope.dropMm}mm lower at ${end(slope.lowEnd)}${where}` : `Ceiling level${where}`);
    }
  });

  const what = options.overBath ? 'Screen' : 'Glass';
  out.push(state.isFloorToCeiling ? `${what} cut to the ceiling, ${state.heightMm}mm at its tallest` : `${what} ${state.heightMm}mm tall`);

  const gap = walkInGapMm(m);
  if (gap !== null && gap > 0) out.push(`A ${gap}mm gap to walk through`);
  return out;
}
