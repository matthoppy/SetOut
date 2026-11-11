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

import type { Pane, PaneFeature } from '@setout/engine';

/** Each kind of cut-out's letter on the drawings, and its name on the templates page. */
export const TEMPLATES: Record<string, { letter: string; name: string }> = {
  'door-hinge': { letter: 'A', name: 'Door hinge notch' },
  'fixed-hinge': { letter: 'B', name: 'Mating hinge notch' },
  handle: { letter: 'C', name: 'Handle holes' },
  knob: { letter: 'D', name: 'Knob hole' },
};

const BOX = { width: 640, height: 820 };
const MARGIN = { left: 90, right: 90, top: 70, bottom: 90 };
const INK = '#111';
const DIM = '#333';

export function PaneDrawing({ pane, edgework = 'FP' }: { pane: Pane; edgework?: string }) {
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
        <Feature key={i} feature={f} below={below(pane, f)} scale={scale} at={at} edge={edge} x0={x0} w={w} />
      ))}

      {/* The toughening stamp. */}
      <Stamp stamp={pane.stamp} at={at(pane.stamp.corner === 'bottom-left' ? bl : br)} scale={scale} y0={y0} h={h} />
    </svg>
  );
}

/** A pull handle's hole above another is measured from it, as the orders do: the pair's spacing. */
function below(pane: Pane, f: PaneFeature): number | null {
  if (f.kind !== 'hole' || f.template !== 'handle') return null;
  const lower = pane.features
    .filter((g): g is Extract<PaneFeature, { kind: 'hole' }> => g.kind === 'hole' && g.template === 'handle' && g.side === f.side && g.centreMm < f.centreMm)
    .sort((a, b) => b.centreMm - a.centreMm)[0];
  return lower ? lower.centreMm : null;
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

/** Where a cut-out is measured to, as the orders measure it, and from where. */
export function placing(
  edgeLengthMm: number,
  f: Exclude<PaneFeature, { kind: 'corner' }>
): { from: 'top' | 'bottom'; to: 'edge' | 'centre'; distanceMm: number; atMm: number } {
  const round = (v: number) => Math.round(v * 10) / 10;
  if (f.kind === 'notch') {
    // From the nearer end of the edge to the notch's near edge.
    const half = f.heightMm / 2;
    const fromTop = edgeLengthMm - f.centreMm < f.centreMm;
    const atMm = fromTop ? f.centreMm + half : f.centreMm - half;
    return { from: fromTop ? 'top' : 'bottom', to: 'edge', distanceMm: round(fromTop ? edgeLengthMm - atMm : atMm), atMm };
  }
  // A hole from the bottom to its centre.
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

/** A cut-out's place: from the nearer end to a notch's near edge, or from the bottom to a hole. */
function FromEnd({ feature, edge, at, x0, w }: { feature: Exclude<PaneFeature, { kind: 'corner' }>; edge: Edge; at: At; x0: number; w: number }) {
  const e = edge(feature.side);
  const length = e.top.y - e.bottom.y;
  const p = placing(length, feature);
  return <Along side={feature.side} fromMm={p.from === 'top' ? length : 0} toMm={p.atMm} label={p.distanceMm} edge={edge} at={at} x0={x0} w={w} />;
}

function Feature({ feature: f, below, scale, at, edge, x0, w }: { feature: PaneFeature; below: number | null; scale: number; at: At; edge: Edge; x0: number; w: number }) {
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
  const template = TEMPLATES[f.template];
  const e = edge(f.side);
  const point = at(onEdge(e, f.centreMm));
  if (f.kind === 'notch') {
    const depth = Math.max(f.depthMm * scale, 6);
    const tall = Math.max(f.heightMm * scale, 6);
    const r = Math.min(f.radiusMm * scale, depth / 2, tall / 2);
    const x = f.side === 'left' ? point.X - 1 : point.X - depth + 1;
    return (
      <g>
        <rect x={x} y={point.Y - tall / 2} width={depth} height={tall} rx={r} fill="#fff" stroke={INK} strokeWidth="1.4" />
        <text x={f.side === 'left' ? point.X + depth + 6 : point.X - depth - 6} y={point.Y + 4} fontSize="13" fontWeight="700" textAnchor={f.side === 'left' ? 'start' : 'end'} fill={INK}>
          {template.letter}
        </text>
        <FromEnd feature={f} edge={edge} at={at} x0={x0} w={w} />
      </g>
    );
  }
  const cx = point.X + (f.side === 'left' ? 1 : -1) * f.insetMm * scale;
  const cy = point.Y;
  const r = Math.max((f.diameterMm / 2) * scale, 2.5);
  return (
    <g>
      {/* How far in from its edge, to the hole's centre. */}
      <line x1={point.X} y1={cy - r - 9} x2={cx} y2={cy - r - 9} stroke={DIM} strokeWidth="0.8" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      <text x={(point.X + cx) / 2} y={cy - r - 13} fontSize="10" textAnchor="middle" fill={INK}>
        {f.insetMm}
      </text>
      <circle cx={cx} cy={cy} r={r} fill="#fff" stroke={INK} strokeWidth="1.2" />
      <text x={f.side === 'left' ? cx + r + 5 : cx - r - 5} y={cy + 4} fontSize="12" fontWeight="700" textAnchor={f.side === 'left' ? 'start' : 'end'} fill={INK}>
        {template.letter}
      </text>
      {below === null ? (
        <FromEnd feature={f} edge={edge} at={at} x0={x0} w={w} />
      ) : (
        <Along side={f.side} fromMm={below} toMm={f.centreMm} label={Math.round((f.centreMm - below) * 10) / 10} edge={edge} at={at} x0={x0} w={w} />
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

/** A template's drawing and sizes, for the templates page. */
export function TemplateDrawing({ template, feature }: { template: string; feature: PaneFeature }) {
  const t = TEMPLATES[template];
  if (feature.kind === 'notch') {
    const s = 3;
    const d = feature.depthMm * s;
    const hh = feature.heightMm * s;
    return (
      <figure className="break-inside-avoid">
        <figcaption className="text-sm font-bold">
          Template {t.letter}: {t.name}
        </figcaption>
        <svg viewBox={`0 0 ${d + 160} ${hh + 80}`} className="mt-1 h-auto w-full max-w-[360px]" role="img" aria-label={`${t.name}: ${feature.depthMm}mm deep, ${feature.heightMm}mm high, ${feature.radiusMm}mm radius`}>
          <defs>
            <marker id={`a-${template}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 1 L9 5 L0 9" fill="none" stroke={DIM} strokeWidth="1.2" />
            </marker>
          </defs>
          <line x1="40" y1="20" x2="40" y2={hh + 60} stroke={INK} strokeWidth="2" />
          <text x="34" y={hh / 2 + 40} fontSize="12" textAnchor="end" fill={INK}>
            edge
          </text>
          <rect x="40" y="40" width={d} height={hh} rx={feature.radiusMm * s} fill="#f4f4f4" stroke={INK} strokeWidth="1.6" />
          <line x1="40" y1="30" x2={40 + d} y2="30" stroke={DIM} markerStart={`url(#a-${template})`} markerEnd={`url(#a-${template})`} />
          <text x={40 + d / 2} y="25" fontSize="13" textAnchor="middle" fill={INK}>
            {feature.depthMm} deep
          </text>
          <line x1={50 + d} y1="40" x2={50 + d} y2={40 + hh} stroke={DIM} markerStart={`url(#a-${template})`} markerEnd={`url(#a-${template})`} />
          <text x={58 + d} y={44 + hh / 2} fontSize="13" fill={INK}>
            {feature.heightMm} high
          </text>
          <text x={40 + d / 2} y={hh + 64} fontSize="12" textAnchor="middle" fill={INK}>
            corners r{feature.radiusMm}; placed by its near edge
          </text>
        </svg>
      </figure>
    );
  }
  if (feature.kind === 'hole') {
    return (
      <figure className="break-inside-avoid">
        <figcaption className="text-sm font-bold">
          Template {t.letter}: {t.name}
        </figcaption>
        <p className="mt-1 text-sm">
          {feature.template === 'knob'
            ? `One Ø${feature.diameterMm}mm hole through the glass, centred ${feature.insetMm}mm in from the edge, at the height given on the pane.`
            : `Ø${feature.diameterMm}mm holes through the glass, each centred ${feature.insetMm}mm in from the edge, at the heights given on the pane.`}
        </p>
      </figure>
    );
  }
  return null;
}
