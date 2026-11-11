/**
 * The drawings on an installation sheet, laid out as Custom Showers' own are:
 * the opening and its glass seen from outside, how far out of square the
 * opening is, and each pane as cut with the gaps to set it out by.
 *
 * Nothing is worked out here. Every size, position and gap comes from the
 * engine: setOutOf for where the glass stands, panesOf for each pane as it is
 * cut, and the spec for the door hardware.
 */

import type { ConfiguratorSpec, Pane, RunSetOut, SetOut, ShapePoint, SideGap } from '@setout/engine';

const INK = '#111';
const DIM = '#444';
const FAINT = '#9a9a9a';

/** "P1" from "P1 — Door (Front)". */
export const paneName = (label: string) => label.split(' — ')[0];

const round = (v: number) => Math.round(v) || 0;

function Arrows({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0 1 L9 5 L0 9" fill="none" stroke={DIM} strokeWidth="1.3" />
      </marker>
    </defs>
  );
}

/** Short ticks on the outside of a wall's face, so it reads as a wall. */
function Hatch({ x1, y1, x2, y2, outward }: { x1: number; y1: number; x2: number; y2: number; outward: -1 | 1 }) {
  const n = Math.max(3, Math.floor(Math.abs(y2 - y1) / 14));
  return (
    <g stroke={DIM} strokeWidth="0.8">
      {Array.from({ length: n }, (_, k) => {
        const t = (k + 0.5) / n;
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        return <line key={k} x1={x} y1={y} x2={x + outward * 7} y2={y + 7} />;
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// The opening and its glass, seen from outside
// ---------------------------------------------------------------------------

/**
 * The whole shower seen from outside, runs unfolded side by side: the floor,
 * the walls and any measured ceiling, each pane where it stands, the hinges
 * and handle on each door, each pane's share of the opening along the bottom
 * and the height at each end.
 */
export function Elevation({ setOut, panes, spec }: { setOut: SetOut; panes: Pane[]; spec: ConfiguratorSpec }) {
  const W = 520;
  const H = 470;
  const M = { left: 62, right: 62, top: 22, bottom: 92 };
  const { runs } = setOut;
  const fold = runs.length > 1 ? Math.max(...runs.map((r) => r.widthMm)) * 0.14 : 0;
  const offsets: number[] = [];
  let along = 0;
  runs.forEach((r, i) => {
    offsets.push(along);
    along += r.widthMm + (i < runs.length - 1 ? fold : 0);
  });
  const corners = setOut.panes.flatMap((p) => Object.values(p.corners));
  const topMm = Math.max(...corners.map((c) => c.y), ...runs.flatMap((r) => (r.ceiling ? [r.ceiling.startMm, r.ceiling.endMm] : [])));
  const bottomMm = Math.min(...runs.flatMap((r) => [r.floor.startMm, r.floor.endMm]));
  const s = Math.min((W - M.left - M.right) / Math.max(along, 1), (H - M.top - M.bottom) / Math.max(topMm - bottomMm, 1));
  const x0 = M.left + (W - M.left - M.right - along * s) / 2;
  const X = (run: number, x: number) => x0 + (offsets[run] + x) * s;
  const Y = (y: number) => M.top + (topMm - y) * s;
  const baseY = Y(bottomMm);
  const first = setOut.panes[runs[0].panes[0]];
  const lastRun = runs[runs.length - 1];
  const last = setOut.panes[lastRun.panes[lastRun.panes.length - 1]];
  // The height at each end of the shower: to the ceiling where the glass goes
  // to one, otherwise to the top of the glass, up from the floor there.
  const startTop = runs[0].ceiling && spec.isFloorToCeiling ? runs[0].ceiling.startMm : first.corners.topLeft.y;
  const endTop = lastRun.ceiling && spec.isFloorToCeiling ? lastRun.ceiling.endMm : last.corners.topRight.y;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="The shower seen from outside, with each pane’s share of the opening and the height at each end">
      <Arrows id="el-arrow" />
      {runs.map((run, r) => (
        <RunElevation key={r} run={run} r={r} X={X} Y={Y} s={s} topY={M.top - 6} setOut={setOut} panes={panes} spec={spec} />
      ))}

      {/* Each pane's share of the opening, and each run's width where it has more than one pane. */}
      {runs.map((run, r) => (
        <g key={`w${r}`}>
          {run.panes.map((i) => {
            const p = setOut.panes[i];
            const a = X(r, p.fromMm);
            const b = X(r, p.toMm);
            return (
              <g key={i}>
                <line x1={a} y1={baseY + 14} x2={a} y2={baseY + 30} stroke={DIM} strokeWidth="0.8" />
                <line x1={b} y1={baseY + 14} x2={b} y2={baseY + 30} stroke={DIM} strokeWidth="0.8" />
                <line x1={a} y1={baseY + 24} x2={b} y2={baseY + 24} stroke={DIM} strokeWidth="0.8" markerStart="url(#el-arrow)" markerEnd="url(#el-arrow)" />
                <text x={(a + b) / 2} y={baseY + 20} fontSize="12" textAnchor="middle" fill={INK}>
                  {round(p.toMm - p.fromMm)}
                </text>
              </g>
            );
          })}
          {run.panes.length > 1 && (
            <g>
              <line x1={X(r, 0)} y1={baseY + 48} x2={X(r, run.widthMm)} y2={baseY + 48} stroke={DIM} strokeWidth="0.8" markerStart="url(#el-arrow)" markerEnd="url(#el-arrow)" />
              <text x={X(r, run.widthMm / 2)} y={baseY + 44} fontSize="12" fontWeight="600" textAnchor="middle" fill={INK}>
                {round(run.widthMm)}
              </text>
            </g>
          )}
          {runs.length > 1 && (
            <text x={X(r, run.widthMm / 2)} y={baseY + 68} fontSize="11" textAnchor="middle" fill={DIM}>
              {run.label}
            </text>
          )}
        </g>
      ))}

      {/* The height at each end of the shower. */}
      <HeightDimension x={X(0, 0) - 26} yLow={Y(runs[0].floor.startMm)} yHigh={Y(startTop)} label={round(startTop - runs[0].floor.startMm)} />
      <HeightDimension
        x={X(runs.length - 1, lastRun.widthMm) + 26}
        yLow={Y(lastRun.floor.endMm)}
        yHigh={Y(endTop)}
        label={round(endTop - lastRun.floor.endMm)}
      />
    </svg>
  );
}

function HeightDimension({ x, yLow, yHigh, label }: { x: number; yLow: number; yHigh: number; label: number }) {
  return (
    <g>
      <line x1={x} y1={yLow} x2={x} y2={yHigh} stroke={DIM} strokeWidth="0.8" markerStart="url(#el-arrow)" markerEnd="url(#el-arrow)" />
      <text x={x - 5} y={(yLow + yHigh) / 2} fontSize="12" textAnchor="middle" transform={`rotate(-90 ${x - 5} ${(yLow + yHigh) / 2})`} fill={INK}>
        {label}
      </text>
    </g>
  );
}

function RunElevation({
  run,
  r,
  X,
  Y,
  s,
  topY,
  setOut,
  panes,
  spec,
}: {
  run: RunSetOut;
  r: number;
  X: (run: number, x: number) => number;
  Y: (y: number) => number;
  s: number;
  topY: number;
  setOut: SetOut;
  panes: Pane[];
  spec: ConfiguratorSpec;
}) {
  const wallAt = (wall: Extract<RunSetOut['start'], { meets: 'wall' }>, y: number) => wall.xMm + wall.perMm * y;
  const yTopMm = (Y(0) - topY) / s;
  return (
    <g>
      {/* The floor. */}
      <line x1={X(r, 0)} y1={Y(run.floor.startMm)} x2={X(r, run.widthMm)} y2={Y(run.floor.endMm)} stroke={INK} strokeWidth="2" />
      {/* The ceiling, where it was measured: solid where the glass goes to it. */}
      {run.ceiling && (
        <line
          x1={X(r, 0)}
          y1={Y(run.ceiling.startMm)}
          x2={X(r, run.widthMm)}
          y2={Y(run.ceiling.endMm)}
          stroke={INK}
          strokeWidth={spec.isFloorToCeiling ? 2 : 1}
          strokeDasharray={spec.isFloorToCeiling ? undefined : '6 4'}
        />
      )}
      {/* The walls, leaning as measured. */}
      {run.start.meets === 'wall' && (
        <g>
          <line x1={X(r, wallAt(run.start, run.floor.startMm))} y1={Y(run.floor.startMm)} x2={X(r, wallAt(run.start, yTopMm))} y2={topY} stroke={INK} strokeWidth="2" />
          <Hatch x1={X(r, wallAt(run.start, run.floor.startMm))} y1={Y(run.floor.startMm)} x2={X(r, wallAt(run.start, yTopMm))} y2={topY} outward={-1} />
        </g>
      )}
      {run.end.meets === 'wall' && (
        <g>
          <line x1={X(r, wallAt(run.end, run.floor.endMm))} y1={Y(run.floor.endMm)} x2={X(r, wallAt(run.end, yTopMm))} y2={topY} stroke={INK} strokeWidth="2" />
          <Hatch x1={X(r, wallAt(run.end, run.floor.endMm))} y1={Y(run.floor.endMm)} x2={X(r, wallAt(run.end, yTopMm))} y2={topY} outward={1} />
        </g>
      )}
      {/* A corner: the next run is drawn folded out beside this one. */}
      {run.end.meets === 'corner' && (
        <line x1={X(r, run.widthMm)} y1={Y(run.floor.endMm) + 8} x2={X(r, run.widthMm)} y2={topY} stroke={DIM} strokeWidth="0.8" strokeDasharray="8 3 2 3" />
      )}
      {run.start.meets === 'corner' && (
        <line x1={X(r, 0)} y1={Y(run.floor.startMm) + 8} x2={X(r, 0)} y2={topY} stroke={DIM} strokeWidth="0.8" strokeDasharray="8 3 2 3" />
      )}

      {run.panes.map((i) => {
        const at = setOut.panes[i];
        const c = at.corners;
        const P = (p: ShapePoint) => `${X(r, p.x)},${Y(p.y)}`;
        const panel = spec.panels[i];
        const door = panel.door;
        const mid = (a: ShapePoint, b: ShapePoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        return (
          <g key={i}>
            <polygon points={[c.bottomLeft, c.bottomRight, c.topRight, c.topLeft].map(P).join(' ')} fill="#fff" stroke={INK} strokeWidth="1.3" />
            {door && (
              <g>
                {/* The opening sign: its point is on the hinge side. */}
                {(() => {
                  const hinge = door.hingeSide === 'left' ? mid(c.bottomLeft, c.topLeft) : mid(c.bottomRight, c.topRight);
                  const [top, bottom] = door.hingeSide === 'left' ? [c.topRight, c.bottomRight] : [c.topLeft, c.bottomLeft];
                  return (
                    <polyline points={[top, hinge, bottom].map(P).join(' ')} fill="none" stroke={FAINT} strokeWidth="0.8" strokeDasharray="5 3" />
                  );
                })()}
                {door.hingeHeightsMm.map((h) => {
                  const x = door.hingeSide === 'left' ? c.bottomLeft.x : c.bottomRight.x;
                  return <rect key={h} x={X(r, x) - 5} y={Y(panel.deductions.vertical.bottom + h) - 3} width="10" height="6" fill={INK} />;
                })}
                {(() => {
                  const latch = door.hingeSide === 'left' ? c.bottomRight.x : c.bottomLeft.x;
                  const hole = panes[i].features.find((f) => f.kind === 'hole' && (f.role === 'handle' || f.role === 'knob'));
                  const inset = (door.hingeSide === 'left' ? -1 : 1) * Math.max((hole?.kind === 'hole' ? hole.insetMm : 0) * s, 5);
                  const hx = X(r, latch) + inset;
                  const isKnob = !hole || (hole.kind === 'hole' && hole.role === 'knob');
                  if (isKnob) return <circle cx={hx} cy={Y(panel.deductions.vertical.bottom + door.handlePlacement.handleHeight)} r="3" fill={INK} />;
                  return (
                    <line
                      x1={hx}
                      y1={Y(panel.deductions.vertical.bottom + door.handleHoleHeightsMm.lowerMm)}
                      x2={hx}
                      y2={Y(panel.deductions.vertical.bottom + door.handleHoleHeightsMm.upperMm)}
                      stroke={INK}
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  );
                })()}
              </g>
            )}
            <text x={X(r, (at.fromMm + at.toMm) / 2)} y={Y((c.bottomLeft.y + c.topLeft.y) / 2)} fontSize="13" fontWeight="700" textAnchor="middle" fill={INK}>
              {paneName(panel.label)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// How far out of square the opening is
// ---------------------------------------------------------------------------

/**
 * Each run's opening against a square one, drawn larger than it is, with how
 * far each wall leans over the glass height and how far the floor and any
 * measured ceiling fall along the run, in mm.
 */
export function OutOfSquare({ setOut }: { setOut: SetOut }) {
  const { runs } = setOut;
  const W = 360;
  const H = 210;
  const cell = W / runs.length;
  const square = runs.every(
    (r) =>
      (r.start.meets !== 'wall' || r.start.leanMm === 0) &&
      (r.end.meets !== 'wall' || r.end.leanMm === 0) &&
      round(r.floor.startMm - r.floor.endMm) === 0 &&
      (!r.ceiling || round(r.ceiling.startMm - r.ceiling.endMm) === 0)
  );
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={square ? 'The opening is square and level, as measured' : 'How far the opening is out of square, drawn larger than it is'}>
        {runs.map((run, r) => (
          <RunOutOfSquare key={r} run={run} x={r * cell} w={cell} h={H} named={runs.length > 1} />
        ))}
      </svg>
      <figcaption className="text-center text-[10px] text-black/70">
        {square ? 'Square and level, as measured.' : 'Out of square, in mm, drawn larger than it is.'}
        {runs.length > 1 ? ' Dashed where a run meets a corner.' : ''}
      </figcaption>
    </figure>
  );
}

function RunOutOfSquare({ run, x, w, h, named }: { run: RunSetOut; x: number; w: number; h: number; named: boolean }) {
  const A = x + w * 0.24;
  const B = x + w * 0.76;
  const T = named ? 40 : 28;
  const Bt = h - 46;
  const leanStart = run.start.meets === 'wall' ? run.start.leanMm : 0;
  const leanEnd = run.end.meets === 'wall' ? run.end.leanMm : 0;
  const f0 = run.floor.startMm;
  const f1 = run.floor.endMm;
  const fall = round(Math.abs(f0 - f1));
  const high = run.ceiling ? Math.max(run.ceiling.startMm, run.ceiling.endMm) : 0;
  const d0 = run.ceiling ? run.ceiling.startMm - high : 0;
  const d1 = run.ceiling ? run.ceiling.endMm - high : 0;
  const slope = run.ceiling ? round(Math.abs(run.ceiling.startMm - run.ceiling.endMm)) : 0;
  const most = Math.max(Math.abs(leanStart), Math.abs(leanEnd), fall, slope);
  // Drawn larger than it is, so a few millimetres can be seen, but never off
  // the drawing: a wall leaning out and a falling floor go outside the square.
  const out = Math.max(leanStart < 0 ? -leanStart : 0, leanEnd < 0 ? -leanEnd : 0);
  const E =
    most > 0
      ? Math.min(Math.max(1.5, ((B - A) * 0.14) / most), 8, fall > 0 ? (h - Bt - 20) / fall : Infinity, out > 0 ? (A - x - 20) / out : Infinity)
      : 0;

  const BL = { x: A, y: Bt - f0 * E };
  const BR = { x: B, y: Bt - f1 * E };
  const TL = { x: A + leanStart * E, y: T - d0 * E };
  const TR = { x: B - leanEnd * E, y: T - d1 * E };
  const side = (meets: RunSetOut['start']['meets']) => (meets === 'wall' ? { stroke: INK, strokeWidth: 1.6 } : { stroke: DIM, strokeWidth: 0.9, strokeDasharray: '6 4' });

  return (
    <g>
      {named && (
        <text x={(A + B) / 2} y={14} fontSize="11" textAnchor="middle" fill={DIM}>
          {run.label}
        </text>
      )}
      {/* Square, for comparison. */}
      <rect x={A} y={T} width={B - A} height={Bt - T} fill="none" stroke={FAINT} strokeWidth="0.8" />
      {[
        [A, T],
        [B, T],
        [A, Bt],
        [B, Bt],
      ].map(([cx, cy]) => (
        <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="2.6" fill={INK} />
      ))}
      {/* The opening. */}
      <line x1={BL.x} y1={BL.y} x2={BR.x} y2={BR.y} stroke={INK} strokeWidth="1.6" />
      <line x1={BL.x} y1={BL.y} x2={TL.x} y2={TL.y} {...side(run.start.meets)} />
      <line x1={BR.x} y1={BR.y} x2={TR.x} y2={TR.y} {...side(run.end.meets)} />
      <line x1={TL.x} y1={TL.y} x2={TR.x} y2={TR.y} {...(run.ceiling ? { stroke: INK, strokeWidth: 1.6 } : { stroke: DIM, strokeWidth: 0.9, strokeDasharray: '6 4' })} />

      {leanStart !== 0 && (
        <text x={Math.min(A, TL.x) - 8} y={T + 12} fontSize="13" textAnchor="end" fill={INK}>
          {Math.abs(leanStart)}
        </text>
      )}
      {leanEnd !== 0 && (
        <text x={Math.max(B, TR.x) + 8} y={T + 12} fontSize="13" textAnchor="start" fill={INK}>
          {Math.abs(leanEnd)}
        </text>
      )}
      {fall !== 0 && (
        <text x={f0 < f1 ? A + 4 : B - 4} y={Math.max(BL.y, BR.y) + 15} fontSize="13" textAnchor={f0 < f1 ? 'start' : 'end'} fill={INK}>
          {fall}
        </text>
      )}
      {slope !== 0 && (
        <text x={d0 < d1 ? A + 4 : B - 4} y={T - 6} fontSize="13" textAnchor={d0 < d1 ? 'start' : 'end'} fill={INK}>
          {slope}
        </text>
      )}
      {run.start.meets === 'open' && (
        <text x={A - 6} y={(T + Bt) / 2} fontSize="9" textAnchor="end" fill={DIM}>
          open
        </text>
      )}
      {run.end.meets === 'open' && (
        <text x={B + 6} y={(T + Bt) / 2} fontSize="9" textAnchor="start" fill={DIM}>
          open
        </text>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Each pane as cut, with the gaps to set it out by
// ---------------------------------------------------------------------------

const JOINT = 34;
const CORNER = 44;
const OUTSIDE = 46;
const MIN_PANE = 70;

/**
 * Every pane in a row, from the left as seen from outside, each with the
 * length of every edge as cut, and around it the gap from each corner to the
 * floor and any ceiling, and across to the walls and the next pane.
 */
export function SetOutBand({ setOut, panes, glass }: { setOut: SetOut; panes: Pane[]; glass: string }) {
  const W = 760;
  const H = 280;
  const base = H - 58;
  const tallest = Math.max(...panes.map((p) => p.heightMm));
  const v = 150 / Math.max(tallest, 1);
  const joins = panes.slice(1).map((_, k) => (setOut.panes[k].run === setOut.panes[k + 1].run ? JOINT : CORNER));
  const room = W - 2 * OUTSIDE - joins.reduce((a, b) => a + b, 0);
  // Widths in proportion, none too narrow to write on.
  let narrow = new Set<number>();
  let k = 1;
  for (let pass = 0; pass < 3; pass++) {
    const wide = panes.reduce((sum, p, i) => (narrow.has(i) ? sum : sum + p.widthMm), 0);
    k = (room - narrow.size * MIN_PANE) / Math.max(wide, 1);
    const next = new Set(panes.flatMap((p, i) => (p.widthMm * k < MIN_PANE ? [i] : [])));
    if (next.size === narrow.size) break;
    narrow = next;
  }
  // Drawn wider than they are, so their numbers fit, but never more than three times.
  k = Math.min(k, v * 3);
  const widths = panes.map((p) => Math.max(MIN_PANE, p.widthMm * k));
  const drawn = widths.reduce((a, b) => a + b, 0) + joins.reduce((a, b) => a + b, 0);
  const lefts: number[] = [];
  let x = (W - drawn) / 2;
  widths.forEach((w, i) => {
    lefts.push(x);
    x += w + (joins[i] ?? 0);
  });
  const startWall = lefts[0] - 30;
  const endWall = lefts[lefts.length - 1] + widths[widths.length - 1] + 30;
  const P = (i: number, p: ShapePoint) => ({ X: lefts[i] + (p.x / Math.max(panes[i].widthMm, 1)) * widths[i], Y: base - p.y * v });
  const topOf = (i: number) => Math.min(P(i, panes[i].outline.topLeft).Y, P(i, panes[i].outline.topRight).Y);
  const top = Math.min(...panes.map((_, i) => topOf(i)));

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Each pane as cut, with the gaps to the floor, the walls and the next pane">
        <Arrows id="band-arrow" />
        {panes.map((pane, i) => {
          const o = pane.outline;
          const bl = P(i, o.bottomLeft);
          const br = P(i, o.bottomRight);
          const tr = P(i, o.topRight);
          const tl = P(i, o.topLeft);
          const at = setOut.panes[i];
          const hinge = pane.features.find((f) => f.kind === 'notch' && f.role === 'door-hinge');
          return (
            <g key={pane.id}>
              <text x={(tl.X + tr.X) / 2} y={top - 26} fontSize="11" textAnchor="middle" fill={DIM}>
                {glass}
              </text>
              <polygon points={[bl, br, tr, tl].map((c) => `${c.X},${c.Y}`).join(' ')} fill="#fff" stroke={INK} strokeWidth="1.3" />
              {hinge && hinge.kind === 'notch' && (
                <polyline
                  points={(hinge.side === 'left'
                    ? [tr, { X: (tl.X + bl.X) / 2, Y: (tl.Y + bl.Y) / 2 }, br]
                    : [tl, { X: (tr.X + br.X) / 2, Y: (tr.Y + br.Y) / 2 }, bl]
                  )
                    .map((c) => `${c.X},${c.Y}`)
                    .join(' ')}
                  fill="none"
                  stroke={FAINT}
                  strokeWidth="0.8"
                />
              )}
              {/* Hinge notches and handle holes, where they are on the glass. */}
              {pane.features.map((f, j) => {
                if (f.kind === 'corner') return null;
                const edgeBottom = f.side === 'left' ? o.bottomLeft : o.bottomRight;
                const y = base - (edgeBottom.y + f.centreMm) * v;
                const edgeX = P(i, { x: f.side === 'left' ? o.bottomLeft.x : o.bottomRight.x, y: 0 }).X;
                if (f.kind === 'notch') return <rect key={j} x={f.side === 'left' ? edgeX - 3 : edgeX - 5} y={y - 3} width="8" height="6" fill={INK} />;
                const hx = edgeX + (f.side === 'left' ? 1 : -1) * Math.max((f.insetMm / Math.max(pane.widthMm, 1)) * widths[i], 6);
                return <circle key={j} cx={hx} cy={y} r="2.2" fill="none" stroke={INK} strokeWidth="1" />;
              })}

              {/* Each edge's length as cut. */}
              <text x={(tl.X + tr.X) / 2} y={(tl.Y + tr.Y) / 2 + 14} fontSize="12" textAnchor="middle" fill={INK}>
                {o.topRight.x - o.topLeft.x}
              </text>
              <text x={(bl.X + br.X) / 2} y={(bl.Y + br.Y) / 2 - 6} fontSize="12" textAnchor="middle" fill={INK}>
                {o.bottomRight.x - o.bottomLeft.x}
              </text>
              <SideLength x={tl.X + (bl.X - tl.X) * 0.32 + 12} y={tl.Y + (bl.Y - tl.Y) * 0.32} value={o.topLeft.y - o.bottomLeft.y} />
              <SideLength x={tr.X + (br.X - tr.X) * 0.32 - 6} y={tr.Y + (br.Y - tr.Y) * 0.32} value={o.topRight.y - o.bottomRight.y} />
              <text x={(bl.X + br.X) / 2} y={(tl.Y + bl.Y) / 2 + 26} fontSize="13" fontWeight="700" textAnchor="middle" fill={INK}>
                {paneName(pane.label)}
              </text>

              {/* Down to the floor, and up to the ceiling, at each corner. */}
              <text x={bl.X + 2} y={bl.Y + 13} fontSize="11" textAnchor="start" fill={INK}>
                {at.floorGap.left}
              </text>
              <text x={br.X - 2} y={br.Y + 13} fontSize="11" textAnchor="end" fill={INK}>
                {at.floorGap.right}
              </text>
              {at.ceilingGap && (
                <>
                  <text x={tl.X + 2} y={tl.Y - 5} fontSize="11" textAnchor="start" fill={INK}>
                    {at.ceilingGap.left}
                  </text>
                  <text x={tr.X - 2} y={tr.Y - 5} fontSize="11" textAnchor="end" fill={INK}>
                    {at.ceilingGap.right}
                  </text>
                </>
              )}

              {/* Across to whatever is on each side. */}
              {i === 0 && <OuterSide side="start" gap={at.left} paneX={Math.min(bl.X, tl.X)} wallX={startWall} base={base} top={top} />}
              {i === panes.length - 1 && <OuterSide side="end" gap={at.right} paneX={Math.max(br.X, tr.X)} wallX={endWall} base={base} top={top} />}
              {i < panes.length - 1 && <Between gap={at.right} from={Math.max(br.X, tr.X)} to={lefts[i + 1]} base={base} top={top} />}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-center text-[10px] text-black/70">
        Each pane as cut, seen from outside. Gaps in mm: under each corner to the floor{panes.some((_, i) => setOut.panes[i].ceilingGap) ? ', over it to the ceiling,' : ''} and across to the walls and the next pane.
      </figcaption>
    </figure>
  );
}

function SideLength({ x, y, value }: { x: number; y: number; value: number }) {
  return (
    <text x={x} y={y} fontSize="12" textAnchor="middle" transform={`rotate(-90 ${x} ${y})`} fill={INK}>
      {value}
    </text>
  );
}

/** The gap between two panes, or the corner between two runs. */
function Between({ gap, from, to, base, top }: { gap: SideGap; from: number; to: number; base: number; top: number }) {
  const mid = (from + to) / 2;
  if (gap.meets === 'corner') {
    return (
      <g>
        <line x1={mid} y1={base + 6} x2={mid} y2={top - 8} stroke={DIM} strokeWidth="0.8" strokeDasharray="8 3 2 3" />
        <text x={mid} y={base + 40} fontSize="10" textAnchor="middle" fill={DIM}>
          corner
        </text>
      </g>
    );
  }
  const differs = gap.topMm !== null && gap.topMm !== gap.bottomMm;
  return (
    <g>
      <line x1={from} y1={base + 22} x2={to} y2={base + 22} stroke={DIM} strokeWidth="0.8" />
      <line x1={from} y1={base + 16} x2={from} y2={base + 28} stroke={DIM} strokeWidth="0.8" />
      <line x1={to} y1={base + 16} x2={to} y2={base + 28} stroke={DIM} strokeWidth="0.8" />
      <text x={mid} y={base + 40} fontSize="12" fontWeight="600" textAnchor="middle" fill={INK}>
        {gap.bottomMm}
      </text>
      {differs && (
        <text x={mid} y={top + 12} fontSize="12" fontWeight="600" textAnchor="middle" fill={INK}>
          {gap.topMm}
        </text>
      )}
    </g>
  );
}

/** The wall, or open end, at either end of the shower, with the gap to it at the bottom and the top. */
function OuterSide({
  side,
  gap,
  paneX,
  wallX,
  base,
  top,
}: {
  side: 'start' | 'end';
  gap: SideGap;
  paneX: number;
  wallX: number;
  base: number;
  top: number;
}) {
  const outward = side === 'start' ? -1 : 1;
  if (gap.meets !== 'wall') {
    return (
      <text x={wallX} y={base - 4} fontSize="10" textAnchor="middle" fill={DIM}>
        {gap.meets === 'open' ? 'open' : 'corner'}
      </text>
    );
  }
  const mid = (paneX + wallX) / 2;
  return (
    <g>
      <line x1={wallX} y1={base + 8} x2={wallX} y2={top - 10} stroke={INK} strokeWidth="2" />
      <Hatch x1={wallX} y1={base + 8} x2={wallX} y2={top - 10} outward={outward as -1 | 1} />
      {[
        { y: base + 22, value: gap.bottomMm },
        { y: top + 8, value: gap.topMm },
      ].map(({ y, value }) => (
        <g key={y}>
          <line x1={wallX} y1={y} x2={paneX} y2={y} stroke={DIM} strokeWidth="0.8" markerStart="url(#band-arrow)" markerEnd="url(#band-arrow)" />
          <text x={mid} y={y - 4} fontSize="12" fontWeight="600" textAnchor="middle" fill={INK}>
            {value}
          </text>
        </g>
      ))}
    </g>
  );
}
