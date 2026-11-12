/**
 * Changing a shower, for its company's staff.
 *
 * The same screens a customer uses, opened on a design that was sent, with
 * nothing only a customer needs: no progress kept in this browser, no
 * carrying on on a phone, no contact details, photos or bot check. Staff move
 * freely between the measurements, the layout and the hardware, watch the
 * drawings and cut sizes follow, and save the result as the shower's next
 * revision with a reason for the timeline. The server works it out again
 * before keeping it, as it does a customer's.
 */

import {
  buildCards,
  buildSpec,
  createDocument,
  hasDeck,
  measureScreenCount,
  runWidthsMm,
  syncRuns,
  type ConfiguratorState,
  type ViennaCutout,
} from '@setout/engine';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { DesignerConfig } from './config';
import { useEngine } from './engine';
import { MeasureDeck } from './measure/MeasureDeck';
import { MeasuredDrawings } from './measure/MeasuredDrawings';
import { MEASURED_SHEET } from './measure/sheet';
import type { Photo } from './photos';
import { HardwareStep } from './steps/HardwareStep';
import { MeasureStep } from './steps/MeasureStep';
import { SizesStep } from './steps/SizesStep';
import type { StepProps } from './steps/types';
import { drawingsToPngBase64, svgToPngBase64, type EnquiryAttachment } from './submit';
import { ElevationView } from './views/ElevationView';
import { PlanView } from './views/PlanView';

type Part = 'measure' | 'sizes' | 'hardware';

const PARTS: { id: Part; label: string }[] = [
  { id: 'measure', label: 'Measurements' },
  { id: 'sizes', label: 'Layout' },
  { id: 'hardware', label: 'Hardware and glass' },
];

export interface StaffSave {
  state: ConfiguratorState;
  reason: string;
  attachments: EnquiryAttachment[];
}

export interface StaffEditorProps {
  config: DesignerConfig;
  /** The design as the shower stands. */
  initial: ConfiguratorState;
  templateId: string | null;
  /** The revision it stands at. Saving makes the next one. */
  revision: number;
  /** Which job and shower, in words, for the top of the page. */
  title: string;
  backHref: string;
  /** Throws an Error whose message is shown, if the save is refused. */
  onSave: (save: StaffSave) => Promise<void>;
}

