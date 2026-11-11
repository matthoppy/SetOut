/**
 * Front elevation of the run, unfolded flat.
 *
 * Shows what the glass actually looks like: panel proportions, notches,
 * hinge positions and handle height. Returns are drawn in line with the front
 * panels and tagged, rather than foreshortened, because the point of this view
 * is reading sizes rather than perspective.
 *
 * The old 3D preview scaled panels by fixed factors (width_mm * 0.05) that bore
 * no relation to the viewport, which is why it rendered as a 2px sliver. This
 * fits the whole run to the box it is given.
 */

import { useMemo } from 'react';
import { calculateHingePlacement, derivePlanes, handleHoleHeightsMm } from '@setout/engine';
import { useEngine } from '../engine';
import type { ConfiguratorJunction, ConfiguratorPanel } from '@setout/engine';

interface ElevationViewProps {
  panels: ConfiguratorPanel[];
  junctions: ConfiguratorJunction[];
  heightMm: number;
  handleId: string;
  mounting?: 'channel' | 'clamps';
  finishColor?: string;
  width?: number;
  height?: number;
  activePanelId?: string | null;
  onPanelClick?: (id: string) => void;
  accent?: string;
  /** Measuring: the panels being measured right now; the rest step back. */
  highlightPanelIds?: string[] | null;
}

const GAP_MM = 24;
const PADDING = 92;

