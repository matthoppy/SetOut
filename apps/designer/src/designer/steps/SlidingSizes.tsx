/**
 * Layout step for a sliding door.
 *
 * A sliding shower is one fixed panel and one sliding door, and both are cut
 * from the whole opening to the maker's formula. So there are no widths to
 * share out here, no hinges and no swing: only which side the door closes to.
 * The sizes shown are the engine's own, the same the company will receive.
 */

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { buildSpec, runPanelIndices } from '@setout/engine';
import { useEngine } from '../engine';
import type { StepProps } from './types';

export function SlidingSizes({ state, update }: StepProps) {
  const engine = useEngine();
  const spec = useMemo(() => buildSpec(state, engine), [state, engine]);
  const sliding = spec.sliding;
  const doorIndex = state.panels.findIndex((p) => p.kind === 'door');
  const run = runPanelIndices(state.panels, state.junctions).find((r) => r.includes(doorIndex)) ?? [];
  const fixedIndex = run.find((i) => i !== doorIndex);

  /** The door and the fixed panel change places; nothing about the opening changes. */
  const closeTo = (side: 'left' | 'right') => {
    if (!sliding || sliding.doorCloses === side || fixedIndex === undefined) return;
    const panels = [...state.panels];
    [panels[doorIndex], panels[fixedIndex]] = [panels[fixedIndex], panels[doorIndex]];
    update({ panels });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border p-4">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">The sliding door</Label>
        <p className="text-sm text-muted-foreground">
          One fixed panel and one sliding door, each a little over half the width you measured. The door slides across the fixed
          panel on a bar along the top, and closes against the wall.
        </p>
        {sliding && (
          <div className="space-y-2">
            <Label className="text-sm">Which side does the door close to, seen from outside the shower?</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['left', 'right'] as const).map((side) => (
                <Button key={side} variant={sliding.doorCloses === side ? 'default' : 'outline'} onClick={() => closeTo(side)} className="capitalize">
                  {side}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border">
        <div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium">Glass sizes, worked out from your opening</div>
        <div className="divide-y text-sm">
          {spec.panels.map((p) => (
            <div key={p.id} className="flex items-baseline justify-between gap-3 px-3 py-2.5">
              <span className="font-medium">{p.label.split(' — ')[1] ?? p.label}</span>
              <span className="font-mono tabular-nums">
                {p.cutWidthMm} × {p.cutHeightMm} mm
              </span>
            </div>
          ))}
        </div>
        {sliding && (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            The opening is {sliding.overallWidthMm}mm wide. With the door slid right back, the way in is about {sliding.clearOpeningMm}mm.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        To change the width, go back to Measure. {engine.companyName} will check every sliding door size before any glass is ordered.
      </p>
    </div>
  );
}
