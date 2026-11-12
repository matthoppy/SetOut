/**
 * One pane, drawn for the toughener the way Matt's own glass orders are: to
 * scale, every edge dimensioned and marked FP, each hinge notch, handle hole
 * and corner notch on its stated edge, a letter for its template, where the
 * toughening stamp goes, and on a pane cut to shape a small square in each
 * corner that is still square.
 *
 * Measured as the orders measure them: a hinge notch from the nearer end of
 * its edge to the notch's near edge; a hole from the bottom to its centre,
 * and a pull handle's second hole from the first.
 *
 * Drawn as seen from outside the shower. Nothing on it is worked out here:
 * every size and position comes from the engine's panes.
 */

import type { Pane, PaneFeature, PaneNotch } from '@setout/engine';

type Cut = Exclude<PaneFeature, { kind: 'corner' }>;

/**
 * A letter for each template, in the order they first appear on the panes
 * given: A, B, C. The same letter on every pane drawn and on the templates
 * page, as on the orders.
 */
export function lettersFor(panes: Pane[]): Map<string, string> {
  const letters = new Map<string, string>();
  for (const pane of panes) {
    for (const f of pane.features) {
      if (f.kind !== 'corner' && !letters.has(f.template)) letters.set(f.template, String.fromCharCode(65 + (letters.size % 26)));
    }
  }
  return letters;
}

/**
 * A notch's outline in mm, as its template draws it: x into the glass from
 * its edge, y along the edge from the notch's centre, from the top of its
 * mouth round to the bottom. A notch with ears follows each relief hole
 * round the outside, where it stands proud of the square.
 */
export function notchOutline(f: Pick<PaneNotch, 'depthMm' | 'heightMm' | 'radiusMm' | 'ears' | 'rebate'>): { x: number; y: number }[] {
  const D = f.depthMm;
  const top = f.heightMm / 2;
  const arc = (cx: number, cy: number, r: number, from: number, to: number) =>
    Array.from({ length: 13 }, (_, k) => {
      const a = from + ((to - from) * k) / 12;
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    });
  if (f.rebate) {
    // A shallow rebate along the edge, its inner corners rounded, with the
    // notch set in it, its own inner corners rounded too.
    const d = f.rebate.depthMm;
    const t = f.rebate.heightMm / 2;
    const rr = Math.min(f.radiusMm, d);
    const r = Math.min(f.radiusMm, D - d, top);
    const upper = [
      ...arc(d - rr, t - rr, rr, Math.PI / 2, 0),
      { x: d, y: top },
      ...arc(D - r, top - r, r, Math.PI / 2, 0),
    ];
    const lower = upper.map((p) => ({ x: p.x, y: -p.y })).reverse();
    return [{ x: 0, y: t }, ...upper, ...lower, { x: 0, y: -t }];
  }
  if (f.ears) {
    const r = f.ears.diameterMm / 2;
    const I = f.ears.inMm;
    const cy = f.ears.apartMm / 2;
    const reachesTop = Math.abs(top - cy) < r;
    const reachesBack = Math.abs(D - I) < r;
    if (reachesTop && reachesBack) {
      // Where each ear meets the notch's top edge and its back edge.
      const a1 = Math.atan2(top - cy, -Math.sqrt(r * r - (top - cy) ** 2));
      const a2 = Math.atan2(-Math.sqrt(r * r - (D - I) ** 2), D - I);
      const upper = arc(I, cy, r, a1, a2 < a1 ? a2 : a2 - 2 * Math.PI);
      const lower = upper.map((p) => ({ x: p.x, y: -p.y })).reverse();
      return [{ x: 0, y: top }, ...upper, ...lower, { x: 0, y: -top }];
    }
  }
  const r = Math.min(f.radiusMm, D, top);
  return [
    { x: 0, y: top },
    ...arc(D - r, top - r, r, Math.PI / 2, 0),
    ...arc(D - r, -top + r, r, 0, -Math.PI / 2),
    { x: 0, y: -top },
  ];
}