export function ElevationView({
  panels,
  junctions,
  heightMm,
  handleId,
  mounting = 'channel',
  finishColor = '#d4d8db',
  width = 620,
  height = 520,
  activePanelId,
  onPanelClick,
  accent = '#2563eb',
  highlightPanelIds = null,
}: ElevationViewProps) {
  const engine = useEngine();
  const { fixed } = engine.rules;
  const planes = useMemo(() => derivePlanes(panels, junctions), [panels, junctions]);

  const scale = useMemo(() => {
    const totalWidthMm =
      panels.reduce((s, p) => s + p.width_mm, 0) + Math.max(0, panels.length - 1) * GAP_MM;
    if (totalWidthMm <= 0 || heightMm <= 0) return 0;
    return Math.min((width - PADDING) / totalWidthMm, (height - PADDING) / heightMm);
  }, [panels, heightMm, width, height]);

  if (panels.length === 0 || scale <= 0) return null;

  const runWidthPx =
    (panels.reduce((s, p) => s + p.width_mm, 0) + Math.max(0, panels.length - 1) * GAP_MM) * scale;
  const heightPx = heightMm * scale;
  const startX = (width - runWidthPx) / 2;
  const baselineY = (height - heightPx) / 2 + heightPx;

  let cursor = startX;

  return (
    <svg width={width} height={height} className="select-none" role="img" aria-label="Front elevation of the shower enclosure">
      {/* Floor line. */}
      <line
        x1={startX - 26}
        y1={baselineY}
        x2={startX + runWidthPx + 26}
        y2={baselineY}
        stroke="#cbd5e1"
        strokeWidth={2}
      />

      {panels.map((panel, i) => {
        const wPx = panel.width_mm * scale;
        const x = cursor;
        cursor += wPx + GAP_MM * scale;

        const y = baselineY - heightPx;
        const isActive = panel.id === activePanelId;
        const isDoor = panel.kind === 'door';
        const plane = planes[i];

        // Notches are cut out of the bottom corners.
        const notch = panel.notches;
        const nW = (notch?.width_mm ?? 0) * scale;
        const nH = (notch?.height_mm ?? 0) * scale;
        const hasBL = !!notch?.bottom_left && nW > 0 && nH > 0;
        const hasBR = !!notch?.bottom_right && nW > 0 && nH > 0;

        const path = [
          `M ${x} ${y}`,
          `L ${x + wPx} ${y}`,
          hasBR
            ? `L ${x + wPx} ${baselineY - nH} L ${x + wPx - nW} ${baselineY - nH} L ${x + wPx - nW} ${baselineY}`
            : `L ${x + wPx} ${baselineY}`,
          hasBL
            ? `L ${x + nW} ${baselineY} L ${x + nW} ${baselineY - nH} L ${x} ${baselineY - nH}`
            : `L ${x} ${baselineY}`,
          'Z',
        ].join(' ');

        const hinge = isDoor ? calculateHingePlacement(engine.rules, heightMm) : null;
        const hingeOnLeft = panel.door?.hinge_side === 'left';
        const lit = !!highlightPanelIds?.includes(panel.id);
        const dimmed = highlightPanelIds !== null && !lit;

        return (
          <g
            key={panel.id}
            onClick={() => onPanelClick?.(panel.id)}
            style={{ cursor: onPanelClick ? 'pointer' : 'default' }}
            opacity={dimmed ? 0.3 : 1}
          >
            <path
              d={path}
              fill={isDoor || lit ? accent : '#0f172a'}
              fillOpacity={isActive || lit ? 0.16 : 0.07}
              stroke={isDoor || lit ? accent : '#475569'}
              strokeWidth={isActive || lit ? 2.5 : 1.5}
              strokeLinejoin="round"
            />

            {/* Hinges, drawn at their real offsets from each edge. */}
            {hinge &&
              [hinge.bottomHingeOffset, heightMm - hinge.topHingeOffset].map((offsetMm, k) => (
                <rect
                  key={k}
                  x={hingeOnLeft ? x - 3 : x + wPx - 5}
                  y={baselineY - offsetMm * scale - (fixed.hinges.cutoutHeightMm * scale) / 2}
                  width={8}
                  height={Math.max(4, fixed.hinges.cutoutHeightMm * scale)}
                  rx={1.5}
                  fill={finishColor}
                />
              ))}

            {/* Handle on the opposite edge to the hinges. A pull handle is
                centred on the leaf; a knob keeps a fixed grab height. */}
            {isDoor &&
              (handleId === 'knob' ? (
                <circle
                  cx={hingeOnLeft ? x + wPx - 22 : x + 22}
                  cy={baselineY - fixed.handle.knobCentreMm * scale}
                  r={5}
                  fill={finishColor}
                />
              ) : (
                <rect
                  x={hingeOnLeft ? x + wPx - 25 : x + 20}
                  y={baselineY - handleHoleHeightsMm(engine.rules, heightMm).upperMm * scale}
                  width={5}
                  height={Math.max(6, fixed.handle.holeSpacingMm * scale)}
                  rx={2.5}
                  fill={finishColor}
                />
              ))}

            <text
              x={x + wPx / 2}
              y={y - 12}
              textAnchor="middle"
              fontSize={11} fontWeight={700}
              fill={isDoor ? accent : '#334155'}
            >
              {panel.width_mm}
            </text>
            <text
              x={x + wPx / 2}
              y={baselineY + 18}
              textAnchor="middle"
              fontSize={8} fontWeight={600} letterSpacing={1.2}
              fill="#94a3b8"
            >
              {isDoor ? 'DOOR' : 'FIXED'}
              {plane === 'return_left' || plane === 'return_right' ? ' · RETURN' : ''}
            </text>

            {/* Mounting indicator at bottom */}
            {mounting === 'channel' ? (
              // U-channel shown as a line with small vertical edges
              <g>
                <line
                  x1={x}
                  y1={baselineY + 2}
                  x2={x}
                  y2={baselineY + 6}
                  stroke={finishColor}
                  strokeWidth={1.5}
                />
                <line
                  x1={x}
                  y1={baselineY + 6}
                  x2={x + wPx}
                  y2={baselineY + 6}
                  stroke={finishColor}
                  strokeWidth={1.5}
                />
                <line
                  x1={x + wPx}
                  y1={baselineY + 6}
                  x2={x + wPx}
                  y2={baselineY + 2}
                  stroke={finishColor}
                  strokeWidth={1.5}
                />
              </g>
            ) : (
              // Glass clamps shown as small rectangles at intervals
              <>
                {[0.15, 0.85].map((pos, idx) => (
                  <rect
                    key={idx}
                    x={x + wPx * pos - 3}
                    y={baselineY - 4}
                    width={6}
                    height={8}
                    rx={1}
                    fill={finishColor}
                  />
                ))}
              </>
            )}
          </g>
        );
      })}

      {/* Overall height dimension. */}
      <g>
        <line
          x1={startX - 20}
          y1={baselineY - heightPx}
          x2={startX - 20}
          y2={baselineY}
          stroke="#94a3b8"
          strokeWidth={1}
        />
        <text
          x={startX - 26}
          y={baselineY - heightPx / 2}
          textAnchor="end"
          dominantBaseline="middle"
          fontSize={10} fontWeight={700}
          fill="#64748b"
        >
          {heightMm}
        </text>
      </g>
    </svg>
  );
}
