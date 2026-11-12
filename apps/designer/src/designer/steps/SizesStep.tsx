/**
 * Layout step — how the opening is divided into panels.
 *
 * The overall size and the condition of the walls and floor are settled in the
 * Measure step before this one. What is left is the arrangement: how wide each
 * panel is, which one is the door, and which way it opens.
 *
 * The template has already set the shape, so the default view is nothing but
 * labelled width boxes. Everything that lets you change the shape itself lives
 * under "More options", where it is available without being in the way.
 */

import { useMemo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { CornerUpRight, Plus, Trash2 } from 'lucide-react';
import { derivePlanes, runPanelIndices } from '@setout/engine';
import { runNames } from '@setout/engine';
import { rebalanceRun, scaleRunPanels } from '@setout/engine';
import { createPanel, type ConfiguratorPanel, type PanelKind } from '@setout/engine';
import { SlidingSizes } from './SlidingSizes';
import type { StepProps } from './types';

/** Name a panel the way a customer would point at it, not by index. */
function panelLabels(panels: ConfiguratorPanel[], junctions: { angle_deg: 90 | 180 }[]): string[] {
  const planes = derivePlanes(panels, junctions);
  const frontFixedCount = planes.filter((p, i) => p === 'front' && panels[i].kind === 'fixed').length;
  let frontFixedSeen = 0;

  return panels.map((panel, i) => {
    const plane = planes[i];
    if (panel.kind === 'door') return 'Door';
    if (plane === 'return_left') return 'Left side panel';
    if (plane === 'return_right') return 'Right side panel';
    if (plane === 'back') return 'Back panel';
    frontFixedSeen += 1;
    return frontFixedCount > 1 ? `Fixed panel ${frontFixedSeen}` : 'Fixed panel';
  });
}

/** The layout step: a sliding door's own, or the panels and the hinged door. */
export function SizesStep(props: StepProps) {
  return props.state.sliding ? <SlidingSizes {...props} /> : <HingedSizes {...props} />;
}

function HingedSizes({ state, update }: StepProps) {
  const labels = useMemo(
    () => panelLabels(state.panels, state.junctions),
    [state.panels, state.junctions]
  );
  const doorIndex = state.panels.findIndex((p) => p.kind === 'door');
  const doorPanel = doorIndex >= 0 ? state.panels[doorIndex] : null;
  const runs = useMemo(() => runPanelIndices(state.panels, state.junctions), [state.panels, state.junctions]);
  const names = useMemo(() => runNames(state), [state]);
  const measuredFor = (runIndex: number) => state.opening.runs[runIndex]?.widthAtFloorMm ?? 0;

  const patchPanel = (id: string, patch: Partial<ConfiguratorPanel>) =>
    update({ panels: state.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  /**
   * A panel's width is set against the run it sits in. The run was measured,
   * so it does not change here: the other panels in it take up the
   * difference. The door is the size the customer cares about, and the fixed
   * panel is whatever is left.
   */
  const setPanelWidth = (index: number, widthMm: number) => {
    const runIndex = runs.findIndex((r) => r.includes(index));
    const indices = runs[runIndex] ?? [index];
    const measured = measuredFor(runIndex);
    if (indices.length < 2 || !measured) {
      patchPanel(state.panels[index].id, { width_mm: widthMm });
      return;
    }
    update({ panels: rebalanceRun(state.panels, indices, index, widthMm, measured) });
  };

  /** Fit a run's panels to its measured width after the chain has changed. */
  const fitRuns = (panels: ConfiguratorPanel[], junctions: typeof state.junctions): ConfiguratorPanel[] => {
    const nextRuns = runPanelIndices(panels, junctions);
    // Only when the runs still line up with what was measured: a new corner
    // is a new wall, which has not been measured yet.
    if (nextRuns.length !== state.opening.runs.length) return panels;
    return nextRuns.reduce((acc, indices, i) => {
      const measured = measuredFor(i);
      return measured ? scaleRunPanels(acc, indices, measured) : acc;
    }, panels);
  };

  const addPanel = (side: 'left' | 'right', kind: PanelKind) => {
    const panel = createPanel(kind, Date.now());
    const panels = side === 'left' ? [panel, ...state.panels] : [...state.panels, panel];
    const junctions =
      side === 'left'
        ? [{ angle_deg: 180 as const }, ...state.junctions]
        : [...state.junctions, { angle_deg: 180 as const }];
    update({ panels: fitRuns(panels, junctions), junctions });
  };

  const removePanel = (id: string) => {
    if (state.panels.length <= 1) return;
    const index = state.panels.findIndex((p) => p.id === id);
    const junctions = [...state.junctions];
    junctions.splice(index === 0 ? 0 : index - 1, 1);
    const panels = state.panels.filter((p) => p.id !== id);
    update({ panels: fitRuns(panels, junctions), junctions });
  };

  const setNotch = (id: string, patch: Partial<NonNullable<ConfiguratorPanel['notches']>>) => {
    const panel = state.panels.find((p) => p.id === id);
    if (!panel) return;
    const base = panel.notches ?? {
      bottom_left: false,
      bottom_right: false,
      width_mm: 50,
      height_mm: 50,
    };
    patchPanel(id, { notches: { ...base, ...patch } });
  };

  return (
    <div className="space-y-6">
      {/* Widths, grouped by the run they were measured as. */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Panel widths (mm)
        </Label>
        <div className="space-y-3">
          {runs.map((indices, r) => {
            const measured = measuredFor(r);
            const single = indices.length === 1;
            return (
              <div key={r} className="rounded-lg border">
                <div className="flex items-baseline justify-between gap-3 border-b bg-muted/40 px-3 py-2 text-xs">
                  <span className="font-medium">
                    {runs.length > 1 ? names[r].charAt(0).toUpperCase() + names[r].slice(1) : 'The opening'}
                  </span>
                  {measured > 0 && (
                    <span className="text-muted-foreground">
                      {measured}mm measured along the floor
                    </span>
                  )}
                </div>
                <div className="divide-y">
                  {indices.map((i) => {
                    const panel = state.panels[i];
                    return (
                      <div key={panel.id} className="flex items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
                        <span className="min-w-0 flex-1 text-xs font-medium sm:text-sm">{labels[i]}</span>
                        <div className="relative">
                          <Input
                            type="number"
                            inputMode="numeric"
                            aria-label={`${labels[i]} width in millimetres`}
                            value={panel.width_mm}
                            readOnly={single && measured > 0}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              setPanelWidth(i, Number.isNaN(v) ? 0 : v);
                            }}
                            className={`w-24 pr-9 text-sm tabular-nums sm:w-32 ${single && measured > 0 ? 'bg-muted/60 text-muted-foreground' : ''}`}
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            mm
                          </span>
                        </div>
                        {state.panels.length > 1 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removePanel(panel.id)}
                            aria-label={`Remove ${labels[i]}`}
                            className="h-8 w-8 p-0 sm:h-9 sm:w-9"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive sm:h-4 sm:w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {single && measured > 0 && (
                  <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                    This is the width you measured. To change it, go back to Measure.
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          The panels in a run always add up to the width you measured for it: change one and the
          others take up the difference. We take off the allowances for channels and seals ourselves.
        </p>
      </div>

      {/* The door choices a customer actually cares about. */}
      {doorPanel?.door && (
        <div className="space-y-4 rounded-lg border p-4">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            The door
          </Label>

          <div className="space-y-2">
            <Label className="text-sm">Which side are the hinges on?</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['left', 'right'] as const).map((side) => (
                <Button
                  key={side}
                  variant={doorPanel.door!.hinge_side === side ? 'default' : 'outline'}
                  onClick={() =>
                    patchPanel(doorPanel.id, { door: { ...doorPanel.door!, hinge_side: side } })
                  }
                  className="capitalize"
                >
                  {side}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Which way does it open?</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={doorPanel.door.swing === 'out' ? 'default' : 'outline'}
                onClick={() => patchPanel(doorPanel.id, { door: { ...doorPanel.door!, swing: 'out' } })}
              >
                Outwards
              </Button>
              <Button
                variant={doorPanel.door.swing === 'both' ? 'default' : 'outline'}
                onClick={() => patchPanel(doorPanel.id, { door: { ...doorPanel.door!, swing: 'both' } })}
              >
                Both ways
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Everything that changes the shape, out of the way but not hidden. */}
      <Accordion type="multiple" className="rounded-lg border px-4">
        <AccordionItem value="layout" className="border-b-0">
          <AccordionTrigger className="text-sm">Change the shape</AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => addPanel('left', 'fixed')}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Panel on the left
              </Button>
              <Button variant="outline" size="sm" onClick={() => addPanel('right', 'fixed')}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Panel on the right
              </Button>
            </div>

            {doorIndex === -1 && (
              <Button variant="secondary" size="sm" className="w-full" onClick={() => addPanel('right', 'door')}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add a door
              </Button>
            )}

            {state.junctions.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Where the panels meet</Label>
                {state.junctions.map((j, i) => (
                  <div key={i} className="space-y-2">
                    <span className="text-sm font-medium">
                      {labels[i]} to {labels[i + 1]}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant={j.angle_deg === 180 ? 'default' : 'outline'}
                        onClick={() => {
                          const junctions = [...state.junctions];
                          junctions[i] = { angle_deg: 180 };
                          update({ junctions });
                        }}
                      >
                        180° (In line)
                      </Button>
                      <Button
                        size="sm"
                        variant={j.angle_deg === 90 ? 'default' : 'outline'}
                        onClick={() => {
                          const junctions = [...state.junctions];
                          junctions[i] = { angle_deg: 90 };
                          update({ junctions });
                        }}
                      >
                        <CornerUpRight className="mr-1.5 h-3.5 w-3.5" />
                        90° (Corner)
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Ends against a wall</Label>
              <div className="flex items-center gap-6">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={state.leftWall}
                    onCheckedChange={(v) => update({ leftWall: v === true })}
                  />
                  Left
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={state.rightWall}
                    onCheckedChange={(v) => update({ rightWall: v === true })}
                  />
                  Right
                </label>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="notches" className="border-b-0">
          <AccordionTrigger className="text-sm">Cut-outs at the bottom</AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-xs text-muted-foreground">
              For a tiled upstand, a bath edge or a step the glass has to sit around.
            </p>
            {state.panels.map((panel, i) => (
              <div key={panel.id} className="space-y-2 rounded border p-3">
                <span className="text-sm font-medium">{labels[i]}</span>
                <div className="flex items-center gap-5">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={panel.notches?.bottom_left ?? false}
                      onCheckedChange={(v) => setNotch(panel.id, { bottom_left: v === true })}
                    />
                    Bottom left
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={panel.notches?.bottom_right ?? false}
                      onCheckedChange={(v) => setNotch(panel.id, { bottom_right: v === true })}
                    />
                    Bottom right
                  </label>
                </div>
                {(panel.notches?.bottom_left || panel.notches?.bottom_right) && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs">Width (mm)</Label>
                      <Input
                        type="number"
                        value={panel.notches?.width_mm ?? 50}
                        onChange={(e) =>
                          setNotch(panel.id, { width_mm: parseInt(e.target.value, 10) || 0 })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Height (mm)</Label>
                      <Input
                        type="number"
                        value={panel.notches?.height_mm ?? 50}
                        onChange={(e) =>
                          setNotch(panel.id, { height_mm: parseInt(e.target.value, 10) || 0 })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </AccordionContent>
        </AccordionItem>

      </Accordion>
    </div>
  );
}