const BOX = { width: 640, height: 820 };
const MARGIN = { left: 90, right: 90, top: 70, bottom: 90 };
const INK = '#111';
const DIM = '#333';

export function PaneDrawing({ pane, letters = lettersFor([pane]), edgework = 'FP' }: { pane: Pane; letters?: Map<string, string>; edgework?: string }) {
  const availW = BOX.width - MARGIN.left - MARGIN.right;
  const availH = BOX.height - MARGIN.top - MARGIN.bottom;
  const scale = Math.min(availW / pane.widthMm, availH / pane.heightMm);
  const w = pane.widthMm * scale;
  const h = pane.heightMm * scale;
  const x0 = MARGIN.left + (availW - w) / 2;
  const y0 = MARGIN.top + (availH - h) / 2;
  /** A point on the pane, in mm from its rectangle's bottom-left, on the drawing. */
  const at = (p: { x: number; y: number }) => ({ X: x0 + p.x * scale, Y: y0 + h - p.y * scale });
  const { bottomLeft: bl, bottomRight: br, topRight: tr, topLeft: tl } = pane.outline;
  const corners = [bl, br, tr, tl].map(at);
  const polygon = corners.map((c) => `${c.X},${c.Y}`).join(' ');
  const edge = (side: 'left' | 'right') => (side === 'left' ? { bottom: bl, top: tl } : { bottom: br, top: tr });

  return (
    <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} className="mx-auto block h-auto w-full max-w-[640px]" role="img" aria-label={`${pane.label}, ${pane.widthMm} by ${pane.heightMm}mm${pane.shaped ? ', cut to shape' : ''}`}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 1 L9 5 L0 9" fill="none" stroke={DIM} strokeWidth="1.2" />
        </marker>
      </defs>

      {/* The rectangle it is cut from, when it is cut to a shape inside it. */}
      {pane.shaped && <rect x={x0} y={y0} width={w} height={h} fill="none" stroke={DIM} strokeWidth="1" strokeDasharray="6 5" />}
      {/* The pane. */}
      <polygon points={polygon} fill="#fff" stroke={INK} strokeWidth="1.6" />

      {/* Each edge's length: across the top and bottom, up each side. */}
      <Dimension x1={at(tl).X} y1={y0 - 34} x2={at(tr).X} y2={y0 - 34} label={tr.x - tl.x} />
      <Dimension x1={at(bl).X} y1={y0 + h + 44} x2={at(br).X} y2={y0 + h + 44} label={br.x - bl.x} />
      <Dimension x1={x0 - 54} y1={at(bl).Y} x2={x0 - 54} y2={at(tl).Y} label={tl.y - bl.y} vertical />
      <Dimension x1={x0 + w + 54} y1={at(br).Y} x2={x0 + w + 54} y2={at(tr).Y} label={tr.y - br.y} vertical />

      {/* How far each corner is off its rectangle. */}
      {pane.shaped && <Offsets pane={pane} at={at} />}

      {/* Edgework, on every edge. */}
      <EdgeLabel x={(at(tl).X + at(tr).X) / 2} y={(at(tl).Y + at(tr).Y) / 2 + 16} text={edgework} />
      <EdgeLabel x={(at(bl).X + at(br).X) / 2} y={(at(bl).Y + at(br).Y) / 2 - 8} text={edgework} />
      {/* A third of the way down each side: clear of the hinges near the ends and a handle in the middle. */}
      <EdgeLabel x={at(tl).X + (at(bl).X - at(tl).X) * 0.35 + 18} y={at(tl).Y + (at(bl).Y - at(tl).Y) * 0.35} text={edgework} />
      <EdgeLabel x={at(tr).X + (at(br).X - at(tr).X) * 0.35 - 18} y={at(tr).Y + (at(br).Y - at(tr).Y) * 0.35} text={edgework} />

      {/* A small square in each corner that is still square, on a pane cut to shape. */}
      {pane.shaped && <SquareCorners pane={pane} at={at} />}

      {pane.features.map((f, i) => (
        <Feature key={i} feature={f} letter={f.kind === 'corner' ? '' : (letters.get(f.template) ?? '?')} from={partner(pane, f)} scale={scale} at={at} edge={edge} x0={x0} w={w} />
      ))}

      {/* The toughening stamp. */}
      <Stamp stamp={pane.stamp} at={at(pane.stamp.corner === 'bottom-left' ? bl : br)} scale={scale} y0={y0} h={h} />
    </svg>
  );
}

