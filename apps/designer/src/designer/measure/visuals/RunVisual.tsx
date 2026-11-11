/**
 * A reading on any run: the run seen face on from outside the shower, the
 * tape where the card says to put it, the laser where it stands for this
 * reading, and the number once it is typed. Readings already taken on the
 * same run sit on the picture as small circled numbers, as on the cross.
 */

import type { CardVisual, RunView } from '@setout/engine';
import { CEIL, FLOOR, Frame, LEVEL, LaserLines, PlanInset, PointMark, RunGlassLine, RunRoom, EndMark, TapeMeasure, Tripod, WallMark, runEnds, ACCENT, BG, WALL_EDGE } from './Scene';

/** The kinds of picture drawn on a run. */
export type RunPicture = Extract<CardVisual, { view: RunView }>;

interface Tape {
  /** The body of the tape, and the hook or the end held on a mark. */
  body: { x: number; y: number };
  hook: { x: number; y: number };
  /** Where the laser lights the blade, when the reading is taken at a laser line. */
  lit?: { x: number; y: number };
  /** Where the laser stands for this reading, or null when it is not used. */
  laser: number | null;
  /** Which of the laser's lines the reading is taken at. */
  line: 'upright' | 'level' | null;
  /** Where the circled number sits. */
  mark: { x: number; y: number };
  labelSide: 'before' | 'after';
  words: string;
}

/** How far off a wall the laser's upright line is drawn. 50mm would be too small to see. */
const OFF_WALL = 56;

/** Where the tape runs for a reading, in picture coordinates. */
export function tapeFor(visual: RunPicture, glassTop: number): Tape {
  const view = visual.view;
  const { left, right } = runEnds(view);
  const middle = (left + right) / 2;
  const along = FLOOR - 7;
  const ceiling = visual.kind === 'run-ceiling' || (visual.kind === 'wall-gap' && visual.toCeiling);
  // A reading straight up stands just inside whatever is at that side.
  const foot = (side: 'left' | 'right', inset: number) => (side === 'left' ? left + inset : right - inset);
  const outward = (side: 'left' | 'right') => (side === 'left' ? -16 : 16);

  switch (visual.kind) {
    case 'run-width': {
      if (visual.part === 'whole') {
        // The pull starts from a wall where the run has one.
        const fromRight = view.right === 'wall' && view.left !== 'wall';
        const [near, far] = fromRight ? [right, left] : [left, right];
        return { body: { x: far, y: along }, hook: { x: near, y: along }, laser: null, line: null, mark: { x: middle, y: along + 16 }, labelSide: 'before', words: 'along the floor from one end of the glass to the other' };
      }
      const end = visual.part === 'a' ? left : right;
      return { body: { x: middle, y: along }, hook: { x: end, y: along }, lit: { x: middle, y: along }, laser: middle, line: 'upright', mark: { x: (end + middle) / 2, y: along + 16 }, labelSide: 'before', words: `along the floor from the ${visual.part === 'a' ? 'left' : 'right'} end to the laser` };
    }
    case 'tray-width':
      return { body: { x: 302, y: along }, hook: { x: left, y: along }, laser: null, line: null, mark: { x: (left + 302) / 2, y: along + 16 }, labelSide: 'before', words: 'from the wall to the far edge of the tray' };
    case 'run-floor': {
      const x = foot(visual.side, view[visual.side] === 'wall' ? 18 : 13);
      return { body: { x, y: LEVEL }, hook: { x, y: FLOOR }, lit: { x, y: LEVEL }, laser: middle, line: 'level', mark: { x: x + outward(visual.side), y: (LEVEL + FLOOR) / 2 }, labelSide: visual.side === 'left' ? 'after' : 'before', words: `from the floor up to the level line, on the ${visual.side}` };
    }
    case 'run-ceiling': {
      const x = foot(visual.side, view[visual.side] === 'wall' ? 44 : 39);
      return { body: { x, y: CEIL + 11 }, hook: { x, y: FLOOR }, laser: null, line: null, mark: { x: x + outward(visual.side), y: (CEIL + FLOOR) / 2 - 26 }, labelSide: visual.side === 'left' ? 'after' : 'before', words: `from the floor straight up to the ceiling, on the ${visual.side}` };
    }
    case 'wall-gap': {
      const wall = visual.side === 'left' ? left : right;
      const line = visual.side === 'left' ? wall + OFF_WALL : wall - OFF_WALL;
      const y = visual.at === 'bottom' ? along : ceiling ? CEIL + 9 : glassTop;
      return { body: { x: line, y }, hook: { x: wall, y }, lit: { x: line, y }, laser: line, line: 'upright', mark: { x: (wall + line) / 2, y: y + (visual.at === 'bottom' ? 16 : -16) }, labelSide: visual.at === 'bottom' ? 'before' : 'after', words: `from the ${visual.side} wall to the laser line, at the ${visual.at}` };
    }
  }
}

export interface DoneMark {
  visual: RunPicture;
  n: number;
}

export function RunVisual({
  visual,
  views,
  glassTop,
  value,
  mark,
  done = [],
}: {
  visual: RunPicture;
  views: RunView[];
  glassTop: number;
  value: number | null;
  mark?: number;
  /** Readings already taken on this run, with their circled numbers. */
  done?: DoneMark[];
}) {
  const view = visual.view;
  const { left, right } = runEnds(view);
  const ceiling = visual.kind === 'run-ceiling' || (visual.kind === 'wall-gap' && visual.toCeiling);
  const tape = tapeFor(visual, glassTop);
  const top = ceiling ? CEIL : glassTop;
  const tray = visual.kind === 'tray-width';
  // The wall that carries the mark for the top of the glass, when a reading is taken at it.
  const atMark = visual.kind === 'wall-gap' && visual.at === 'top' && !ceiling;
  return (
    <Frame label={`Measuring ${tape.words}`}>
      <RunRoom view={view} ceiling={ceiling} />
      {tray && (
        // The tray runs on past where the glass stops. The gap beside the glass is the way in.
        <g>
          <rect x={left} y={FLOOR - 3} width={302 - left} height={6} fill={BG} stroke={WALL_EDGE} strokeWidth={1} />
          <text x={(right + 302) / 2} y={FLOOR - 24} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={ACCENT} fontFamily="system-ui, sans-serif">
            way in
          </text>
        </g>
      )}
      <EndMark view={view} side="left" />
      <EndMark view={view} side="right" />
      {atMark && <WallMark side={visual.side} y={glassTop} />}
      <RunGlassLine view={view} top={top} />
      {tape.laser !== null && (
        <>
          <LaserLines
            ceiling={ceiling}
            x={tape.laser}
            left={view.left === 'wall' ? left : 0}
            right={view.right === 'wall' ? right : 320}
            vertical={tape.line === 'upright' ? 'on' : 'dim'}
            level={tape.line === 'level' ? 'on' : 'dim'}
          />
          <Tripod x={tape.laser} />
        </>
      )}
      {done.map((d) => {
        const m = tapeFor(d.visual, glassTop).mark;
        return <PointMark key={d.n} x={m.x} y={m.y} n={d.n} />;
      })}
      <TapeMeasure x1={tape.body.x} y1={tape.body.y} x2={tape.hook.x} y2={tape.hook.y} value={value === null ? '?' : `${value}mm`} lit={tape.lit} labelSide={tape.labelSide} />
      {mark !== undefined && (
        <g className="mw-appear">
          <PointMark x={tape.mark.x} y={tape.mark.y} n={mark} lit />
        </g>
      )}
      <PlanInset view={view} views={views} />
    </Frame>
  );
}
