/**
 * Hardware step — fixing method, finish, handle and glass.
 *
 * Options come from the config's catalog, so each glazier only offers what
 * they actually stock.
 */

import { Label } from '@/components/ui/label';
import { Check } from 'lucide-react';
import type { StepProps } from './types';
import type { GlassType, GlassCoating } from '@setout/engine';
import { thicknessesOf } from '../config';

const GLASS_TYPES: { id: GlassType; label: string; description: string }[] = [
  { id: 'clear', label: 'Clear', description: 'Standard clear glass' },
  { id: 'low-iron', label: 'Low Iron', description: 'Ultra-clear with minimal green tint' },
  { id: 'satin', label: 'Satin / Frosted', description: 'Translucent privacy glass' },
  { id: 'bronze', label: 'Bronze Tinted', description: 'Warm bronze tint' },
  { id: 'grey', label: 'Grey Tinted', description: 'Neutral grey tint' },
];

const GLASS_COATINGS: { id: GlassCoating; label: string; description: string }[] = [
  { id: 'none', label: 'None', description: 'Standard glass' },
  { id: 'easy-clean', label: 'Easy-clean coating', description: 'Protective coating that repels water and soap' },
];

export function HardwareStep({ config, state, update }: StepProps) {
  const thicknesses = thicknessesOf(config);
  const standard = config.glassThicknessMm;
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Fixing method
        </Label>
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => update({ mounting: 'channel' })}
            className={`rounded-lg border p-4 text-left transition-colors ${
              state.mounting === 'channel' ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
            }`}
          >
            <div className="font-semibold">U-channel</div>
            <div className="text-sm text-muted-foreground">
              Slim profile along the wall and floor. Most popular, and the most forgiving of walls
              that are out of plumb.
            </div>
          </button>
          <button
            type="button"
            onClick={() => update({ mounting: 'clamps' })}
            className={`rounded-lg border p-4 text-left transition-colors ${
              state.mounting === 'clamps' ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
            }`}
          >
            <div className="font-semibold">Glass clamps</div>
            <div className="text-sm text-muted-foreground">
              Minimal hardware for a fully frameless look. Needs a straighter wall and a silicone
              seal down the edge.
            </div>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Finish
        </Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {config.finishes.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => update({ finishId: f.id })}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                state.finishId === f.id ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
              }`}
            >
              <span
                className="h-6 w-6 shrink-0 rounded-full border"
                style={{ background: f.swatch }}
                aria-hidden
              />
              <span className="text-sm font-medium">{f.label}</span>
              {state.finishId === f.id && <Check className="ml-auto h-4 w-4" />}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Handle
        </Label>
        <div className="grid gap-2">
          {config.handles.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => update({ handleId: h.id })}
              className={`rounded-lg border p-3 text-left transition-colors ${
                state.handleId === h.id ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
              }`}
            >
              <div className="font-medium">{h.label}</div>
              <div className="text-sm text-muted-foreground">{h.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Glass type
        </Label>
        <div className="grid gap-2">
          {GLASS_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => update({ glassType: type.id })}
              className={`rounded-lg border p-3 text-left transition-colors ${
                state.glassType === type.id ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
              }`}
            >
              <div className="font-medium">{type.label}</div>
              <div className="text-sm text-muted-foreground">{type.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Glass thickness
        </Label>
        {thicknesses.length > 1 ? (
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Glass thickness">
            {thicknesses.map((mm) => (
              <button
                key={mm}
                type="button"
                role="radio"
                aria-checked={state.glassThicknessMm === mm}
                onClick={() => update({ glassThicknessMm: mm })}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  state.glassThicknessMm === mm ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
                }`}
              >
                <div className="font-medium">{mm}mm</div>
                <div className="text-sm text-muted-foreground">
                  {mm === standard ? 'Our standard' : mm < standard ? 'Lighter' : 'Heavier, more solid'}
                </div>
              </button>
            ))}
          </div>
        ) : (
          // One thickness on offer, so there is nothing to choose.
          <div className="rounded-lg border bg-muted p-3">
            <div className="font-medium">{standard}mm toughened safety glass</div>
            <div className="text-sm text-muted-foreground">Every panel and door we make is {standard}mm.</div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Coating
        </Label>
        <div className="grid gap-2">
          {GLASS_COATINGS.map((coating) => (
            <button
              key={coating.id}
              type="button"
              onClick={() => update({ glassCoating: coating.id })}
              className={`rounded-lg border p-3 text-left transition-colors ${
                state.glassCoating === coating.id ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
              }`}
            >
              <div className="font-medium">{coating.label}</div>
              <div className="text-sm text-muted-foreground">{coating.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