/**
 * The second hole of a pair is measured from the first, as the orders do: a
 * pull handle's upper hole from its lower one, and a hinge's farther hole
 * from the one nearer its end. Answers the first hole's centre, or null.
 */
export function partner(pane: Pane, f: PaneFeature): number | null {
  if (f.kind !== 'hole' || f.apartMm === null) return null;
  const apart = f.apartMm;
  const other = pane.features.find(
    (g) => g !== f && g.kind === 'hole' && g.template === f.template && g.side === f.side && Math.abs(Math.abs(g.centreMm - f.centreMm) - apart) < 0.5
  );
  if (!other || other.kind !== 'hole') return null;
  if (f.role === 'handle') return other.centreMm < f.centreMm ? other.centreMm : null;
  const { bottomLeft, bottomRight, topLeft, topRight } = pane.outline;
  const length = f.side === 'left' ? topLeft.y - bottomLeft.y : topRight.y - bottomRight.y;
  const fromEnd = (c: number) => Math.min(c, length - c);
  return fromEnd(other.centreMm) < fromEnd(f.centreMm) ? other.centreMm : null;
}

/** The corners of a shape whose two edges meet square, each marked with a small square. */
function SquareCorners({ pane, at }: { pane: Pane; at: At }) {
  const { bottomLeft: bl, bottomRight: br, topRight: tr, topLeft: tl } = pane.outline;
  const ring = [bl, br, tr, tl];
  const marks: string[] = [];
  ring.forEach((c, i) => {
    const a = ring[(i + 1) % 4];
    const b = ring[(i + 3) % 4];
    const square = (a.x - c.x) * (b.x - c.x) + (a.y - c.y) * (b.y - c.y) === 0;
    if (!square) return;
    const C = at(c);
    const unit = (p: { x: number; y: number }) => {
      const P = at(p);
      const len = Math.hypot(P.X - C.X, P.Y - C.Y) || 1;
      return { X: ((P.X - C.X) / len) * 9, Y: ((P.Y - C.Y) / len) * 9 };
    };
    const u = unit(a);
    const v = unit(b);
    marks.push([C, { X: C.X + u.X, Y: C.Y + u.Y }, { X: C.X + u.X + v.X, Y: C.Y + u.Y + v.Y }, { X: C.X + v.X, Y: C.Y + v.Y }].map((p) => `${p.X},${p.Y}`).join(' '));
  });
  return (
    <g>
      {marks.map((points) => (
        <polygon key={points} points={points} fill="none" stroke={INK} strokeWidth="1" />
      ))}
    </g>
  );
}

/** Small numbers at each corner that is off the rectangle: how far in, and how far down or up. */
function Offsets({ pane, at }: { pane: Pane; at: (p: { x: number; y: number }) => { X: number; Y: number } }) {
  const { bottomLeft: bl, bottomRight: br, topRight: tr, topLeft: tl } = pane.outline;
  const W = pane.widthMm;
  const H = pane.heightMm;
  const labels: { X: number; Y: number; text: number; anchor: 'start' | 'end' | 'middle' }[] = [];
  const add = (p: { x: number; y: number }, dx: number, dy: number, right: boolean, top: boolean) => {
    const c = at(p);
    if (dx) labels.push({ X: c.X + (right ? 6 : -6), Y: c.Y + (top ? -6 : 14), text: dx, anchor: right ? 'start' : 'end' });
    if (dy) labels.push({ X: c.X + (right ? -8 : 8), Y: c.Y + (top ? 14 : -6), text: dy, anchor: right ? 'end' : 'start' });
  };
  add(tl, tl.x, H - tl.y, false, true);
  add(tr, W - tr.x, H - tr.y, true, true);
  add(bl, bl.x, bl.y, false, false);
  add(br, W - br.x, br.y, true, false);
  return (
    <g>
      {labels.map((l, i) => (
        <text key={i} x={l.X} y={l.Y} fontSize="11" textAnchor={l.anchor} fill={INK}>
          {l.text}
        </text>
      ))}
    </g>
  );
}

