/**
 * The frame every measuring picture is drawn in.
 *
 * It fills the space the card gives the picture and decides how much of the
 * room to show in it: the whole room on a tall phone, and on a short screen
 * as much as fits around what the card is about, at the same angle, so a
 * reading is never too small to see. Lines and words are sized on the screen,
 * not in the room, so every picture has the same weight of line and size of
 * type however much of the room it shows.
 */

import { createContext, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Note, Value } from './Kit';
import { cameraFor, frameFor, sceneBox, type Box, type Camera, type P, type Plan, type V3 } from './space';

export interface Ctx {
  plan: Plan;
  cam: Camera;
  at: (p: V3) => P;
  /** A length of n screen pixels, in the picture's units. */
  px: (n: number) => number;
  /** An id that is this picture's own, for gradients and the like. */
  id: (name: string) => string;
  /** The part of the page on show. */
  view: Box;
}

const IsoContext = createContext<Ctx | null>(null);

/**
 * Whether the glass is drawn. The lens shows its close-up as a cutaway,
 * without the glass, so a reading taken behind a pane is as clear as one in
 * front of it.
 */
export const GlassShown = createContext(true);

export function useIso(): Ctx {
  const ctx = useContext(IsoContext);
  if (!ctx) throw new Error('useIso outside a Stage');
  return ctx;
}

/** A magnified circle on the picture, showing a small reading big. */
export interface LensSpec {
  /** The point in the room it looks at. */
  target: V3;
  /** How many times bigger: a number, or the two points that must both fit inside the lens. */
  zoom: number | [V3, V3];
  /** What is drawn on top of the magnified room, given where a room point lands in the lens, and the lens. */
  overlay?: (to: (p: V3) => P, lens: { c: P; r: number }) => ReactNode;
  /** A few words under the lens. */
  caption?: string;
  /** The number read in the lens, shown just under it, where there is always room. */
  value?: number | null;
  /** Things the lens must not cover, as points they reach in the room. */
  avoid?: V3[][];
}

export interface Drawn {
  /** The room and everything standing in it. */
  scene: ReactNode;
  /** Drawn over the room at a fixed size on the screen: measurements, points and labels. */
  overlay?: ReactNode;
  lens?: LensSpec | null;
}

/** How close a picture may come in, in screen pixels to the millimetre. */
const MAX_SCALE = 0.27;

