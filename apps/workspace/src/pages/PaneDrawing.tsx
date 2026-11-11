/**
 * One pane, drawn for the toughener the way Matt's own glass orders are: to
 * scale, every edge dimensioned and marked FP, each hinge notch, handle hole
 * and corner notch on its stated edge with its distance from the nearer end,
 * a letter for its template, and where the toughening stamp goes.
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
};

/** Where the toughening stamp sits in its corner. */
export const STAMP = { fromSideMm: 59, fromBottomMm: 5 };

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
  const xOf = (side: 'left' | 'right', inset: number) => (side === 'left' ? x0 + inset * scale : x0 + w - inset * scale);
  /** A height up from the bottom edge, on the drawing. */
  const yOf = (up: number) => y0 + h - up * scale;

  return (
    <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} className="mx-auto block h-auto w-full max-w-[640px]" role="img" aria-label={`${pane.label}, ${pane.widthMm} by ${pane.heightMm}mm`}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 1 L9 5 L0 9" fill="none" stroke={DIM} strokeWidth="1.2" />
        </marker>
      </defs>

      {/* The pane. */}
      <rect x={x0} y={y0} width={w} height={h} fill="#fff" stroke={INK} strokeWidth="1.6" />

      {/* Overall sizes: across the top and bottom, up each side. */}
      <Dimension x1={x0} y1={y0 - 34} x2={x0 + w} y2={y0 - 34} label={pane.widthMm} />
      <Dimension x1={x0} y1={y0 + h + 44} x2={x0 + w} y2={y0 + h + 44} label={pane.widthMm} />
      <Dimension x1={x0 - 54} y1={y0 + h} x2={x0 - 54} y2={y0} label={pane.heightMm} vertical />
      <Dimension x1={x0 + w + 54} y1={y0 + h} x2={x0 + w + 54} y2={y0} label={pane.heightMm} vertical />

      {/* Edgework, on every edge. */}
      <EdgeLabel x={x0 + w / 2} y={y0 + 16} text={edgework} />
      <EdgeLabel x={x0 + w / 2} y={y0 + h - 8} text={edgework} />
      <EdgeLabel x={x0 + 18} y={y0 + h / 2} text={edgework} />
      <EdgeLabel x={x0 + w - 18} y={y0 + h / 2} text={edgework} />

      {pane.features.map((f, i) => (
        <Feature key={i} feature={f} pane={pane} scale={scale} xOf={xOf} yOf={yOf} x0={x0} y0={y0} w={w} h={h} />
      ))}

      {/* The toughening stamp. */}
      <Stamp corner={pane.stamp} x0={x0} y0={y0} w={w} h={h} scale={scale} />
    </svg>
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

/** A short dimension from the nearer end of the pane to a cut-out's centre, beside the edge it is on. */
function FromEnd({ side, centre, pane, x0, y0, w, h, scale }: { side: 'left' | 'right'; centre: number; pane: Pane; x0: number; y0: number; w: number; h: number; scale: number }) {
  const fromTop = pane.heightMm - centre < centre;
  const distance = Math.round((fromTop ? pane.heightMm - centre : centre) * 10) / 10;
  const x = side === 'left' ? x0 - 22 : x0 + w + 22;
  const yEnd = fromTop ? y0 : y0 + h;
  const yCentre = y0 + h - centre * scale;
  return (
    <g>
      <line x1={x} y1={yEnd} x2={x} y2={yCentre} stroke={DIM} strokeWidth="0.9" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      <text x={x - 5} y={(yEnd + yCentre) / 2} fontSize="12" textAnchor="middle" transform={`rotate(-90 ${x - 5} ${(yEnd + yCentre) / 2})`} fill={INK}>
        {distance}
      </text>
    </g>
  );
}

