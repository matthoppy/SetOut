/**
 * Top-down plan of the run.
 *
 * This is the view that makes the shape legible — corners, which way the door
 * swings, and how the panels sit against the walls. Panels are clickable so
 * the customer can select one and edit it.
 */

import { useMemo } from 'react';
import { junctionPoint, runEnds, traceChain } from '@setout/engine';
import type { ConfiguratorJunction, ConfiguratorPanel } from '@setout/engine';

interface PlanViewProps {
  panels: ConfiguratorPanel[];
  junctions: ConfiguratorJunction[];
  leftWall: boolean;
  rightWall: boolean;
  width?: number;
  height?: number;
  activePanelId?: string | null;
  onPanelClick?: (id: string) => void;
  onToggleJunction?: (index: number) => void;
  accent?: string;
  /**
   * Measuring: the panels being measured right now. Everything else is dimmed
   * so the drawing follows the customer around the bathroom. Null leaves the
   * plan as it is on the other steps.
   */
  highlightPanelIds?: string[] | null;
  /** Measuring: the wall being checked right now. */
  highlightWall?: 'left' | 'right' | null;
  /** A sliding door: drawn with no swing, since it has none. */
  sliding?: boolean;
}

const GLASS_STROKE = 7;
const PADDING = 130;

export function PlanView({
  panels,
  junctions,
  leftWall,
  rightWall,
  width = 620,
  height = 560,
  activePanelId,
  onPanelClick,
  onToggleJunction,
  accent = '#2563eb',
  highlightPanelIds = null,
  highlightWall = null,
  sliding = false,
}: PlanViewProps) {
  // Every hook runs unconditionally — an empty or door-less run is valid and
  // must not short-circuit before this point.
  const trace = useMemo(() => traceChain(panels, junctions), [panels, junctions]);

  const { scale, offsetX, offsetY } = useMemo(() => {
    // The door's swing arc sweeps a quarter circle out in front of the run.
    // It sits outside the panel bounding box, so fold it in before scaling —
    // otherwise the arc is drawn clipped off the bottom of the viewport.
    const door = panels[trace.anchorIndex];
    const swingReach = door?.kind === 'door' && !sliding ? door.width_mm : 0;

    const minX = trace.minX;
    const maxX = trace.maxX;
    const minY = trace.minY;
    const maxY = Math.max(trace.maxY, swingReach);

    const contentW = maxX - minX || 1000;
    const contentH = maxY - minY || 1000;
    const s = Math.min((width - PADDING) / contentW, (height - PADDING) / contentH);
    return {
      scale: s,
      offsetX: width / 2 - (minX + contentW / 2) * s,
      offsetY: height / 2 - (minY + contentH / 2) * s,
    };
  }, [trace, panels, width, height]);

  if (panels.length === 0) return null;

  const tx = (x: number) => x * scale + offsetX;
  const ty = (y: number) => y * scale + offsetY;

  const doorSeg = trace.segments[trace.anchorIndex];
  const doorPanel = panels[trace.anchorIndex];
  const hasDoor = doorPanel?.kind === 'door' && !sliding;
  const ends = runEnds(trace, panels.length);
  const measuring = highlightPanelIds !== null || highlightWall !== null;
  const isLit = (id: string) => !!highlightPanelIds?.includes(id);

  return (
    <svg width={width} height={height} className="select-none" role="img" aria-label="Top-down plan of the shower enclosure">
      <defs>
        <marker id="plan-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <polygon points="0 0, 7 3.5, 0 7" fill="#94a3b8" />
        </marker>
      </defs>

      {/* Door swing arc, drawn under the glass so the panel reads on top. */}
      {hasDoor && doorSeg && (() => {
        const hingeAtLeft = doorPanel.door?.hinge_side === 'left';
        const pivotX = hingeAtLeft ? doorSeg.x1 : doorSeg.x2;
        const radius = doorPanel.width_mm;
        // Swinging out through 90° brings the free edge round to sit directly
        // in front of the pivot, so the arc ends at the pivot's x.
        return (
          <g>
            <path
              d={`M ${tx(pivotX)} ${ty(0)}
                  L ${tx(hingeAtLeft ? pivotX + radius : pivotX - radius)} ${ty(0)}
                  A ${radius * scale} ${radius * scale} 0 0 ${hingeAtLeft ? 1 : 0} ${tx(pivotX)} ${ty(radius)}
                  Z`}
              fill={accent}
              fillOpacity={0.06}
              stroke={accent}
              strokeOpacity={0.35}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          </g>
        );
      })()}

      {/* Walls at each end of the run. */}
      {leftWall && ends.left && (
        <WallTick
          x={tx(ends.left.x)}
          y={ty(ends.left.y)}
          dx={ends.left.dx}
          dy={ends.left.dy}
          label="WALL"
          lit={highlightWall === 'left'}
          dim={measuring && highlightWall !== 'left' && highlightWall !== null}
          accent={accent}
        />
      )}
      {rightWall && ends.right && (
        <WallTick
          x={tx(ends.right.x)}
          y={ty(ends.right.y)}
          dx={ends.right.dx}
          dy={ends.right.dy}
          label="WALL"
          lit={highlightWall === 'right'}
          dim={measuring && highlightWall !== 'right' && highlightWall !== null}
          accent={accent}
        />
      )}

      {/* Glass. */}
      {trace.segments.map((seg) => {
        const panel = panels[seg.index];
        const isActive = panel.id === activePanelId;
        const isDoor = panel.kind === 'door';
        const midX = tx((seg.x1 + seg.x2) / 2);
        const midY = ty((seg.y1 + seg.y2) / 2);
        const vertical = Math.abs(seg.dy) > Math.abs(seg.dx);
        const lit = isLit(panel.id);
        // While measuring, glass that is not being measured steps back.
        const dimmed = measuring && !lit;

        return (
          <g
            key={panel.id}
            onClick={() => onPanelClick?.(panel.id)}
            style={{ cursor: onPanelClick ? 'pointer' : 'default' }}
            opacity={dimmed ? 0.3 : 1}
          >
            {/* Fat transparent hit area so thin glass is still easy to click. */}
            <line
              x1={tx(seg.x1)}
              y1={ty(seg.y1)}
              x2={tx(seg.x2)}
              y2={ty(seg.y2)}
              stroke="transparent"
              strokeWidth={22}
            />
            {lit && (
              // A soft halo under the measured run: the one thing on the
              // drawing that moves, so the eye finds it before reading.
              <line
                x1={tx(seg.x1)}
                y1={ty(seg.y1)}
                x2={tx(seg.x2)}
                y2={ty(seg.y2)}
                stroke={accent}
                strokeWidth={GLASS_STROKE + 12}
                strokeLinecap="round"
                opacity={0.22}
                className="measure-pulse"
              />
            )}
            <line
              x1={tx(seg.x1)}
              y1={ty(seg.y1)}
              x2={tx(seg.x2)}
              y2={ty(seg.y2)}
              stroke={isDoor || lit ? accent : '#0f172a'}
              strokeWidth={isActive || lit ? GLASS_STROKE + 3 : GLASS_STROKE}
              strokeLinecap="round"
              opacity={isActive || lit ? 1 : 0.85}
            />
            <text
              x={vertical ? midX + 16 : midX}
              y={vertical ? midY : midY - 14}
              textAnchor={vertical ? 'start' : 'middle'}
              dominantBaseline="middle"
              fontSize={11} fontWeight={700}
              fill={isDoor ? accent : '#334155'}
            >
              {panel.width_mm}
            </text>
            <text
              x={vertical ? midX + 16 : midX}
              y={vertical ? midY + 14 : midY + 20}
              textAnchor={vertical ? 'start' : 'middle'}
              dominantBaseline="middle"
              fontSize={9} fontWeight={600} letterSpacing={1.5}
              fill="#94a3b8"
            >
              {isDoor ? 'DOOR' : 'FIXED'}
            </text>
          </g>
        );
      })}

      {/* Corner handles — click to straighten or turn. */}
      {junctions.map((j, i) => {
        const point = junctionPoint(trace, i);
        if (!point) return null;
        const cx = tx(point.x);
        const cy = ty(point.y);
        return (
          <g
            key={`junction-${i}`}
            onClick={() => onToggleJunction?.(i)}
            style={{ cursor: onToggleJunction ? 'pointer' : 'default' }}
          >
            <circle cx={cx} cy={cy} r={11} fill="#ffffff" stroke="#cbd5e1" strokeWidth={2} />
            <text
              x={cx}
              y={cy + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={8} fontWeight={800}
              fill="#475569"
            >
              {j.angle_deg}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Wall at the end of the run, drawn square to the panel it abuts. `dx`/`dy` is
 * the panel's direction of travel; the wall face sits perpendicular to it.
 */
function WallTick({
  x,
  y,
  dx,
  dy,
  label,
  lit = false,
  dim = false,
  accent = '#2563eb',
}: {
  x: number;
  y: number;
  dx: number;
  dy: number;
  label: string;
  /** This is the wall being checked right now. */
  lit?: boolean;
  /** Another wall is being checked; this one steps back. */
  dim?: boolean;
  accent?: string;
}) {
  // Perpendicular to the panel, so the wall reads as a face rather than a
  // stray dash floating alongside a vertical return.
  const px = -dy;
  const py = dx;
  const half = lit ? 26 : 20;

  return (
    <g opacity={dim ? 0.35 : 1}>
      {lit && (
        <line
          x1={x - px * half}
          y1={y - py * half}
          x2={x + px * half}
          y2={y + py * half}
          stroke={accent}
          strokeWidth={14}
          strokeLinecap="round"
          opacity={0.22}
          className="measure-pulse"
        />
      )}
      {/* The wall face sits on the end of the run, where the glass meets it. */}
      <line
        x1={x - px * half}
        y1={y - py * half}
        x2={x + px * half}
        y2={y + py * half}
        stroke={lit ? accent : '#94a3b8'}
        strokeWidth={lit ? 5 : 3}
      />
      {/* Label goes beyond the wall, not back over the glass. */}
      <text
        x={x + dx * 30}
        y={y + dy * 30}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={9}
        fontWeight={700}
        letterSpacing={1.5}
        fill={lit ? accent : '#94a3b8'}
      >
        {label}
      </text>
    </g>
  );
}
