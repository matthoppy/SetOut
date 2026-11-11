/**
 * The pieces a dimensioned drawing is made of, shared by every layout.
 *
 * One set of rules. Inside the glass there is only the glass and the laser.
 * Each reading sits on its own line outside the surface it was taken from,
 * under the same circled number it had on its card, and what readings add up
 * to sits beyond that. A line too short to carry its number has it beyond
 * the end, as on any drawing. Leans, falls and slopes are blown up so they
 * can be seen, and the drawing says so.
 */

export const INK = 'hsl(var(--foreground) / 0.8)';
export const FAINT = 'hsl(var(--muted-foreground) / 0.5)';
export const ACCENT = 'hsl(var(--measure-accent))';
export const BG = 'hsl(var(--background))';
export const LASER = '#e11d48';
export const GLASS = 'hsl(var(--measure-accent) / 0.08)';
export const FONT = 'system-ui, sans-serif';

/** How many times bigger a lean, a fall or a slope is drawn than it is. */
export const EX = 8;

// The page, in drawing units. One unit is about one pixel on a phone.
export const W = 340;
/** Each side of the glass: a column for the readings, then one for a height. */
export const GUTTER = 82;
export const TICK = 4;
export const MARK_R = 6.5;

/** A dimension line with a tick at each end. */
export function DimLine({ x1, y1, x2, y2, tone, weight = 1 }: { x1: number; y1: number; x2: number; y2: number; tone: string; weight?: number }) {
  const upright = x1 === x2;
  return (
    <g stroke={tone} strokeWidth={1}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={weight} />
      {[
        [x1, y1],
        [x2, y2],
      ].map(([x, y], i) => (upright ? <line key={i} x1={x - TICK} y1={y} x2={x + TICK} y2={y} /> : <line key={i} x1={x} y1={y - TICK} x2={x} y2={y + TICK} />))}
    </g>
  );
}

/** How much room a reading takes when written out: its circled number, then the figure. */
export const readingWidth = (value: number, n?: number) => (n === undefined ? 0 : MARK_R * 2 + 3) + String(value).length * 6.4;

/**
 * A reading as written on the drawing, with the same circled number as its
 * card. `turned` writes it up the page, for a line too tall to label beside.
 */
export function Reading({ n, value, x, y, anchor, turned = false }: { n?: number; value: number; x: number; y: number; anchor: 'start' | 'middle' | 'end'; turned?: boolean }) {
  const width = readingWidth(value, n);
  const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  const figureX = n === undefined ? left : left + MARK_R * 2 + 3;
  return (
    <g fontFamily={FONT} fill={ACCENT} transform={turned ? `rotate(-90 ${x} ${y})` : undefined}>
      {n !== undefined && (
        <>
          <circle cx={left + MARK_R} cy={y} r={MARK_R} fill={BG} stroke={ACCENT} strokeWidth={1} />
          <text x={left + MARK_R} y={y + 3} textAnchor="middle" fontSize={n > 9 ? 7.5 : 8.5} fontWeight={700}>
            {n}
          </text>
        </>
      )}
      <text x={figureX} y={y + 3.9} fontSize={11} fontWeight={600}>
        {value}
      </text>
    </g>
  );
}

/**
 * A reading along the floor or across the top, between two points. The number
 * sits beside the line, or beyond its `outer` end when the line is too short
 * to carry it.
 */
export function AcrossReading({ n, value, outerX, innerX, y, labelY }: { n?: number; value: number; outerX: number; innerX: number; y: number; labelY: number }) {
  const fits = Math.abs(innerX - outerX) >= readingWidth(value, n) + 8;
  const outerIsLeft = outerX < innerX;
  return (
    <g>
      <DimLine x1={outerX} y1={y} x2={innerX} y2={y} tone={ACCENT} />
      {fits ? (
        <Reading n={n} value={value} x={(outerX + innerX) / 2} y={labelY} anchor="middle" />
      ) : (
        <Reading n={n} value={value} x={outerIsLeft ? outerX - 7 : outerX + 7} y={y} anchor={outerIsLeft ? 'end' : 'start'} />
      )}
    </g>
  );
}

/** A reading straight up or down, between a line and a surface, with its number beside it. */
export function UprightReading({ n, value, x, y1, y2, side, turned = false }: { n?: number; value: number; x: number; y1: number; y2: number; side: 'left' | 'right'; turned?: boolean }) {
  const mid = (y1 + y2) / 2;
  return (
    <g>
      <DimLine x1={x} y1={y1} x2={x} y2={y2} tone={ACCENT} />
      {turned ? (
        <Reading n={n} value={value} x={side === 'left' ? x - 6 - MARK_R : x + 6 + MARK_R} y={mid} anchor="middle" turned />
      ) : (
        <Reading n={n} value={value} x={side === 'left' ? x - 6 : x + 6} y={mid} anchor={side === 'left' ? 'end' : 'start'} />
      )}
    </g>
  );
}

/** A size the readings add up to, in the heavier ink. */
export function Overall({ x1, x2, y, text, below }: { x1: number; x2: number; y: number; text: string; below: boolean }) {
  return (
    <g>
      <DimLine x1={x1} y1={y} x2={x2} y2={y} tone={INK} weight={1.4} />
      <text x={(x1 + x2) / 2} y={below ? y + 15 : y - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill={INK} fontFamily={FONT}>
        {text}
      </text>
    </g>
  );
}

/** What the drawing has to say when anything on it is drawn bigger than it is. */
export function ExaggerationNote() {
  return (
    <figcaption className="mt-1 text-center text-xs text-muted-foreground">
      Leans, falls and slopes are drawn {EX} times bigger so you can see them. The numbers are yours.
    </figcaption>
  );
}
