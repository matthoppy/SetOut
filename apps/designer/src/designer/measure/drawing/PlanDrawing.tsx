/**
 * The shower from above, to scale, for a layout whose glass turns a corner:
 * each run of glass, the walls it ends on, and how long each run came out.
 * It is the key to the drawings of each run that follow it.
 */

import { runNames, runViews, type ConfiguratorState, type DeckOptions } from '@setout/engine';
import { ACCENT, FONT, INK, W } from './parts';

const MAX_DEEP = 150;
const SIDE = 74;
const WALL = 'hsl(var(--muted-foreground) / 0.45)';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function PlanDrawing({ state, options, className }: { state: ConfiguratorState; options: DeckOptions; className?: string }) {
  const views = runViews(state, options);
  const names = runNames(state);
  const widths = state.opening.runs.map((r) => r.widthAtFloorMm);

  // Each run in millimetres, front nearest: the front runs left to right, a
  // side runs back from it to the back wall or to where it stops.
  const front = views.find((v) => v.faces === 'front');
  const frontW = front ? widths[front.run] : 0;
  const lines = views.map((v) => {
    const w = widths[v.run];
    if (v.faces === 'left') return { v, x1: 0, y1: -w, x2: 0, y2: 0 };
    if (v.faces === 'right') return { v, x1: frontW, y1: 0, x2: frontW, y2: -w };
    return { v, x1: 0, y1: 0, x2: frontW, y2: 0 };
  });
  const xs = lines.flatMap((l) => [l.x1, l.x2]);
  const ys = lines.flatMap((l) => [l.y1, l.y2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const s = Math.min((W - SIDE * 2) / Math.max(maxX - minX, 1), MAX_DEEP / Math.max(maxY - minY, 1));
  const top = 22;
  const H = top + (maxY - minY) * s + 34;
  const px = (x: number) => W / 2 + (x - (minX + maxX) / 2) * s;
  const py = (y: number) => top + (y - minY) * s;
  const reach = 22;

  // Two sides that run back to a wall end on the same wall, give or take what
  // the room is out by. It is drawn as one wall, not as two ends of one.
  const backs = lines.filter((l) => l.x1 === l.x2 && (l.v.faces === 'left' ? l.v.left : l.v.right) === 'wall');
  const backAt = (l: (typeof lines)[number]) => (l.v.faces === 'left' ? { x: l.x1, y: l.y1 } : { x: l.x2, y: l.y2 });
  const oneBack = backs.length === 2 && Math.abs(backAt(backs[0]).y - backAt(backs[1]).y) <= 150;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Your shower from above, with the length of each run of glass">
      {oneBack && (
        <line
          x1={px(backAt(backs[0]).x) - reach}
          y1={py(backAt(backs[0]).y)}
          x2={px(backAt(backs[1]).x) + reach}
          y2={py(backAt(backs[1]).y)}
          stroke={WALL}
          strokeWidth={5}
          strokeLinecap="square"
        />
      )}
      {/* A wall stands square across the end of the glass that meets it. */}
      {lines.flatMap((l) =>
        (
          [
            [l.v.left, l.x1, l.y1],
            [l.v.right, l.x2, l.y2],
          ] as const
        )
          .filter(([kind]) => kind === 'wall')
          .filter(() => !(oneBack && l.x1 === l.x2))
          .map(([, x, y], k) =>
            l.x1 === l.x2 ? (
              <line key={`${l.v.run}${k}`} x1={px(x) - reach} y1={py(y)} x2={px(x) + reach} y2={py(y)} stroke={WALL} strokeWidth={5} strokeLinecap="square" />
            ) : (
              <line key={`${l.v.run}${k}`} x1={px(x)} y1={py(y) - reach * 1.6} x2={px(x)} y2={py(y) + 8} stroke={WALL} strokeWidth={5} strokeLinecap="square" />
            )
          )
      )}
      {lines.map((l) => (
        <line key={l.v.run} x1={px(l.x1)} y1={py(l.y1)} x2={px(l.x2)} y2={py(l.y2)} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
      ))}
      {lines.map((l) => {
        const name = cap((names[l.v.run] ?? '').replace(/^the /, ''));
        const size = `${widths[l.v.run]}mm`;
        const mx = (px(l.x1) + px(l.x2)) / 2;
        const my = (py(l.y1) + py(l.y2)) / 2;
        const upright = l.x1 === l.x2;
        // A side is named beside it, on the outside. The front is named under it.
        const x = upright ? (l.v.faces === 'left' ? mx - 10 : mx + 10) : mx;
        const anchor = upright ? (l.v.faces === 'left' ? 'end' : 'start') : 'middle';
        return (
          <g key={`t${l.v.run}`} fontFamily={FONT} textAnchor={anchor}>
            <text x={x} y={upright ? my - 2 : my + 15} fontSize={10} fontWeight={600} fill={ACCENT}>
              {name}
            </text>
            <text x={x} y={upright ? my + 11 : my + 28} fontSize={12} fontWeight={700} fill={INK}>
              {size}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
