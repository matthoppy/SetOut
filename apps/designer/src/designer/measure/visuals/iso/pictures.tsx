/**
 * The measuring pictures for every shower drawn on its tray: one picture to
 * a card, each showing the one thing that card asks for, in the same room
 * from the same angle all the way through the deck. Each picture comes in
 * close enough to its own reading to read it, and no closer.
 *
 * Each picture follows its card's words and nothing more. Where the card
 * says where the laser stands, it stands there; where a card does not move
 * it, it stays where the last card left it. The tape starts where the card
 * says to hook or hold it, the number is read where the card says to read
 * it, and the measurement between the two is drawn with an arrow at each
 * end and the number on it.
 */

import type { RunView } from '@setout/engine';
import { Fragment, useMemo, type ReactNode } from 'react';
import type { RunPicture } from '../RunVisual';
import { BODY, Beam, Dimension, LaserBody, Note, ReadPoint, StartPoint, Tape, TripodLaser } from './Kit';
import { Face, Floor, Mask, RunGlass, Tray, WallMask, Walls, WallShade } from './Room';
import { Stage, type Ctx } from './Stage';
import { MM, add, along, boxOf, dir, glassTop, grow, lift, planFor, roomTop, v, type Box, type Camera, type Plan, type Run, type RunPanes, type V3 } from './space';

export interface SceneInput {
  views: RunView[];
  made: RunPanes[];
  toCeiling: boolean;
  sliding: boolean;
}

/** A corner the laser stands over: the run it ends, and which end. */
export interface Corner {
  run: number;
  end: 'left' | 'right';
}

const neg = (p: V3) => v(-p.x, -p.y, -p.z);
const near = (p: V3, q: V3) => Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5;