export function StaffEditor({ config, initial, templateId, revision, title, backHref, onSave }: StaffEditorProps) {
  const engine = useEngine();
  const [state, setState] = useState(initial);
  const [part, setPart] = useState<Part>('sizes');
  const [activePanelId, setActivePanelId] = useState<string | null>(initial.panels[0]?.id ?? null);
  const [measureCard, setMeasureCard] = useState(0);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const drawingRef = useRef<HTMLDivElement>(null);
  const measuredRef = useRef<HTMLDivElement>(null);

  const spec = useMemo(() => buildSpec(state, engine), [state, engine]);
  const startedAs = useMemo(() => JSON.stringify(createDocument(initial).design), [initial]);
  const changed = JSON.stringify(createDocument(state).design) !== startedAs;

  // Leaving with a change not saved asks first.
  useEffect(() => {
    if (!changed || saving.busy) return;
    const stay = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', stay);
    return () => window.removeEventListener('beforeunload', stay);
  }, [changed, saving.busy]);

  // As in the customer's designer: anything that reshapes the run keeps the
  // measurements in step with it.
  const update = (patch: Partial<ConfiguratorState>) =>
    setState((s) => {
      const next = { ...s, ...patch };
      if (!patch.panels && !patch.junctions) return next;
      return { ...next, opening: syncRuns(next.opening, runWidthsMm(next.panels, next.junctions)) };
    });

  const usesDeck = hasDeck(state);
  const deckOptions = useMemo(() => ({ overBath: templateId === 'over-bath' }), [templateId]);
  const screens = usesDeck ? 0 : measureScreenCount(state);

  const stepProps: StepProps = {
    config,
    state,
    update,
    activePanelId,
    setActivePanelId,
    photos,
    setPhotos,
    measureCard,
    setMeasureCard,
    templateId,
    canvasWidth: 620,
    canvasHeight: 520,
  };

  const save = async () => {
    setSaving({ busy: true, error: null });
    try {
      const attachments: EnquiryAttachment[] = [];
      const names = ['plan-view.png', 'elevation-view.png'];
      const svgs = Array.from(drawingRef.current?.querySelectorAll('svg') ?? []);
      for (const [i, svg] of svgs.entries()) {
        const png = await svgToPngBase64(svg as SVGSVGElement);
        if (png) attachments.push({ filename: names[i] ?? `drawing-${i + 1}.png`, content: png, kind: 'drawing' });
      }
      if (measuredRef.current) {
        const png = await drawingsToPngBase64(measuredRef.current);
        if (png) attachments.push({ filename: 'measurements.png', content: png, kind: 'drawing' });
      }
      await onSave({ state, reason: reason.trim(), attachments });
    } catch (error) {
      setSaving({ busy: false, error: error instanceof Error ? error.message : 'The change could not be saved. Please try again.' });
    }
  };

  const drawingWidth = Math.min(560, typeof window !== 'undefined' ? window.innerWidth - 64 : 560);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href={backHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
            <ArrowLeft className="h-4 w-4" /> Back to the job
          </a>
          <p className="min-w-0 truncate text-right text-sm text-muted-foreground">
            {title} · changing revision {revision}
          </p>
        </div>
        <nav aria-label="Parts of the design" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {PARTS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-current={part === p.id ? 'page' : undefined}
              onClick={() => setPart(p.id)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                part === p.id ? 'border-primary bg-primary font-semibold text-primary-foreground' : 'bg-background'
              }`}
            >
              {p.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
        <div className="min-w-0">
          {part === 'measure' &&
            (usesDeck ? (
              <MeasureDeck
                state={state}
                setState={setState}
                index={measureCard}
                setIndex={setMeasureCard}
                fillsViewport={false}
                options={deckOptions}
                onExit={() => setPart('sizes')}
                onDone={() => {
                  setState((s) => ({ ...s, opening: { ...s.opening, shapeConfirmed: true } }));
                  setPart('sizes');
                }}
              />
            ) : (
              <>
                <MeasureStep {...stepProps} />
                {screens > 1 && (
                  <div className="mt-4 flex justify-between gap-3">
                    <Button variant="outline" size="sm" disabled={measureCard === 0} onClick={() => setMeasureCard(measureCard - 1)}>
                      <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Previous
                    </Button>
                    <span className="self-center text-xs text-muted-foreground">
                      {Math.min(measureCard, screens - 1) + 1} of {screens}
                    </span>
                    <Button variant="outline" size="sm" disabled={measureCard >= screens - 1} onClick={() => setMeasureCard(measureCard + 1)}>
                      Next <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </>
            ))}
          {part === 'sizes' && <SizesStep {...stepProps} />}
          {part === 'hardware' && (
            <>
              <HardwareStep {...stepProps} />
              {spec.panels.some((p) => p.door?.hingeBrand === 'Vienna') && (
                <ViennaCutoutChoice
                  chosen={state.viennaCutout ?? config.hinges?.viennaCutout ?? 'mouse-ear'}
                  standard={config.hinges?.viennaCutout ?? 'mouse-ear'}
                  onChoose={(viennaCutout) => update({ viennaCutout })}
                />
              )}
            </>
          )}
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-28 lg:self-start">
          <div ref={drawingRef} className="space-y-3">
            <figure className="overflow-hidden rounded-lg border bg-card">
              <figcaption className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plan</figcaption>
              <div className="flex justify-center overflow-x-auto p-2">
                <PlanView
                  panels={state.panels}
                  junctions={state.junctions}
                  leftWall={state.leftWall}
                  rightWall={state.rightWall}
                  width={drawingWidth}
                  height={300}
                  activePanelId={activePanelId}
                  onPanelClick={setActivePanelId}
                  onToggleJunction={(i) => {
                    const junctions = [...state.junctions];
                    junctions[i] = { angle_deg: junctions[i].angle_deg === 90 ? 180 : 90 };
                    update({ junctions });
                  }}
                  accent={config.brand.primary}
                />
              </div>
            </figure>
            <figure className="overflow-hidden rounded-lg border bg-card">
              <figcaption className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Elevation</figcaption>
              <div className="flex justify-center overflow-x-auto p-2">
                <ElevationView
                  panels={state.panels}
                  junctions={state.junctions}
                  heightMm={state.heightMm}
                  handleId={state.handleId}
                  mounting={state.mounting}
                  finishColor={config.finishes.find((f) => f.id === state.finishId)?.swatch ?? '#d4d8db'}
                  width={drawingWidth}
                  height={380}
                  activePanelId={activePanelId}
                  onPanelClick={setActivePanelId}
                  accent={config.brand.primary}
                />
              </div>
            </figure>
          </div>

          <section className="rounded-lg border bg-card p-3 text-sm" aria-label="Cut sizes">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cut sizes, as this change stands</h2>
            <ul className="mt-2 divide-y">
              {spec.panels.map((panel) => (
                <li key={panel.id} className="flex justify-between gap-3 py-1.5">
                  <span>{panel.label}</span>
                  <span className="font-semibold tabular-nums">
                    {panel.cutWidthMm} × {panel.cutHeightMm}
                  </span>
                </li>
              ))}
            </ul>
            {spec.blockingIssues.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-destructive">
                {spec.blockingIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
            {spec.warnings.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {spec.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">The server works these out again when the change is saved.</p>
          </section>
        </aside>
      </main>

      <footer className="sticky bottom-0 z-20 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-end sm:px-6">
          <label className="min-w-0 flex-1 text-sm">
            <span className="font-medium">What changed, and why</span>
            <input
              type="text"
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: surveyed, the tray is 20mm narrower"
              className="mt-1 h-10 w-full rounded-md border bg-background px-3"
            />
          </label>
          <Button onClick={save} disabled={!changed || !reason.trim() || saving.busy} className="h-10">
            {saving.busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving
              </>
            ) : (
              `Save as revision ${revision + 1}`
            )}
          </Button>
        </div>
        {(saving.error || !changed) && (
          <p role={saving.error ? 'alert' : undefined} className={`mx-auto max-w-6xl px-4 pb-3 text-sm sm:px-6 ${saving.error ? 'text-destructive' : 'text-muted-foreground'}`}>
            {saving.error ?? `Nothing has changed yet. Revision ${revision} stays as it is until a change is saved.`}
          </p>
        )}
      </footer>

      {usesDeck && (
        // Off screen and out of reach, but laid out, so the readings as they
        // now stand can be drawn and kept with the revision.
        <div ref={measuredRef} aria-hidden="true" inert style={MEASURED_SHEET}>
          <MeasuredDrawings state={state} cards={buildCards(state, deckOptions)} options={deckOptions} />
        </div>
      )}
    </div>
  );
}

/** How the glass is cut for this shower's Vienna hinges: CRL draws two ways. Staff only. */
function ViennaCutoutChoice({
  chosen,
  standard,
  onChoose,
}: {
  chosen: ViennaCutout;
  standard: ViennaCutout;
  onChoose: (cutout: ViennaCutout) => void;
}) {
  const options: [ViennaCutout, string, string][] = [
    ['mouse-ear', 'Mouse ear', 'Two 16mm holes drilled as well, so the glass costs more to make.'],
    ['rectangular', 'Rectangular', 'A 12mm hole at each inner corner instead. The fitters take two screws out of each hinge.'],
  ];
  return (
    <div className="mt-6 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vienna cut-out</p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Vienna cut-out">
        {options.map(([id, name, about]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={chosen === id}
            onClick={() => onChoose(id)}
            className={`rounded-lg border p-3 text-left transition-colors ${chosen === id ? 'border-foreground bg-muted' : 'hover:bg-muted/50'}`}
          >
            <div className="font-medium">
              {name}
              {id === standard && <span className="ml-2 text-xs font-normal text-muted-foreground">Your standard</span>}
            </div>
            <div className="text-sm text-muted-foreground">{about}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