function Dimension({ x1, y1, x2, y2, label, vertical = false }: { x1: number; y1: number; x2: number; y2: number; label: number | string; vertical?: boolean }) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={DIM} strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      {vertical ? (
        <text x={mx - 6} y={my} fontSize="15" fontWeight="600" textAnchor="middle" transform={`rotate(-90 ${mx - 6} ${my})`} fill={INK}>
          {label}
        </text>
      ) : (
        <text x={mx} y={my - 6} fontSize="15" fontWeight="600" textAnchor="middle" fill={INK}>
          {label}
        </text>
      )}
    </g>
  );
}

function EdgeLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text x={x} y={y} fontSize="12" textAnchor="middle" dominantBaseline="middle" fill={INK}>
      {text}
    </text>
  );
}

type At = (p: { x: number; y: number }) => { X: number; Y: number };
type Edge = (side: 'left' | 'right') => { bottom: { x: number; y: number }; top: { x: number; y: number } };

/** Where an edge is at a height up from its bottom corner, in mm on the pane. */
function onEdge(e: { bottom: { x: number; y: number }; top: { x: number; y: number } }, up: number) {
  const rise = e.top.y - e.bottom.y || 1;
  return { x: e.bottom.x + ((e.top.x - e.bottom.x) * up) / rise, y: e.bottom.y + up };
}

/**
 * Where a cut-out is measured to, as the orders measure it, and from where: a
 * notch from the nearer end of its edge to its near edge, a hinge's hole from
 * the nearer end to its centre, a handle's or knob's hole from the bottom.
 */
export function placing(edgeLengthMm: number, f: Cut): { from: 'top' | 'bottom'; to: 'edge' | 'centre'; distanceMm: number; atMm: number } {
  const round = (v: number) => Math.round(v * 10) / 10;
  const fromTop = edgeLengthMm - f.centreMm < f.centreMm;
  if (f.kind === 'notch') {
    // A rebated notch is placed by the rebate's near edge, the first glass the cut takes.
    const half = (f.rebate?.heightMm ?? f.heightMm) / 2;
    const atMm = fromTop ? f.centreMm + half : f.centreMm - half;
    return { from: fromTop ? 'top' : 'bottom', to: 'edge', distanceMm: round(fromTop ? edgeLengthMm - atMm : atMm), atMm };
  }
  // A sliding shower's holes are placed as CRL prints them, down from the top.
  const sliding = f.role === 'roller' || f.role === 'track-holder' || f.role === 'return-fitting';
  if ((f.role === 'panel-hinge' || sliding) && fromTop) return { from: 'top', to: 'centre', distanceMm: round(edgeLengthMm - f.centreMm), atMm: f.centreMm };
  return { from: 'bottom', to: 'centre', distanceMm: round(f.centreMm), atMm: f.centreMm };
}

/** A short dimension beside an edge, between two heights on it, in mm up from its bottom corner. */
function Along({ side, fromMm, toMm, label, edge, at, x0, w, offset = 22 }: { side: 'left' | 'right'; fromMm: number; toMm: number; label: number; edge: Edge; at: At; x0: number; w: number; offset?: number }) {
  const e = edge(side);
  const x = side === 'left' ? x0 - offset : x0 + w + offset;
  const y1 = at(onEdge(e, fromMm)).Y;
  const y2 = at(onEdge(e, toMm)).Y;
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={DIM} strokeWidth="0.9" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      <text x={x - 5} y={(y1 + y2) / 2} fontSize="12" textAnchor="middle" transform={`rotate(-90 ${x - 5} ${(y1 + y2) / 2})`} fill={INK}>
        {label}
      </text>
    </g>
  );
}

