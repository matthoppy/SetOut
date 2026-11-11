/**
 * Shape step — pick the layout that looks like your bathroom.
 *
 * This is the whole point of the template layer: the first thing a customer
 * does is recognise a picture, not construct a geometry.
 */

import { useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ceilingChoice, hasTransom, TEMPLATES, type ShowerTemplate } from '@setout/engine';
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

/** The shortest and tallest a door under a transom is taken to be. Outside this it is a slip of the finger. */
const DOOR_HEIGHT_MM = { min: 1500, max: 2600 };

/**
 * A box for the door's height. What is typed is only written into the design
 * once it is a height a door could be, so a half-typed number is never sent.
 */
function DoorHeightBox({ heightMm, usualMm, onChange }: { heightMm: number; usualMm: number; onChange: (heightMm: number) => void }) {
  const [text, setText] = useState(String(heightMm));
  const typed = text === '' ? usualMm : Number(text);
  const ok = typed >= DOOR_HEIGHT_MM.min && typed <= DOOR_HEIGHT_MM.max;
  return (
    <div className="w-28">
      <div className="relative">
        <Input
          id="door-height"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-invalid={!ok}
          className={`h-10 pr-10 text-right tabular-nums ${ok ? '' : 'border-red-500'}`}
          value={text}
          placeholder={String(usualMm)}
          onChange={(e) => {
            const next = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
            setText(next);
            // An empty box goes back to the usual height.
            const value = next === '' ? usualMm : Number(next);
            if (value >= DOOR_HEIGHT_MM.min && value <= DOOR_HEIGHT_MM.max) onChange(value);
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">mm</span>
      </div>
      {!ok && (
        <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">
          {DOOR_HEIGHT_MM.min} to {DOOR_HEIGHT_MM.max}
        </p>
      )}
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

      {hasTransom(state) && (
        // A door with other glass, going to the ceiling: the fixed glass goes
        // all the way up and the door stops short, so something is above it.
        <div className="space-y-2">
          <Label className="text-sm">What goes above the door?</Label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['open', 'Leave it open', 'A gap above the door, to let air and steam out.'],
                ['glass', 'Glass', 'A fixed piece of glass above the door, up to the ceiling.'],
              ] as const
            ).map(([id, label, blurb]) => {
              const selected = state.aboveDoor === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => update({ aboveDoor: id })}
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
          <div className="flex items-center gap-3 pt-1">
            <Label htmlFor="door-height" className="flex-1 text-sm">
              How tall should the door be?
              <span className="block text-xs font-normal text-muted-foreground">
                {rules.making.heights.transomDoorHeightMm}mm is usual. A shorter door leaves more above it.
              </span>
            </Label>
            <DoorHeightBox
              heightMm={state.doorHeightMm ?? rules.making.heights.transomDoorHeightMm}
              usualMm={rules.making.heights.transomDoorHeightMm}
              onChange={(doorHeightMm) => update({ doorHeightMm })}
            />
          </div>
        </div>
      )}

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