function Feature({
  feature: f,
  pane,
  scale,
  xOf,
  yOf,
  x0,
  y0,
  w,
  h,
}: {
  feature: PaneFeature;
  pane: Pane;
  scale: number;
  xOf: (side: 'left' | 'right', inset: number) => number;
  yOf: (up: number) => number;
  x0: number;
  y0: number;
  w: number;
  h: number;
}) {
  if (f.kind === 'corner') {
    const cw = Math.max(f.widthMm * scale, 6);
    const ch = Math.max(f.heightMm * scale, 6);
    const x = f.corner === 'bottom-left' ? x0 : x0 + w - cw;
    return (
      <g>
        <rect x={x} y={y0 + h - ch} width={cw} height={ch} fill="#fff" stroke={INK} strokeWidth="1.4" />
        <text x={f.corner === 'bottom-left' ? x + cw + 4 : x - 4} y={y0 + h - ch - 4} fontSize="11" textAnchor={f.corner === 'bottom-left' ? 'start' : 'end'} fill={INK}>
          Notch {f.widthMm} × {f.heightMm}
        </text>
      </g>
    );
  }
  const template = TEMPLATES[f.template];
  if (f.kind === 'notch') {
    const depth = Math.max(f.depthMm * scale, 6);
    const tall = Math.max(f.heightMm * scale, 6);
    const r = Math.min(f.radiusMm * scale, depth / 2, tall / 2);
    const cy = yOf(f.centreMm);
    const x = f.side === 'left' ? x0 - 1 : x0 + w - depth + 1;
    return (
      <g>
        <rect x={x} y={cy - tall / 2} width={depth} height={tall} rx={r} fill="#fff" stroke={INK} strokeWidth="1.4" />
        <text x={f.side === 'left' ? x0 + depth + 6 : x0 + w - depth - 6} y={cy + 4} fontSize="13" fontWeight="700" textAnchor={f.side === 'left' ? 'start' : 'end'} fill={INK}>
          {template.letter}
        </text>
        <FromEnd side={f.side} centre={f.centreMm} pane={pane} x0={x0} y0={y0} w={w} h={h} scale={scale} />
      </g>
    );
  }
  const cx = xOf(f.side, f.insetMm);
  const cy = yOf(f.centreMm);
  const r = Math.max((f.diameterMm / 2) * scale, 2.5);
  const edgeX = f.side === 'left' ? x0 : x0 + w;
  return (
    <g>
      {/* How far in from its edge, to the hole's centre. */}
      <line x1={edgeX} y1={cy - r - 9} x2={cx} y2={cy - r - 9} stroke={DIM} strokeWidth="0.8" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      <text x={(edgeX + cx) / 2} y={cy - r - 13} fontSize="10" textAnchor="middle" fill={INK}>
        {f.insetMm}
      </text>
      <circle cx={cx} cy={cy} r={r} fill="#fff" stroke={INK} strokeWidth="1.2" />
      <text x={f.side === 'left' ? cx + r + 5 : cx - r - 5} y={cy + 4} fontSize="12" fontWeight="700" textAnchor={f.side === 'left' ? 'start' : 'end'} fill={INK}>
        {template.letter}
      </text>
      <FromEnd side={f.side} centre={f.centreMm} pane={pane} x0={x0} y0={y0} w={w} h={h} scale={scale} />
    </g>
  );
}

function Stamp({ corner, x0, y0, w, h, scale }: { corner: 'bottom-left' | 'bottom-right'; x0: number; y0: number; w: number; h: number; scale: number }) {
  const inX = Math.max(STAMP.fromSideMm * scale, 14);
  const x = corner === 'bottom-left' ? x0 + inX : x0 + w - inX;
  const y = y0 + h - Math.max(STAMP.fromBottomMm * scale, 6);
  return (
    <g>
      <text x={x} y={y - 4} fontSize="12" fontStyle="italic" fontWeight="700" textAnchor={corner === 'bottom-left' ? 'start' : 'end'} fill={INK}>
        TGS
      </text>
      <text x={corner === 'bottom-left' ? x0 + 4 : x0 + w - 4} y={y0 + h + 16} fontSize="10" textAnchor={corner === 'bottom-left' ? 'start' : 'end'} fill={DIM}>
        stamp {STAMP.fromSideMm} in, {STAMP.fromBottomMm} up
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
            corners r{feature.radiusMm}, centred on the height given
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
          Ø{feature.diameterMm}mm holes through the glass, each centred {feature.insetMm}mm in from the edge, at the heights given on the pane.
        </p>
      </figure>
    );
  }
  return null;
}