/** A cut-out's place, measured as `placing` says. */
function FromEnd({ feature, edge, at, x0, w }: { feature: Cut; edge: Edge; at: At; x0: number; w: number }) {
  const e = edge(feature.side);
  const length = e.top.y - e.bottom.y;
  const p = placing(length, feature);
  return <Along side={feature.side} fromMm={p.from === 'top' ? length : 0} toMm={p.atMm} label={p.distanceMm} edge={edge} at={at} x0={x0} w={w} />;
}

function Feature({ feature: f, letter, from, scale, at, edge, x0, w }: { feature: PaneFeature; letter: string; from: number | null; scale: number; at: At; edge: Edge; x0: number; w: number }) {
  if (f.kind === 'corner') {
    const e = edge(f.corner === 'bottom-left' ? 'left' : 'right');
    const c = at(e.bottom);
    const cw = Math.max(f.widthMm * scale, 6);
    const ch = Math.max(f.heightMm * scale, 6);
    const x = f.corner === 'bottom-left' ? c.X : c.X - cw;
    return (
      <g>
        <rect x={x} y={c.Y - ch} width={cw} height={ch} fill="#fff" stroke={INK} strokeWidth="1.4" />
        <text x={f.corner === 'bottom-left' ? x + cw + 4 : x - 4} y={c.Y - ch - 4} fontSize="11" textAnchor={f.corner === 'bottom-left' ? 'start' : 'end'} fill={INK}>
          Notch {f.widthMm} × {f.heightMm}
        </text>
      </g>
    );
  }
  const e = edge(f.side);
  const point = at(onEdge(e, f.centreMm));
  const into = f.side === 'left' ? 1 : -1;
  const label = (x: number, y: number) => (
    <text x={x} y={y + 4} fontSize="11" textAnchor={f.side === 'left' ? 'start' : 'end'} fill={INK}>
      <tspan fontSize="13" fontWeight="700">
        {letter}
      </tspan>
      {f.hinge ? <tspan dx="5">{f.hinge}</tspan> : null}
    </text>
  );
  if (f.kind === 'notch') {
    // At least big enough to see; true to its template's shape.
    const k = Math.max(scale, 6 / Math.max(f.heightMm, 1));
    const outline = notchOutline(f).map((p) => ({ X: point.X + into * p.x * k, Y: point.Y - p.y * k }));
    const mouth = outline.map((p) => `${p.X},${p.Y}`).join(' ');
    const deepest = Math.max(...notchOutline(f).map((p) => p.x)) * k;
    return (
      <g>
        {/* The glass taken away, and the pane's edge with it. */}
        <polygon points={`${point.X - into},${outline[0].Y} ${mouth} ${point.X - into},${outline[outline.length - 1].Y}`} fill="#fff" stroke="none" />
        <polyline points={mouth} fill="none" stroke={INK} strokeWidth="1.4" />
        {label(point.X + into * (deepest + 6), point.Y)}
        <FromEnd feature={f} edge={edge} at={at} x0={x0} w={w} />
      </g>
    );
  }
  const cx = point.X + into * f.insetMm * scale;
  const cy = point.Y;
  const r = Math.max((f.diameterMm / 2) * scale, 2.5);
  return (
    <g>
      {/* How far in from its edge, to the hole's centre: once for a pair, on its first hole. */}
      {from === null && (
        <>
          <line x1={point.X} y1={cy - r - 9} x2={cx} y2={cy - r - 9} stroke={DIM} strokeWidth="0.8" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
          <text x={(point.X + cx) / 2} y={cy - r - 13} fontSize="10" textAnchor="middle" fill={INK}>
            {f.insetMm}
          </text>
        </>
      )}
      <circle cx={cx} cy={cy} r={r} fill="#fff" stroke={INK} strokeWidth="1.2" />
      {from === null && label(cx + into * (r + 5), cy)}
      {from === null ? (
        <FromEnd feature={f} edge={edge} at={at} x0={x0} w={w} />
      ) : (
        <Along side={f.side} fromMm={from} toMm={f.centreMm} label={Math.round(Math.abs(f.centreMm - from) * 10) / 10} edge={edge} at={at} x0={x0} w={w} />
      )}
    </g>
  );
}