export function Stage({ plan, label, focus, draw }: { plan: Plan; label: string; focus: (cam: Camera) => Box | null; draw: (ctx: Ctx) => Drawn }) {
  const holder = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState({ w: 350, h: 460 });
  useLayoutEffect(() => {
    const el = holder.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      setSpace((s) => (Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: r.width, h: r.height }));
    };
    read();
    const watch = new ResizeObserver(read);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const cam = useMemo(() => cameraFor(plan), [plan]);
  const scene = useMemo(() => sceneBox(plan, cam), [plan, cam]);
  const view = frameFor(scene, focus(cam), space, MAX_SCALE);
  const scale = space.w / view.w;
  const ctx: Ctx = { plan, cam, at: cam.at, px: (n) => n / scale, id: (name) => `iso${raw}-${name}`, view };
  const drawn = draw(ctx);
  const sceneId = ctx.id('scene');

  return (
    <div ref={holder} className="relative h-full w-full">
      <svg
        className="mw-iso absolute inset-0 h-full w-full"
        viewBox={`${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={label}
      >
        <IsoContext.Provider value={ctx}>
          <Materials />
          <defs>
            <filter id={ctx.id('edgeblur')} x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation={ctx.px(9)} />
            </filter>
            <mask id={ctx.id('edge')} maskUnits="userSpaceOnUse" x={view.x} y={view.y} width={view.w} height={view.h}>
              <rect x={view.x + ctx.px(14)} y={view.y + ctx.px(14)} width={Math.max(0, view.w - ctx.px(28))} height={Math.max(0, view.h - ctx.px(28))} fill="#fff" filter={`url(#${ctx.id('edgeblur')})`} />
            </mask>
          </defs>
          {/* A soft studio ground behind the room, very light grey, that fades into the card. */}
          <radialGradient id={ctx.id('ground')} gradientUnits="userSpaceOnUse" cx={view.x + view.w / 2} cy={view.y + view.h * 0.55} r={Math.max(view.w, view.h) * 0.62}>
            <stop offset="0" stopColor="var(--iso-backdrop)" />
            <stop offset="0.72" stopColor="var(--iso-backdrop)" stopOpacity={0.85} />
            <stop offset="1" stopColor="var(--iso-backdrop)" stopOpacity={0} />
          </radialGradient>
          <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={`url(#${ctx.id('ground')})`} />
          {/* On a dark page the room sits on a clean light panel of its own instead. */}
          <rect className="mw-iso-panel" x={view.x} y={view.y} width={view.w} height={view.h} rx={ctx.px(14)} fill="var(--iso-backdrop)" />
          <g mask={`url(#${ctx.id('edge')})`}>
            <g id={sceneId}>{drawn.scene}</g>
          </g>
          {drawn.lens && (
            <defs>
              <GlassShown.Provider value={false}>
                <g id={ctx.id('cutaway')}>{drawn.scene}</g>
              </GlassShown.Provider>
            </defs>
          )}
          {drawn.lens && <Lens spec={drawn.lens} sceneId={ctx.id('cutaway')} />}
          {drawn.overlay}
        </IsoContext.Provider>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Materials: the shared gradients and the soft shadow
// ---------------------------------------------------------------------------

function Materials() {
  const { id, px } = useIso();
  return (
    <defs>
      <filter id={id('soft')} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={34} />
      </filter>
      <filter id={id('softer')} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={12} />
      </filter>
      <filter id={id('lift')} x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx={0} dy={px(1.5)} stdDeviation={px(2.2)} floodColor="#0f172a" floodOpacity={0.22} />
      </filter>
      <linearGradient id={id('glass')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="var(--iso-glass)" stopOpacity={0.5} />
        <stop offset="1" stopColor="var(--iso-glass)" stopOpacity={0.36} />
      </linearGradient>
      <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity={0} />
        <stop offset="0.5" stopColor="#fff" stopOpacity={0.75} />
        <stop offset="1" stopColor="#fff" stopOpacity={0} />
      </linearGradient>
      <radialGradient id={id('pool')} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="var(--iso-laser)" stopOpacity={0.35} />
        <stop offset="1" stopColor="var(--iso-laser)" stopOpacity={0} />
      </radialGradient>
    </defs>
  );
}

// ---------------------------------------------------------------------------
// The lens
// ---------------------------------------------------------------------------

function Lens({ spec, sceneId }: { spec: LensSpec; sceneId: string }) {
  const { at, px, view, id } = useIso();
  // Two points a lens must hold: magnified until they span most of it, and no more.
  const fitZoom = ([a, b]: [V3, V3], r: number) => {
    const [p, q] = [at(a), at(b)];
    return Math.min(7, Math.max(2, (r * 1.35) / (Math.hypot(q.x - p.x, q.y - p.y) || 1)));
  };
  const t = at(spec.target);
  const r = Math.min(view.w * 0.25, view.h * 0.21);
  const m = px(14);
  // The lens goes in a corner of the picture: one that keeps clear of the
  // point it magnifies, so the leader always shows where it looks, and of
  // anything named to keep clear of. The top corners first, the far side first.
  const keep = (spec.avoid ?? []).map((ps) => {
    const qs = ps.map(at);
    const xs = qs.map((q) => q.x);
    const ys = qs.map((q) => q.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
  const below = spec.value !== undefined || spec.caption ? px(46) : 0;
  const far = t.x > view.x + view.w / 2;
  const xs = far ? [view.x + r + m, view.x + view.w - r - m] : [view.x + view.w - r - m, view.x + r + m];
  const ys = [view.y + r + m, view.y + view.h - r - m - below];
  const corners: P[] = [{ x: xs[0], y: ys[0] }, { x: xs[1], y: ys[0] }, { x: xs[0], y: ys[1] }, { x: xs[1], y: ys[1] }];
  const clear = (c: P) =>
    Math.hypot(t.x - c.x, t.y - c.y) > r + px(34) &&
    keep.every((b) => {
      const nx = Math.min(Math.max(c.x, b.x0), b.x1);
      const ny = Math.min(Math.max(c.y, b.y0), b.y1);
      return Math.hypot(c.x - nx, c.y - ny) > r + px(4);
    });
  const c = corners.find(clear) ?? [...corners].sort((a, b) => Math.hypot(b.x - t.x, b.y - t.y) - Math.hypot(a.x - t.x, a.y - t.y))[0];
  const zoom = typeof spec.zoom === 'number' ? spec.zoom : fitZoom(spec.zoom, r);
  const to = (p: V3): P => {
    const q = at(p);
    return { x: c.x + (q.x - t.x) * zoom, y: c.y + (q.y - t.y) * zoom };
  };
  const clip = id('lens');
  // The leader runs from the edge of the lens to a ring round the point it magnifies.
  const dx = t.x - c.x;
  const dy = t.y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  const ring = px(13);
  return (
    <g>
      <clipPath id={clip}>
        <circle cx={c.x} cy={c.y} r={r} />
      </clipPath>
      <line x1={c.x + (dx / d) * r} y1={c.y + (dy / d) * r} x2={t.x - (dx / d) * ring} y2={t.y - (dy / d) * ring} stroke="var(--iso-paper)" strokeWidth={4} />
      <line x1={c.x + (dx / d) * r} y1={c.y + (dy / d) * r} x2={t.x - (dx / d) * ring} y2={t.y - (dy / d) * ring} stroke="var(--iso-ink)" strokeWidth={1.4} />
      <circle cx={t.x} cy={t.y} r={ring} fill="none" stroke="var(--iso-paper)" strokeWidth={4} />
      <circle cx={t.x} cy={t.y} r={ring} fill="none" stroke="var(--iso-ink)" strokeWidth={1.6} />
      <circle cx={c.x} cy={c.y} r={r} fill="var(--iso-paper)" filter={`url(#${id('lift')})`} />
      <g clipPath={`url(#${clip})`}>
        <use href={`#${sceneId}`} transform={`translate(${c.x} ${c.y}) scale(${zoom}) translate(${-t.x} ${-t.y})`} />
        {spec.overlay?.(to, { c, r })}
      </g>
      <circle cx={c.x} cy={c.y} r={r} fill="none" stroke="var(--iso-ink)" strokeWidth={1.6} />
      {spec.value !== undefined && <Value at={{ x: c.x, y: c.y + r + px(22) }} value={spec.value} />}
      {spec.caption && <Note at={{ x: c.x, y: c.y + r + px(20) }} text={spec.caption} />}
    </g>
  );
}
