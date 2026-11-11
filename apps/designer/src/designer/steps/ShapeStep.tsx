/**
 * Shape step — pick the layout that looks like your bathroom.
 *
 * This is the whole point of the template layer: the first thing a customer
 * does is recognise a picture, not construct a geometry.
 */

import { Check, Pencil } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { ceilingChoice, TEMPLATES, type ShowerTemplate } from '@setout/engine';
import { useEngine } from '../engine';
import { TemplateThumbnail } from '../views/TemplateThumbnail';
import type { StepProps } from './types';

interface ShapeStepProps extends StepProps {
  selectedTemplateId: string | null;
  onSelectTemplate: (template: ShowerTemplate) => void;
  onStartFromScratch: () => void;
}

export function ShapeStep({
  config,
  state,
  update,
  selectedTemplateId,
  onSelectTemplate,
  onStartFromScratch,
}: ShapeStepProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {TEMPLATES.map((t) => {
          const selected = t.id === selectedTemplateId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTemplate(t)}
              aria-pressed={selected}
              // Stacked rather than side by side: beside a 132px drawing the
              // names wrap to three lines in a two-column grid.
              className={`flex flex-col rounded-lg border p-4 text-left transition-colors ${
                selected ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
              }`}
            >
              <span className="mb-3 flex justify-center">
                <TemplateThumbnail
                  panels={t.panels}
                  junctions={t.junctions}
                  accent={config.brand.primary}
                />
              </span>
              <span className="font-semibold">{t.name}</span>
              <span className="mt-0.5 text-sm text-muted-foreground">{t.description}</span>
            </button>
          );
        })}
      </div>

      {/* The chain builder is still there for anything the presets don't cover. */}
      <button
        type="button"
        onClick={onStartFromScratch}
        aria-pressed={selectedTemplateId === null}
        className={`flex w-full items-center gap-4 rounded-lg border border-dashed p-4 text-left transition-colors ${
          selectedTemplateId === null ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
        }`}
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
          <Pencil className="h-5 w-5 text-muted-foreground" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">Something else</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            Start with a single panel and build the shape yourself. You can add panels and turn
            corners on the next step.
          </span>
        </span>
      </button>

      <p className="text-sm text-muted-foreground">
        Not sure? Pick whichever is closest — you can change every size, add panels and move the
        door on the next step.
      </p>

      <SetupQuestions config={config} state={state} update={update} />
    </div>
  );
}

/**
 * Asked before measuring starts, because each changes what comes next.
 *
 * Whether they have a laser decides which instructions every measuring card
 * shows. Whether the glass goes to the ceiling decides which readings are
 * taken. The finish is a preference taken early so the hinge offered later
 * can match it where the door's size and weight allow. All can be changed
 * later.
 */
function SetupQuestions({
  config,
  state,
  update,
}: Pick<StepProps, 'config' | 'state' | 'update'>) {
  const { rules } = useEngine();
  const method = state.opening.method;
  const setMethod = (next: 'laser' | 'packers') =>
    update({ opening: { ...state.opening, method: next, shapeConfirmed: false } });

  return (
    <section className="space-y-5 rounded-lg border p-4">
      <h3 className="text-base font-semibold">Before you measure</h3>

      <div className="space-y-2">
        <Label className="text-sm">Do you have a laser level?</Label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['laser', 'Yes, I have a laser', 'We will show you the laser method.'],
              ['packers', 'No laser', 'You will use masking tape, a spirit level and packers.'],
            ] as const
          ).map(([id, label, blurb]) => {
            const selected = id === 'laser' ? method === 'laser' : method !== null && method !== 'laser';
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => setMethod(id)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  selected ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
                }`}
              >
                <span className="block text-sm font-medium">{label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{blurb}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Where does the glass stop?</Label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              [false, 'A set height', 'The glass stops short of the ceiling.'],
              [true, 'Up to the ceiling', 'The glass fills the full height.'],
            ] as const
          ).map(([toCeiling, label, blurb]) => {
            const selected = state.isFloorToCeiling === toCeiling;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={selected}
                onClick={() => update(ceilingChoice(rules, state, toCeiling))}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  selected ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
                }`}
              >
                <span className="block text-sm font-medium">{label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{blurb}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Which finish would you like for the hardware?</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {config.finishes.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={state.finishId === f.id}
              onClick={() => update({ finishId: f.id })}
              className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
                state.finishId === f.id ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
              }`}
            >
              <span
                className="h-5 w-5 shrink-0 rounded-full border"
                style={{ background: f.swatch }}
                aria-hidden
              />
              <span className="min-w-0 text-xs font-medium">{f.label}</span>
              {state.finishId === f.id && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          This is your preference. Once we know the door size, we check which hinges come in this
          finish and will carry your door.
        </p>
      </div>
    </section>
  );
}