function Stamp({ stamp, at, scale, y0, h }: { stamp: Pane['stamp']; at: { X: number; Y: number }; scale: number; y0: number; h: number }) {
  const { corner } = stamp;
  const inX = Math.max(stamp.inMm * scale, 14);
  const x = corner === 'bottom-left' ? at.X + inX : at.X - inX;
  const y = at.Y - Math.max(stamp.upMm * scale, 6);
  return (
    <g>
      <text x={x} y={y - 4} fontSize="12" fontStyle="italic" fontWeight="700" textAnchor={corner === 'bottom-left' ? 'start' : 'end'} fill={INK}>
        TGS
      </text>
      <text x={at.X} y={y0 + h + 16} fontSize="10" textAnchor={corner === 'bottom-left' ? 'start' : 'end'} fill={DIM}>
        stamp {stamp.inMm} in, {stamp.upMm} up
      </text>
    </g>
  );
}

/** A template drawn large with every size, for the templates page, as the CRL sheets on the orders are. */
export function TemplateDrawing({ letter, feature }: { letter: string; feature: Cut }) {
  const id = `t-${letter}`;
  const caption = (
    <figcaption>
      <span className="text-sm font-bold">
        Template {letter}: {feature.hinge ?? feature.name}
      </span>
      <span className="block text-[11px]">
        {feature.name}.{' '}
        {feature.source === null
          ? 'Not yet checked against the maker’s drawing of this hinge: check it against the template that comes with the hinge before cutting.'
          : feature.source === 'SetOut'
            ? 'SetOut’s handle rule.'
            : `From ${feature.source}.`}
      </span>
    </figcaption>
  );
  const s = 3;
  const E = 60;
  const marker = (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 1 L9 5 L0 9" fill="none" stroke={DIM} strokeWidth="1.2" />
      </marker>
    </defs>
  );
  const dim = (x1: number, y1: number, x2: number, y2: number, text: string, vertical = false) => (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={DIM} strokeWidth="0.9" markerStart={`url(#${id})`} markerEnd={`url(#${id})`} />
      {vertical ? (
        <text x={x1 - 6} y={(y1 + y2) / 2} fontSize="12" textAnchor="middle" transform={`rotate(-90 ${x1 - 6} ${(y1 + y2) / 2})`} fill={INK}>
          {text}
        </text>
      ) : (
        <text x={(x1 + x2) / 2} y={y1 - 5} fontSize="12" textAnchor="middle" fill={INK}>
          {text}
        </text>
      )}
    </g>
  );
  if (feature.kind === 'notch') {
    const outline = notchOutline(feature);
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    const reach = Math.max(...xs);
    const tall = Math.max(...ys);
    const W = E + reach * s + 110;
    const H = tall * 2 * s + 110;
    const cy = H / 2;
    const P = (p: { x: number; y: number }) => ({ X: E + p.x * s, Y: cy - p.y * s });
    const top = cy - (feature.heightMm / 2) * s;
    const bottom = cy + (feature.heightMm / 2) * s;
    // Where the cut meets the edge: the rebate's ends, if it has one.
    const edgeTop = cy - ((feature.rebate?.heightMm ?? feature.heightMm) / 2) * s;
    const edgeBottom = cy + ((feature.rebate?.heightMm ?? feature.heightMm) / 2) * s;
    return (
      <figure className="break-inside-avoid">
        {caption}
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-auto w-full max-w-[380px]" role="img" aria-label={`${feature.name}: ${feature.heightMm}mm high, ${feature.depthMm}mm deep`}>
          {marker}
          <line x1={E} y1={10} x2={E} y2={edgeTop} stroke={INK} strokeWidth="2" />
          <line x1={E} y1={edgeBottom} x2={E} y2={H - 10} stroke={INK} strokeWidth="2" />
          <text x={E - 8} y={18} fontSize="11" textAnchor="end" fill={INK}>
            edge
          </text>
          <polyline points={outline.map(P).map((p) => `${p.X},${p.Y}`).join(' ')} fill="#f4f4f4" stroke={INK} strokeWidth="1.6" />
          {dim(E - 22, top, E - 22, bottom, `${feature.heightMm}`, true)}
          {dim(E, edgeTop - 22, E + feature.depthMm * s, edgeTop - 22, `${feature.depthMm}`)}
          {feature.rebate && (
            <>
              {dim(E - 46, edgeTop, E - 46, edgeBottom, `${feature.rebate.heightMm}`, true)}
              <text x={E + feature.rebate.depthMm * s + 6} y={edgeTop + 14} fontSize="12" fill={INK}>
                rebate {feature.rebate.depthMm} deep
              </text>
            </>
          )}
          {feature.ears ? (
            <>
              {dim(E + reach * s + 26, cy - (feature.ears.apartMm / 2) * s, E + reach * s + 26, cy + (feature.ears.apartMm / 2) * s, `${feature.ears.apartMm}`, true)}
              {dim(E, bottom + 26, E + feature.ears.inMm * s, bottom + 26, `${feature.ears.inMm}`)}
              <text x={E + reach * s + 8} y={cy - (feature.ears.apartMm / 2) * s - (feature.ears.diameterMm / 2) * s - 4} fontSize="12" fill={INK}>
                Ø{feature.ears.diameterMm} ears
              </text>
            </>
          ) : (
            <text x={E + feature.depthMm * s + 10} y={cy + 4} fontSize="12" fill={INK}>
              r{feature.radiusMm}
            </text>
          )}
        </svg>
        <p className="text-[11px]">In mm. Placed by its near edge, at the distance given on the pane.</p>
      </figure>
    );
  }
  // Holes: a hinge's or a handle's pair, or a knob's one.
  const pair = feature.apartMm !== null;
  const apart = feature.apartMm ?? 0;
  const k = pair ? Math.min(s, 180 / Math.max(apart, 1)) : s;
  const r = Math.max((feature.diameterMm / 2) * k, 3);
  // Room for a big hole, such as a sliding door's pull: the usual ones fit as they always did.
  const y1 = Math.max(55, r + 30);
  const W = E + feature.insetMm * k + 120;
  const H = (pair ? apart * k : 0) + y1 + Math.max(55, r + 30);
  const cx = E + feature.insetMm * k;
  const y2 = y1 + apart * k;
  return (
    <figure className="break-inside-avoid">
      {caption}
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-auto w-full max-w-[300px]" role="img" aria-label={`${feature.name}: ${feature.diameterMm}mm, ${feature.insetMm}mm in${pair ? `, ${apart}mm apart` : ''}`}>
        {marker}
        <line x1={E} y1={10} x2={E} y2={H - 10} stroke={INK} strokeWidth="2" />
        <text x={E - 8} y={18} fontSize="11" textAnchor="end" fill={INK}>
          edge
        </text>
        <circle cx={cx} cy={y1} r={r} fill="#f4f4f4" stroke={INK} strokeWidth="1.6" />
        {pair && <circle cx={cx} cy={y2} r={r} fill="#f4f4f4" stroke={INK} strokeWidth="1.6" />}
        {dim(E, y1 - r - 14, cx, y1 - r - 14, `${feature.insetMm}`)}
        {pair && dim(cx + r + 26, y1, cx + r + 26, y2, `${apart}`, true)}
        <text x={cx + r + 8} y={(pair ? y2 : y1) + r + 18} fontSize="12" fill={INK}>
          Ø{feature.diameterMm}
        </text>
      </svg>
      <p className="text-[11px]">In mm. Centres at the heights given on the pane.</p>
    </figure>
  );
}
