/**
 * Small plan icon for a template card.
 *
 * Drawn from the same traceChain the real plan view uses, so a template can
 * never end up illustrated as one shape and built as another. No dimensions or
 * labels — at this size the customer is matching a silhouette to their
 * bathroom, not reading measurements.
 */

import { useMemo } from 'react';
import { traceChain } from '@setout/engine';
import type { ConfiguratorJunction, ConfiguratorPanel } from '@setout/engine';

interface TemplateThumbnailProps {
  panels: ConfiguratorPanel[];
  junctions: ConfiguratorJunction[];
  /** A sliding door: drawn with no swing, since it has none. */
  sliding?: boolean;
  width?: number;
  height?: number;
  accent?: string;
}

const PADDING = 26;

export function TemplateThumbnail({
  panels,
  junctions,
  sliding = false,
  width = 132,
  height = 96,
  accent = '#2563eb',
}: TemplateThumbnailProps) {
  const trace = useMemo(() => traceChain(panels, junctions), [panels, junctions]);

  const { scale, offsetX, offsetY } = useMemo(() => {
    const anchor = panels[trace.anchorIndex];
    // Include the door's swing so the arc is not clipped, same as the plan view.
    const swing = anchor?.kind === 'door' && !sliding ? anchor.width_mm : 0;
    const minX = trace.minX;
    const minY = trace.minY;
    const contentW = trace.maxX - minX || 1000;
    const contentH = Math.max(trace.maxY, swing) - minY || 1000;
    const s = Math.min((width - PADDING) / contentW, (height - PADDING) / contentH);
    return {
      scale: s,
      offsetX: width / 2 - (minX + contentW / 2) * s,
      offsetY: height / 2 - (minY + contentH / 2) * s,
    };
  }, [trace, panels, sliding, width, height]);

  if (panels.length === 0) return null;

  const tx = (x: number) => x * scale + offsetX;
  const ty = (y: number) => y * scale + offsetY;

  const anchor = panels[trace.anchorIndex];
  const anchorSeg = trace.segments[trace.anchorIndex];
  const hasDoor = anchor?.kind === 'door' && !sliding;

  return (
    <svg width={width} height={height} aria-hidden="true" className="shrink-0">
      {hasDoor && anchorSeg && (() => {
        const hingeAtLeft = anchor.door?.hinge_side === 'left';
        const pivotX = hingeAtLeft ? anchorSeg.x1 : anchorSeg.x2;
        const r = anchor.width_mm;
        return (
          <path
            d={`M ${tx(pivotX)} ${ty(0)}
                L ${tx(hingeAtLeft ? pivotX + r : pivotX - r)} ${ty(0)}
                A ${r * scale} ${r * scale} 0 0 ${hingeAtLeft ? 1 : 0} ${tx(pivotX)} ${ty(r)}
                Z`}
            fill={accent}
            fillOpacity={0.08}
            stroke={accent}
            strokeOpacity={0.3}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        );
      })()}

      {trace.segments.map((seg) => {
        const panel = panels[seg.index];
        return (
          <line
            key={panel.id}
            x1={tx(seg.x1)}
            y1={ty(seg.y1)}
            x2={tx(seg.x2)}
            y2={ty(seg.y2)}
            stroke={panel.kind === 'door' ? accent : '#334155'}
            strokeWidth={panel.kind === 'door' ? 4 : 5}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
