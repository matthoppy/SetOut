/**
 * The customer's own opening, drawn back to them.
 *
 * This is the last gate before the enquiry is sent, and it catches what the
 * arithmetic cannot: a lean recorded on the wrong wall, or in the wrong
 * direction. Both produce numbers that cross-check perfectly and a shape that
 * is obviously wrong the moment you look at it.
 *
 * Leans are exaggerated — a real 5mm over 2000mm is a quarter of a degree and
 * would draw as a straight line. The exaggeration is stated on the figure,
 * because a customer who thinks we are about to cut *this* shape would quite
 * reasonably panic.
 *
 * The how-to-measure figures that used to live here moved to MeasureScene,
 * which draws them from the customer's own shape.
 */

const INK = 'hsl(var(--muted-foreground))';
const ACCENT = 'hsl(var(--measure-accent))';

export function OpeningPreview({
  widthAtFloorMm,
  widthAtTopMm,
  heightMm,
  leftLeanMm,
  rightLeanMm,
  floorFallMm,
  floorLowEnd,
  className,
}: {
  widthAtFloorMm: number;
  widthAtTopMm: number;
  heightMm: number;
  /** Signed: positive leans into the opening at the top. */
  leftLeanMm: number;
  rightLeanMm: number;
  floorFallMm: number;
  floorLowEnd: 'left' | 'right' | null;
  className?: string;
}) {
  const W = 320;
  const H = 240;
  const pad = 46;

  const scale = Math.min(
    (W - pad * 2) / Math.max(widthAtFloorMm, widthAtTopMm, 1),
    (H - pad * 2) / Math.max(heightMm, 1)
  );

  const EXAGGERATION = 8;
  const ex = (mm: number) => mm * scale * EXAGGERATION;

  const floorW = widthAtFloorMm * scale;
  const h = heightMm * scale;

  const cx = W / 2;
  const baseY = pad + h;

  // Floor fall tilts the base line; the opening sits on it.
  const fall = ex(floorFallMm);
  const leftBaseY = floorLowEnd === 'left' ? baseY + fall : baseY;
  const rightBaseY = floorLowEnd === 'right' ? baseY + fall : baseY;

  const blx = cx - floorW / 2;
  const brx = cx + floorW / 2;
  // Top corners move by the exaggerated lean rather than by the measured top
  // width, so the drawing shows which wall is doing it.
  const tlx = blx + ex(leftLeanMm);
  const trx = brx - ex(rightLeanMm);
  const tly = leftBaseY - h;
  const try_ = rightBaseY - h;

  const anythingOut = leftLeanMm !== 0 || rightLeanMm !== 0 || floorFallMm !== 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Your opening as we understand it">
      <path
        d={`M ${tlx} ${tly} L ${trx} ${try_} L ${brx} ${rightBaseY} L ${blx} ${leftBaseY} Z`}
        fill={ACCENT}
        fillOpacity={0.08}
        stroke={ACCENT}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* A true rectangle behind it, so the out-of-true reads as a difference. */}
      {anythingOut && (
        <rect
          x={cx - floorW / 2}
          y={baseY - h}
          width={floorW}
          height={h}
          fill="none"
          stroke={INK}
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.5}
        />
      )}

      <text x={cx} y={tly - 12} textAnchor="middle" fontSize={12} fontWeight={700} fill={ACCENT}>
        {widthAtTopMm}
      </text>
      <text
        x={cx}
        y={Math.max(leftBaseY, rightBaseY) + 20}
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        fill={ACCENT}
      >
        {widthAtFloorMm}
      </text>
      <text
        x={Math.min(blx, tlx) - 8}
        y={baseY - h / 2}
        textAnchor="end"
        dominantBaseline="middle"
        fontSize={12}
        fontWeight={700}
        fill={ACCENT}
      >
        {heightMm}
      </text>

      {anythingOut && (
        <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill={INK}>
          Lean shown {EXAGGERATION}× so you can see it — dashed line is square
        </text>
      )}
    </svg>
  );
}