/** The room for a shower: it depends only on the shower's shape, so it holds still while numbers are typed. */
function usePlan(input: SceneInput): Plan {
  const key = JSON.stringify([input.views, input.made, input.toCeiling, input.sliding]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the key stands for the input
  return useMemo(() => planFor(input.views, input.made, { toCeiling: input.toCeiling, sliding: input.sliding }), [key]);
}

// ---------------------------------------------------------------------------
// The room, drawn far to near
// ---------------------------------------------------------------------------

/** Something standing in the room, with the point it stands at and the points it reaches, for ordering. */
interface Thing {
  key: string;
  node: ReactNode;
  at: V3;
  reach: V3[];
}

/**
 * The room with things in it, in the order the eye meets them: the floor and
 * walls, then each run of glass from the farthest, with whatever stands
 * behind a pane drawn before it and whatever stands in front drawn after.
 */
function RoomWith({ ctx, onFloor, things = [] }: { ctx: Ctx; onFloor?: ReactNode; things?: Thing[] }) {
  const { plan, cam } = ctx;
  const top = glassTop(plan);
  const panes = [...plan.runs].sort((p, q) => cam.depth(along(q.a, q.b, 0.5)) - cam.depth(along(p.a, p.b, 0.5)));
  const screen = (ps: V3[]) => boxOf(ps.map(cam.at));
  const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const slots: Thing[][] = Array.from({ length: panes.length + 1 }, () => []);
  for (const t of things) {
    const box = screen([t.at, ...t.reach]);
    let after = 0;
    panes.forEach((r, i) => {
      if (!overlaps(box, screen([r.a, r.b, lift(r.a, top), lift(r.b, top)]))) return;
      const toEye = cam.facing(r.out) ? r.out : neg(r.out);
      if ((t.at.x - r.a.x) * toEye.x + (t.at.y - r.a.y) * toEye.y >= -1) after = i + 1;
    });
    slots[after].push(t);
  }
  const draw = (ts: Thing[]) => [...ts].sort((p, q) => cam.depth(q.at) - cam.depth(p.at)).map((t) => <Fragment key={t.key}>{t.node}</Fragment>);
  return (
    <g>
      <Floor />
      <WallShade />
      <Walls />
      <Tray />
      {onFloor}
      {draw(slots[0])}
      {panes.map((r, i) => (
        <Fragment key={r.view.run}>
          <RunGlass run={r} />
          {draw(slots[i + 1])}
        </Fragment>
      ))}
      <Walls near />
    </g>
  );
}

/** Frame a picture on these points in the room, with room round them. */
const focusOn = (ps: V3[], by = 240) => (cam: Camera) => grow(boxOf(ps.map(cam.at)), by);

/**
 * Frame a reading: what it is about, and the whole tray with it, so which
 * side and which end is being measured is plain at a glance.
 */
const readingFocus = (plan: Plan, ps: V3[]) => {
  const H = plan.base;
  const { x0, x1, y0, y1 } = plan.tray;
  return focusOn([...ps, v(x0, y0, H), v(x1, y0, H), v(x1, y1, H), v(x0, y1, H), v(x0, y0, 900), v(x1, y1, 900)], 200);
};

/** The space a laser standing at p takes up, on its own or on its tripod. */
const laserReach = (p: V3, tripod = false): V3[] => {
  const s = BODY.size * 0.6;
  const top = tripod ? MM.tripodBeam + 120 : p.z + BODY.tall + 40;
  return [add(p, v(-s, -s)), add(p, v(s, s)), add(p, v(-s, s)), add(p, v(s, -s)), lift(add(p, v(-s, -s)), top), lift(add(p, v(s, s)), top), lift(add(p, v(-s, s)), top), lift(add(p, v(s, -s)), top)];
};

// ---------------------------------------------------------------------------
// Where things are
// ---------------------------------------------------------------------------

/** The end of a run, as a point and what is there. */
function endOf(run: Run, end: 'left' | 'right') {
  return end === 'left' ? { at: run.a, kind: run.view.left, other: run.b } : { at: run.b, kind: run.view.right, other: run.a };
}

/** The masking tape at one end of a run: against a wall, crossed at a corner, with a stop where the glass stops. */
function EndMask({ plan, run, end }: { plan: Plan; run: Run; end: { at: V3; kind: string; other: V3 } }) {
  const into = dir(end.at, end.other);
  const turn = end.kind === 'corner' ? linesAt(plan, end.at).find((l) => l.run !== run) : undefined;
  return <Mask at={end.at} along={into} cross={turn ? dir(end.at, turn.far) : undefined} shift={end.kind === 'wall' ? 1 : 0} stop={end.kind === 'open'} />;
}

/** Every glass line through a corner: the runs that meet there, each with its far end. */
function linesAt(plan: Plan, corner: V3) {
  return plan.runs.flatMap((r) => {
    if (near(r.a, corner)) return [{ run: r, far: r.b }];
    if (near(r.b, corner)) return [{ run: r, far: r.a }];
    return [];
  });
}

/** Where a straight line from `from` in direction u meets a wall, or the edge of the drawn room. */
function lineEnd(plan: Plan, from: V3, u: V3): { at: V3; wall: boolean } {
  if (Math.abs(u.y) > 0.5) return u.y > 0 ? { at: v(from.x, plan.back), wall: true } : { at: v(from.x, -MM.apron * 0.75), wall: false };
  if (u.x < 0) return plan.walls.left || plan.near === 'left' ? { at: v(0, from.y), wall: true } : { at: v(plan.room.x0 * 0.92, from.y), wall: false };
  return plan.walls.right || plan.near === 'right' ? { at: v(plan.room.x1, from.y), wall: true } : { at: v(plan.room.x1 + (plan.room.x1 - plan.tray.x1) * 0.5, from.y), wall: false };
}

/**
 * The laser's lines from over a corner: along both glass lines to the walls
 * and up them, and out past the laser the other way. Where a line out past
 * it crosses the tape (`crossing`), it is drawn on to the tape and beyond.
 */
function CornerLines({ plan, corner, crossing }: { plan: Plan; corner: V3; crossing?: V3 }) {
  const H = plan.base;
  const lines = linesAt(plan, corner);
  const wallTop = Math.min(roomTop(plan) - 80, 1950);
  return (
    <g>
      {lines.map(({ far }, i) => {
        const u = dir(corner, far);
        const end = lineEnd(plan, corner, u);
        const back = neg(u);
        const crosses = crossing && Math.abs(back.x - crossing.x) < 0.2 && Math.abs(back.y - crossing.y) < 0.2;
        return (
          <g key={i}>
            <Beam a={lift(corner, H + 1)} b={lift(end.at, H + 1)} fade={!end.wall} />
            {end.wall && <Beam a={lift(end.at, H)} b={lift(end.at, wallTop)} fade />}
            <Beam a={lift(corner, H + 1)} b={lift(add(corner, back, crosses ? MM.tapeOut + 260 : 260), H + 1)} fade faint={!crosses} />
          </g>
        );
      })}
    </g>
  );
}

/**
 * The laser's up-and-down line where it falls across the room: over the
 * floor from where the laser stands to the edge of the tray or bath, up its
 * side, across its top, and up the wall it reaches. Over a bath it drops into
 * the basin past the front rim, out of sight, and shows again on the rim at
 * the back.
 */
function UprightLine({ plan, from, edge, wall, top }: { plan: Plan; from: V3; edge: V3; wall: { at: V3; wall: boolean }; top: number }) {
  const H = plan.base;
  const u = dir(edge, wall.at);
  const across: [V3, V3][] =
    plan.surface === 'bath' && Math.abs(u.y) > 0.5
      ? [
          [edge, add(edge, u, MM.rimFront)],
          [v(edge.x, plan.back - MM.rimBack), v(edge.x, plan.back)],
        ]
      : [[edge, wall.at]];
  return (
    <g>
      <Beam a={lift(from, 1)} b={lift(edge, 1)} />
      <Beam a={lift(edge, 1)} b={lift(edge, H + 1)} />
      {across.map(([a, b], i) => (
        <Beam key={i} a={lift(a, H + 1)} b={lift(b, H + 1)} />
      ))}
      {wall.wall && <Beam a={lift(wall.at, H)} b={lift(wall.at, top)} fade />}
    </g>
  );
}

/** The laser's level line where it meets the walls round the shower: along the back wall, and each side wall there is. */
function LevelLines({ plan, level }: { plan: Plan; level: number }) {
  const B = plan.back;
  return (
    <g>
      <Beam a={v(plan.room.x0, B, level)} b={v(plan.room.x1, B, level)} />
      {plan.walls.left && <Beam a={v(0, B, level)} b={v(0, -MM.apron * 0.4, level)} />}
      {plan.walls.right && <Beam a={v(plan.room.x1, B, level)} b={v(plan.room.x1, -MM.apron * 0.4, level)} />}
    </g>
  );
}

/** What the glass stands on, in words. */
const onWhat = (plan: Plan) => (plan.surface === 'bath' ? 'the bath rim' : 'the floor');

// ---------------------------------------------------------------------------
// The measurement drawn over the picture
// ---------------------------------------------------------------------------

interface Measured {
  /** Where the tape starts, and where the number is read. */
  from: V3;
  to: V3;
  /** Which way the dimension stands off the tape, and how far. */
  off: V3;
  by: number;
  laser: boolean;
  value: number | null;
  /** Things the number must not sit on, as points they reach in the room. */
  avoid?: V3[][];
}

function MeasureMarks({ m, ctx }: { m: Measured; ctx: Ctx }) {
  const avoid = (m.avoid ?? []).map((ps) => grow(boxOf(ps.map(ctx.at)), ctx.px(6)));
  return (
    <g>
      <Dimension from={m.from} to={m.to} off={m.off} by={m.by} value={m.value} avoid={avoid} />
      <StartPoint at={ctx.at(m.from)} />
      <ReadPoint at={ctx.at(m.to)} laser={m.laser} />
    </g>
  );
}

/** The points a measurement reaches on the page, for framing. */
const reachOf = (m: Measured) => [m.from, m.to, add(m.from, m.off, m.by * 1.3), add(m.to, m.off, m.by * 1.3)];

// ---------------------------------------------------------------------------
// Mark where the glass goes
// ---------------------------------------------------------------------------

export function IsoMarks({ input }: { input: SceneInput }) {
  const plan = usePlan(input);
  const H = plan.base;
  // A mark at each end of each run, one at a corner for both runs, the end
  // against a wall touching it.
  const marks: { at: V3; along: V3; cross?: V3; shift: number; stop: boolean; run: Run }[] = [];
  for (const r of plan.runs) {
    for (const end of ['left', 'right'] as const) {
      const { at, kind, other } = endOf(r, end);
      if (marks.some((m) => near(m.at, at))) continue;
      const into = dir(at, other);
      if (kind === 'corner') {
        const turn = linesAt(plan, at).find((l) => l.run !== r);
        marks.push({ at, along: into, cross: turn ? dir(at, turn.far) : undefined, shift: 0, stop: false, run: r });
      } else marks.push({ at, along: into, shift: kind === 'wall' ? 1 : 0, stop: kind === 'open', run: r });
    }
  }
  return (
    <Stage
      plan={plan}
      label={
        plan.surface === 'bath'
          ? 'Masking tape on the bath rim against the wall and where the screen will stop, with the glass line drawn across each piece'
          : 'Masking tape on the floor at each end of the glass, with the glass line drawn across each piece, 10mm in from the edge of the tray'
      }
      focus={() => null}
      draw={(ctx) => {
        // The lens looks at the mark nearest the eye.
        const look = [...marks].sort((p, q) => ctx.cam.depth(p.at) - ctx.cam.depth(q.at))[0];
        const target = lift(add(look.at, look.along, look.shift ? MM.maskLong * 0.5 : 0), H);
        const edge = add(target, look.run.out, MM.lip);
        // On a bath the card only says to draw the line where the glass will stand.
        const bath = plan.surface === 'bath';
        return {
          scene: (
            <RoomWith
              ctx={ctx}
              onFloor={marks.map((m, i) => (
                <Mask key={i} at={m.at} along={m.along} cross={m.cross} shift={m.shift} stop={m.stop} />
              ))}
            />
          ),
          lens: bath
            ? { target, zoom: 3.6, caption: 'Where the glass will stand' }
            : {
                target,
                zoom: 3.6,
                overlay: (to) => <Dimension from={target} to={edge} off={neg(look.along)} by={130} project={to} />,
                caption: '10mm in from the edge',
              },
        };
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Set up the laser
// ---------------------------------------------------------------------------

export function IsoLaserOn({ input, corner }: { input: SceneInput; corner: Corner | null }) {
  const plan = usePlan(input);
  const H = plan.base;
  const run = corner ? plan.runs[corner.run] : null;
  const at = run ? endOf(run, corner!.end).at : null;
  if (at) {
    const lines = linesAt(plan, at);
    // Out from the corner, away from the shower: where the words go.
    const away = lines.reduce((s, l) => add(s, l.run.out), v(0, 0));
    return (
      <Stage
        plan={plan}
        label="The laser on the floor over the corner mark, its lines along both glass lines to the walls"
        focus={() => null}
        draw={(ctx) => ({
          scene: (
            <RoomWith
              ctx={ctx}
              onFloor={
                <>
                  <Mask at={at} along={dir(at, lines[0].far)} cross={lines[1] ? dir(at, lines[1].far) : undefined} />
                  <CornerLines plan={plan} corner={at} />
                </>
              }
              things={[{ key: 'laser', node: <LaserBody at={lift(at, H)} />, at, reach: [lift(at, H + 260)] }]}
            />
          ),
          overlay: <Note at={ctx.at(add(at, away, 520))} to={ctx.at(lift(at, H))} text="Over the corner mark" />,
        })}
      />
    );
  }
  // No corner: on its tripod in front of the glass, both lines on.
  const front = plan.runs.find((r) => r.view.faces === 'front')!;
  const t = add(along(front.a, front.b, 0.5), front.out, 760);
  const level = MM.tripodBeam;
  const B = plan.back;
  return (
    <Stage
      plan={plan}
      label="The laser on a small tripod in front of the glass, with its level line and its up-and-down line switched on"
      focus={(cam) => grow(boxOf([...[v(plan.room.x0, -MM.apron), v(plan.room.x1, B, roomTop(plan)), v(plan.room.x0, B, roomTop(plan)), v(plan.room.x1, -MM.apron)], add(t, front.out, 420), lift(t, level + 200)].map(cam.at)), 60)}
      draw={(ctx) => ({
        scene: (
          <RoomWith
            ctx={ctx}
            onFloor={
              <>
                <UprightLine plan={plan} from={t} edge={v(t.x, front.a.y - MM.lip)} wall={{ at: v(t.x, B), wall: true }} top={Math.min(roomTop(plan) - 80, 2000)} />
                <LevelLines plan={plan} level={level} />
              </>
            }
            things={[{ key: 'tripod', node: <TripodLaser at={t} level={level} />, at: t, reach: [lift(t, level + 120)] }]}
          />
        ),
      })}
    />
  );
}

// ---------------------------------------------------------------------------
// The readings
// ---------------------------------------------------------------------------

/** Words for each picture, read by a screen reader. */
const words = {
  corner: 'The laser over the corner mark. A tape from the far end of the glass line, along the floor, to the laser, read where the laser’s line lights the blade',
  pull: (plan: Plan) => `A tape along ${onWhat(plan)} from one end of the glass line to the other`,
  tray: 'A tape from the wall to the far edge of the tray',
  floor: (plan: Plan) => `A tape from ${onWhat(plan)} straight up to the laser’s level line, read where the line lights the blade`,
  ceiling: (plan: Plan) => `A tape from ${onWhat(plan)} straight up to the ceiling`,
  gap: (at: string) => `A tape held against the wall at the ${at}, read where the laser’s up-and-down line, stood 50mm off the wall, lights the blade`,
};

export function IsoReading({ input, visual, value, laserAt }: { input: SceneInput; visual: RunPicture; value: number | null; laserAt: Corner | null }) {
  const plan = usePlan(input);
  const r = plan.runs[visual.view.run];
  if (!r) return null;
  switch (visual.kind) {
    case 'run-width':
      return visual.laser ? <CornerWidth plan={plan} run={r} end={visual.laser} value={value} /> : <OnePull plan={plan} run={r} value={value} />;
    case 'tray-width':
      return <TrayWidth plan={plan} run={r} value={value} />;
    case 'run-floor':
      return <UpToLevel plan={plan} run={r} side={visual.side} value={value} laserAt={laserAt} />;
    case 'run-ceiling':
      return <UpToCeiling plan={plan} run={r} side={visual.side} value={value} />;
    case 'wall-gap':
      return <WallGap plan={plan} run={r} side={visual.side} at={visual.at} value={value} onFloor={plan.runs.length > 1} />;
    default:
      return null;
  }
}

/** A run measured from its far end to the laser over the corner, read where the laser's other line crosses the tape. */
function CornerWidth({ plan, run, end, value }: { plan: Plan; run: Run; end: 'left' | 'right'; value: number | null }) {
  const H = plan.base;
  const { at: corner, other: far } = endOf(run, end);
  const u = dir(far, corner);
  const out = (p: V3) => lift(add(p, run.out, MM.tapeOut), H);
  const hook = out(far);
  const read = out(corner);
  const tapeEnd = add(read, u, 300);
  const laser = laserReach(lift(corner, H));
  const m: Measured = { from: hook, to: read, off: run.out, by: 300, laser: true, value, avoid: [laser] };
  const turn = linesAt(plan, corner).find((l) => l.run !== run);
  return (
    <Stage
      plan={plan}
      label={words.corner}
      focus={readingFocus(plan, [...reachOf(m), add(tapeEnd, u, 150), lift(corner, 320)])}
      draw={(ctx) => ({
        scene: (
          <RoomWith
            ctx={ctx}
            onFloor={
              <>
                <Mask at={corner} along={neg(u)} cross={turn ? dir(corner, turn.far) : undefined} />
                <CornerLines plan={plan} corner={corner} crossing={run.out} />
              </>
            }
            things={[
              { key: 'tape', node: <Tape hook={hook} end={tapeEnd} face={v(0, 0, 1)} lit={Math.hypot(read.x - hook.x, read.y - hook.y)} />, at: along(hook, tapeEnd, 0.5), reach: [hook, tapeEnd] },
              { key: 'laser', node: <LaserBody at={lift(corner, H)} />, at: corner, reach: [lift(corner, H + 260)] },
            ]}
          />
        ),
        overlay: <MeasureMarks m={m} ctx={ctx} />,
        // Where the laser's line crosses the blade, beside the laser itself, close up.
        lens: {
          target: read,
          zoom: 2.8,
          overlay: (to) => <ReadPoint at={to(read)} laser />,
          avoid: [laser, reachOf(m)],
        },
      })}
    />
  );
}

/** A run in one pull of the tape, from the end that has a wall to hook on. */
function OnePull({ plan, run, value }: { plan: Plan; run: Run; value: number | null }) {
  const H = plan.base;
  const fromRight = run.view.right === 'wall' && run.view.left !== 'wall';
  const [first, last] = fromRight ? [endOf(run, 'right'), endOf(run, 'left')] : [endOf(run, 'left'), endOf(run, 'right')];
  const u = dir(first.at, last.at);
  const out = (p: V3) => lift(add(p, run.out, MM.tapeOut), H);
  const hook = out(first.at);
  const read = out(last.at);
  // Against a wall the case butts up to it and is read there; at a mark the blade runs on past it.
  const tapeEnd = last.kind === 'wall' ? add(read, u, -110) : add(read, u, 170);
  const m: Measured = { from: hook, to: read, off: run.out, by: 300, laser: false, value };
  return (
    <Stage
      plan={plan}
      label={words.pull(plan)}
      focus={readingFocus(plan, reachOf(m))}
      draw={(ctx) => ({
        scene: (
          <RoomWith
            ctx={ctx}
            onFloor={
              <>
                <Mask at={first.at} along={u} shift={first.kind === 'wall' ? 1 : 0} />
                <Mask at={last.at} along={neg(u)} shift={last.kind === 'wall' ? 1 : 0} stop={last.kind === 'open'} />
              </>
            }
            things={[{ key: 'tape', node: <Tape hook={hook} end={tapeEnd} face={v(0, 0, 1)} />, at: along(hook, tapeEnd, 0.5), reach: [hook, tapeEnd] }]}
          />
        ),
        overlay: <MeasureMarks m={m} ctx={ctx} />,
      })}
    />
  );
}

/** A walk-in's whole tray, from the wall to its far edge. */
function TrayWidth({ plan, run, value }: { plan: Plan; run: Run; value: number | null }) {
  const H = plan.base;
  const fromRight = run.view.right === 'wall';
  const y = plan.tray.y0 + 30;
  const [x0, x1] = fromRight ? [plan.room.x1, plan.tray.x0] : [0, plan.tray.x1];
  const hook = v(x0, y, H);
  const read = v(x1, y, H);
  const u = dir(hook, read);
  const m: Measured = { from: hook, to: read, off: v(0, -1), by: 280, laser: false, value };
  return (
    <Stage
      plan={plan}
      label={words.tray}
      focus={readingFocus(plan, reachOf(m))}
      draw={(ctx) => ({
        scene: <RoomWith ctx={ctx} things={[{ key: 'tape', node: <Tape hook={hook} end={add(read, u, 160)} face={v(0, 0, 1)} />, at: along(hook, read, 0.5), reach: [hook, read] }]} />,
        overlay: <MeasureMarks m={m} ctx={ctx} />,
      })}
    />
  );
}

/** Where the laser stands for a reading up to its level line: over the corner it was left at, else on its tripod in front of the run. */
function levelLaser(plan: Plan, run: Run, side: 'left' | 'right', laserAt: Corner | null): { at: V3; level: number; tripod: boolean } {
  const H = plan.base;
  if (laserAt && plan.runs[laserAt.run]) {
    const c = endOf(plan.runs[laserAt.run], laserAt.end).at;
    return { at: lift(c, H), level: H + MM.floorBeam, tripod: false };
  }
  // In front of the glass, near its other end, so it stands well clear of the tape.
  return { at: add(along(run.a, run.b, side === 'left' ? 0.92 : 0.08), run.out, 520), level: MM.tripodBeam, tripod: true };
}

/** The floor at one end of a run, up to the laser's level line. */
function UpToLevel({
  plan,
  run,
  side,
  value,
  laserAt,
  fixed,
}: {
  plan: Plan;
  run: Run;
  side: 'left' | 'right';
  value: number | null;
  laserAt: Corner | null;
  /** Where the laser stands, where a deck keeps it in one place. */
  fixed?: { at: V3; level: number; tripod: boolean };
}) {
  const H = plan.base;
  const end = endOf(run, side);
  const into = dir(end.at, end.other);
  // Next to a wall the tape stands a hand's width in from it.
  const foot = add(end.at, into, end.kind === 'wall' ? 70 : 0);
  const laser = fixed ?? levelLaser(plan, run, side, laserAt);
  // Where the laser stands on this very mark, the tape is hooked on the mark tight against it.
  const base = lift(add(foot, run.out, !laser.tripod && near(laser.at, end.at) ? BODY.size / 2 + MM.blade / 2 + 6 : MM.tapeOut), H);
  const read = lift(base, laser.level);
  const tapeTop = lift(base, laser.level + 300);
  const m: Measured = { from: base, to: read, off: run.out, by: 230, laser: true, value, avoid: [laserReach(laser.at, laser.tripod)] };
  // The level line along the run, a little way past each open end.
  const runOut = (p: V3) => add(p, run.out, MM.tapeOut);
  const lineA = lift(add(runOut(run.a), dir(run.b, run.a), run.view.left === 'wall' ? 0 : 200), laser.level);
  const lineB = lift(add(runOut(run.b), dir(run.a, run.b), run.view.right === 'wall' ? 0 : 200), laser.level);
  const wallEnds = (['left', 'right'] as const).filter((s) => (s === 'left' ? run.view.left : run.view.right) === 'wall').map((s) => endOf(run, s).at);
  return (
    <Stage
      plan={plan}
      label={words.floor(plan)}
      focus={readingFocus(plan, [...reachOf(m), tapeTop, laser.at, lift(laser.at, laser.level + 120)])}
      draw={(ctx) => {
        // Too short to read across the room: shown in the lens, with the number under it.
        const span = Math.hypot(ctx.at(read).x - ctx.at(base).x, ctx.at(read).y - ctx.at(base).y) / ctx.px(1);
        const small = span < 80;
        return {
        scene: (
          <RoomWith
            ctx={ctx}
            onFloor={
              <>
                <EndMask plan={plan} run={run} end={end} />
                {wallEnds.map((w, i) => (
                  <Beam key={i} a={lift(add(w, run.out, -300), laser.level)} b={lift(add(w, run.out, 420), laser.level)} />
                ))}
              </>
            }
            things={[
              { key: 'level', node: <Beam a={lineA} b={lineB} />, at: along(lineA, lineB, 0.5), reach: [lineA, lineB] },
              { key: 'tape', node: <Tape hook={base} end={tapeTop} face={run.out} lit={laser.level - H} />, at: base, reach: [tapeTop] },
              laser.tripod
                ? { key: 'laser', node: <TripodLaser at={laser.at} level={laser.level} />, at: laser.at, reach: [lift(laser.at, laser.level + 120)] }
                : { key: 'laser', node: <LaserBody at={laser.at} />, at: laser.at, reach: [lift(laser.at, laser.level + 100)] },
            ]}
          />
        ),
        overlay: small ? undefined : <MeasureMarks m={m} ctx={ctx} />,
        lens: small
          ? {
              target: along(base, read, 0.44),
              zoom: [base, read],
              overlay: (to) => (
                <g>
                  <Dimension from={base} to={read} off={m.off} by={52} project={to} />
                  <StartPoint at={to(base)} />
                  <ReadPoint at={to(read)} laser />
                </g>
              ),
              value,
              avoid: [laserReach(laser.at, laser.tripod)],
            }
          : null,
        };
      }}
    />
  );
}

/** Floor to ceiling at one end of a run. */
function UpToCeiling({ plan, run, side, value }: { plan: Plan; run: Run; side: 'left' | 'right'; value: number | null }) {
  const H = plan.base;
  const end = endOf(run, side);
  const into = dir(end.at, end.other);
  const foot = add(end.at, into, end.kind === 'wall' ? 70 : 0);
  const base = lift(add(foot, run.out, MM.tapeOut), H);
  const top = roomTop(plan);
  const read = lift(base, top);
  const m: Measured = { from: base, to: read, off: run.out, by: 230, laser: false, value };
  // A piece of the ceiling over the tape, cut back so the room still shows.
  const patch = (p: V3, s: number) => [lift(add(add(p, into, -s), run.out, -s), top), lift(add(add(p, into, s), run.out, -s), top), lift(add(add(p, into, s), run.out, s), top), lift(add(add(p, into, -s), run.out, s), top)];
  return (
    <Stage
      plan={plan}
      label={words.ceiling(plan)}
      focus={readingFocus(plan, reachOf(m))}
      draw={(ctx) => ({
        scene: (
          <RoomWith
            ctx={ctx}
            onFloor={<EndMask plan={plan} run={run} end={end} />}
            things={[
              { key: 'tape', node: <Tape hook={base} end={lift(base, top - 110)} face={run.out} />, at: base, reach: [read] },
              { key: 'ceiling', node: <Face ps={patch(base, 320)} fill="var(--iso-ceiling)" stroke="var(--iso-line)" opacity={0.95} />, at: lift(base, top), reach: [] },
            ]}
          />
        ),
        overlay: <MeasureMarks m={m} ctx={ctx} />,
      })}
    />
  );
}

/**
 * A wall to the laser's up-and-down line, stood 50mm off it: the tape held
 * against the wall, at the floor or at the top, read where the line lights
 * the blade. Fifty millimetres is too small to see across a room, so a lens
 * shows it close up.
 */
function WallGap({ plan, run, side, at: where, value, onFloor }: { plan: Plan; run: Run; side: 'left' | 'right'; at: 'bottom' | 'top'; value: number | null; onFloor: boolean }) {
  const H = plan.base;
  const end = endOf(run, side);
  const into = dir(end.at, end.other);
  const z = where === 'bottom' ? H : plan.toCeiling ? roomTop(plan) - 70 : glassTop(plan);
  const line = add(end.at, into, MM.wallGap);
  const hook = lift(add(end.at, run.out, 40), z);
  const read = lift(add(line, run.out, 40), z);
  const tapeEnd = add(read, into, 230);
  // The laser stands out in front of the glass line, in its own line's plane.
  const standAt = add(line, run.out, onFloor ? 520 : 760);
  const level = onFloor ? MM.floorBeam : MM.tripodBeam;
  const lineTop = Math.min(roomTop(plan) - 40, glassTop(plan) + 80);
  const wallLine = lineEnd(plan, line, neg(run.out));
  return (
    <Stage
      plan={plan}
      label={words.gap(where === 'bottom' ? onWhat(plan).replace('the ', '') : 'top')}
      // Close in on the end of the glass at the wall (Matt, 12 November 2026:
      // the readings close to the wall need a closer view), with the laser
      // and a little of the glass line for where it is.
      focus={focusOn([hook, read, standAt, lift(end.at, where === 'bottom' ? 700 : z + 200), lift(standAt, onFloor ? 300 : level + 120), lift(add(end.at, into, 650), H)], 150)}
      draw={(ctx) => ({
        scene: (
          <RoomWith
            ctx={ctx}
            onFloor={
              <>
                <Mask at={end.at} along={into} shift={1} />
                {/* The up-and-down line: across the floor from the laser, and up the wall it reaches. */}
                <UprightLine plan={plan} from={standAt} edge={add(line, run.out, MM.lip)} wall={wallLine} top={lineTop} />
              </>
            }
            things={[
              { key: 'upright', node: <Beam a={lift(add(line, run.out, 40), H)} b={lift(add(line, run.out, 40), lineTop)} fade faint />, at: add(line, run.out, 40), reach: [lift(line, lineTop)] },
              { key: 'tape', node: <Tape hook={hook} end={tapeEnd} face={v(0, 0, 1)} lit={MM.wallGap} />, at: along(hook, tapeEnd, 0.5), reach: [hook, tapeEnd] },
              onFloor
                ? { key: 'laser', node: <LaserBody at={standAt} />, at: standAt, reach: [lift(standAt, 280)] }
                : { key: 'laser', node: <TripodLaser at={standAt} level={level} />, at: standAt, reach: [lift(standAt, level + 120)] },
            ]}
          />
        ),
        lens: {
          target: along(hook, read, 0.5),
          zoom: [hook, read],
          fill: 1.05,
          size: 1.18,
          overlay: (to) => (
            <g>
              <Dimension from={hook} to={read} off={neg(run.out)} by={22} project={to} />
              <StartPoint at={to(hook)} />
              <ReadPoint at={to(read)} laser />
            </g>
          ),
          value,
          avoid: [laserReach(standAt, !onFloor)],
        },
      })}
    />
  );
}

// ---------------------------------------------------------------------------
// A single door, measured to the laser's cross in the middle
// ---------------------------------------------------------------------------

/**
 * Where the laser stands for a single door, all the way through its deck: on
 * its tripod in front of the shower, back from the glass line, with its
 * up-and-down line through the middle of the marks (the deck signed off on
 * 10 November 2026). No card moves it.
 */
function crossLaser(plan: Plan) {
  const run = plan.runs[0];
  const middle = along(run.a, run.b, 0.5);
  // Near enough in that, seen from the side, it stands clear of a tape at either wall.
  return { run, middle, at: add(middle, run.out, 520), level: MM.tripodBeam };
}

/** The laser's two lines for a single door: up and down through the middle of the opening, and level round the walls. */
export function IsoCrossSetup({ input }: { input: SceneInput }) {
  const plan = usePlan(input);
  const H = plan.base;
  const { run, middle, at, level } = crossLaser(plan);
  const across = dir(run.a, run.b);
  return (
    <Stage
      plan={plan}
      label="The laser on a small tripod in front of the shower, back from the glass line, its up-and-down line through the middle of the two marks and its level line round the walls"
      focus={(cam) => grow(boxOf([v(plan.room.x0, -MM.apron), v(plan.room.x1, plan.back, roomTop(plan)), v(plan.room.x0, plan.back, roomTop(plan)), v(plan.room.x1, -MM.apron), add(at, run.out, 420), lift(at, level + 200)].map(cam.at)), 60)}
      draw={(ctx) => ({
        scene: (
          <RoomWith
            ctx={ctx}
            onFloor={
              <>
                <EndMask plan={plan} run={run} end={endOf(run, 'left')} />
                <EndMask plan={plan} run={run} end={endOf(run, 'right')} />
                <UprightLine plan={plan} from={at} edge={add(middle, run.out, MM.lip)} wall={{ at: v(middle.x, plan.back), wall: true }} top={Math.min(roomTop(plan) - 80, 2000)} />
                <LevelLines plan={plan} level={level} />
              </>
            }
            things={[{ key: 'tripod', node: <TripodLaser at={at} level={level} />, at, reach: [lift(at, level + 120)] }]}
          />
        ),
        overlay: <Note at={ctx.at(lift(add(add(middle, run.out, 300), across, 520), H))} to={ctx.at(lift(add(middle, run.out, MM.tapeOut), H))} text="Through the middle of your marks" />,
      })}
    />
  );
}

/** One of the eight readings to the laser's cross, by its number on the card. */
export function IsoCross({ input, point, value }: { input: SceneInput; point: number; value: number | null }) {
  const plan = usePlan(input);
  const { run, at, level } = crossLaser(plan);
  if (point <= 4) return <CrossWall plan={plan} side={point <= 2 ? 'left' : 'right'} at={point % 2 === 1 ? 'bottom' : 'top'} value={value} />;
  const side = point % 2 === 1 ? 'left' : 'right';
  if (point <= 6) return <UpToLevel plan={plan} run={run} side={side} value={value} laserAt={null} fixed={{ at, level, tripod: true }} />;
  return <DownToLevel plan={plan} side={side} value={value} />;
}

/**
 * A wall to the laser's up-and-down line in the middle of the opening: the
 * tape hooked on the wall along the floor at the mark, or held at the top
 * (level with the mark on the wall, or along the ceiling where the door goes
 * up to it), read where the line lights the blade.
 */
function CrossWall({ plan, side, at: where, value }: { plan: Plan; side: 'left' | 'right'; at: 'bottom' | 'top'; value: number | null }) {
  const H = plan.base;
  const { run, middle, at: laser, level } = crossLaser(plan);
  const end = endOf(run, side);
  const into = dir(end.at, end.other);
  const roof = roomTop(plan);
  const z = where === 'bottom' ? H : plan.toCeiling ? roof - 25 : glassTop(plan);
  const out = (p: V3) => lift(add(p, run.out, MM.tapeOut), z);
  const hook = out(end.at);
  const read = out(middle);
  const tapeEnd = add(read, into, 260);
  const tripod = laserReach(laser, true);
  const m: Measured = { from: hook, to: read, off: run.out, by: 300, laser: true, value, avoid: [tripod] };
  // The line in the air where it crosses a tape held at the top.
  const lineTop = Math.min(roof - 40, Math.max(glassTop(plan) + 80, z + 60));
  // A piece of the ceiling over a tape held along it, cut back so the room still shows.
  const s = 380;
  const patch = [lift(add(add(end.at, run.out, -s), into, -40), roof), lift(add(add(end.at, run.out, s), into, -40), roof), lift(add(add(middle, run.out, s), into, s), roof), lift(add(add(middle, run.out, -s), into, s), roof)];
  const onCeiling = where === 'top' && plan.toCeiling;
  return (
    <Stage
      plan={plan}
      label={`A tape from the ${side} wall ${where === 'bottom' ? `along ${onWhat(plan)}` : onCeiling ? 'along the ceiling' : 'at the top of the glass'} to the laser’s up-and-down line in the middle of the opening, read where the line lights the blade`}
      focus={readingFocus(plan, [...reachOf(m), add(tapeEnd, into, 120), laser, lift(laser, level + 120), ...(where === 'top' ? [lift(hook, z + 160)] : [])])}
      draw={(ctx) => ({
        scene: (
          <RoomWith
            ctx={ctx}
            onFloor={
              <>
                <EndMask plan={plan} run={run} end={endOf(run, 'left')} />
                <EndMask plan={plan} run={run} end={endOf(run, 'right')} />
                <UprightLine plan={plan} from={laser} edge={add(middle, run.out, MM.lip)} wall={{ at: v(middle.x, plan.back), wall: true }} top={Math.min(roof - 40, 2000)} />
                {where === 'top' && !plan.toCeiling && <WallMask at={lift(add(add(end.at, run.out, 110), into, 2), glassTop(plan))} face={into} along={run.out} />}
              </>
            }
            things={[
              ...(onCeiling
                ? [
                    {
                      key: 'ceiling',
                      node: (
                        <g>
                          <Face ps={patch} fill="var(--iso-ceiling)" stroke="var(--iso-line)" opacity={0.95} />
                          <Beam a={lift(add(middle, run.out, s), roof - 1)} b={lift(add(middle, run.out, -s), roof - 1)} />
                        </g>
                      ),
                      at: lift(add(end.at, run.out, -s), roof),
                      reach: [],
                    },
                  ]
                : []),
              ...(where === 'top'
                ? [{ key: 'upright', node: <Beam a={lift(read, H)} b={lift(read, lineTop)} fade faint />, at: read, reach: [lift(read, lineTop)] }]
                : []),
              { key: 'tape', node: <Tape hook={hook} end={tapeEnd} face={v(0, 0, 1)} lit={Math.hypot(read.x - hook.x, read.y - hook.y)} />, at: along(hook, tapeEnd, 0.5), reach: [hook, tapeEnd] },
              { key: 'tripod', node: <TripodLaser at={laser} level={level} />, at: laser, reach: [lift(laser, level + 120)] },
            ]}
          />
        ),
        overlay: <MeasureMarks m={m} ctx={ctx} />,
      })}
    />
  );
}

/** The ceiling next to a wall, down to the laser's level line, for a single door that goes up to it. */
function DownToLevel({ plan, side, value }: { plan: Plan; side: 'left' | 'right'; value: number | null }) {
  const { run, at: laser, level } = crossLaser(plan);
  const end = endOf(run, side);
  const into = dir(end.at, end.other);
  const roof = roomTop(plan);
  const foot = add(end.at, into, 70);
  const hook = lift(add(foot, run.out, MM.tapeOut), roof);
  const read = lift(hook, level);
  const tapeEnd = lift(hook, level - 300);
  const tripod = laserReach(laser, true);
  const m: Measured = { from: hook, to: read, off: run.out, by: 230, laser: true, value, avoid: [tripod] };
  const runOut = (p: V3) => add(p, run.out, MM.tapeOut);
  const lineA = lift(runOut(run.a), level);
  const lineB = lift(runOut(run.b), level);
  const s = 320;
  const patch = [lift(add(add(foot, into, -s), run.out, -s), roof), lift(add(add(foot, into, s), run.out, -s), roof), lift(add(add(foot, into, s), run.out, s), roof), lift(add(add(foot, into, -s), run.out, s), roof)];
  return (
    <Stage
      plan={plan}
      label="A tape held against the ceiling next to the wall, read down where the laser’s level line lights the blade"
      focus={readingFocus(plan, [...reachOf(m), tapeEnd, laser, lift(laser, level + 120), lift(hook, roof + 80)])}
      draw={(ctx) => ({
        scene: (
          <RoomWith
            ctx={ctx}
            onFloor={
              <>
                <EndMask plan={plan} run={run} end={endOf(run, 'left')} />
                <EndMask plan={plan} run={run} end={endOf(run, 'right')} />
                <LevelLines plan={plan} level={level} />
              </>
            }
            things={[
              { key: 'level', node: <Beam a={lineA} b={lineB} />, at: along(lineA, lineB, 0.5), reach: [lineA, lineB] },
              { key: 'ceiling', node: <Face ps={patch} fill="var(--iso-ceiling)" stroke="var(--iso-line)" opacity={0.95} />, at: hook, reach: [] },
              { key: 'tape', node: <Tape hook={hook} end={tapeEnd} face={run.out} lit={roof - level} />, at: lift(hook, level), reach: [hook, tapeEnd] },
              { key: 'tripod', node: <TripodLaser at={laser} level={level} />, at: laser, reach: [lift(laser, level + 120)] },
            ]}
          />
        ),
        overlay: <MeasureMarks m={m} ctx={ctx} />,
      })}
    />
  );
}

// ---------------------------------------------------------------------------
// How tall is the glass?
// ---------------------------------------------------------------------------

export function IsoHeight({ input, value, what }: { input: SceneInput; value: number | null; what: 'glass' | 'screen' }) {
  const plan = usePlan(input);
  const H = plan.base;
  // The mark goes on a wall: the first end of the glass that meets one.
  const run = plan.runs.find((x) => x.view.left === 'wall') ?? plan.runs.find((x) => x.view.right === 'wall') ?? plan.runs[0];
  const end = endOf(run, run.view.left === 'wall' ? 'left' : 'right');
  const into = dir(end.at, end.other);
  const top = glassTop(plan);
  // The tape on the wall beside the glass line, and the tape measure stood up beside it.
  const markAt = lift(add(add(end.at, run.out, 110), into, 2), top);
  const base = lift(add(add(end.at, into, 45), run.out, 110), H);
  const read = lift(base, top);
  const m: Measured = { from: base, to: read, off: run.out, by: 220, laser: false, value };
  return (
    <Stage
      plan={plan}
      label={`A marker line on tape stuck to the wall at the height of the ${what}, and a tape measure from ${onWhat(plan)} up to it`}
      focus={readingFocus(plan, [...reachOf(m), lift(base, top + 260)])}
      draw={(ctx) => ({
        scene: (
          <RoomWith
            ctx={ctx}
            onFloor={<WallMask at={markAt} face={into} along={run.out} />}
            things={[{ key: 'tape', node: <Tape hook={base} end={lift(base, top + 140)} face={into} />, at: base, reach: [lift(base, top + 260)] }]}
          />
        ),
        overlay: (
          <g>
            <MeasureMarks m={m} ctx={ctx} />
            <Note at={ctx.at(lift(add(markAt, run.out, -520), top + 260))} to={ctx.at(markAt)} text={`Top of the ${what}`} />
          </g>
        ),
      })}
    />
  );
}
