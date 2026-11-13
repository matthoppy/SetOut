/**
 * Hardware step — fixing method, finish, handle and glass.
 *
 * Every option comes from the company's settings, so each glazier only
 * offers what they actually stock. Where the company offers one, it is shown
 * as it is, with nothing to choose.
 */

import { Label } from '@/components/ui/label';
import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { StepProps } from './types';
import {
  buildSpec,
  crlFinishCode,
  doorMountsOf,
  hingeMountOf,
  hingePhotoOf,
  GLASS_COATING_TEXT,
  GLASS_TYPE_TEXT,
  IN_LINE_HINGE_STYLES,
  MOUNTING_TEXT,
  WALL_HINGE_STYLES,
  type HingeMount,
  type HingeStyle,
} from '@setout/engine';
import { crlPhotoSrc } from '@setout/ui';
import { choicesOf, hingesOf, thicknessesOf } from '../config';
import { useEngine } from '../engine';

export function HardwareStep({ config, state, update }: StepProps) {
  const thicknesses = thicknessesOf(config);
  const standard = config.glassThicknessMm;
  const hinges = hingesOf(config);
  const { fixing, glassTypes, coatings } = choicesOf(config);
  // A sliding door has no hinges to choose, and its pull comes in its kit.
  const mounts = new Set(state.sliding ? [] : doorMountsOf(state));
  const wallChoice = mounts.has('wall-to-glass') && hinges.wall.offered.length > 1;
  const inLineChoice = mounts.has('glass-to-glass-180') && hinges.inLine.offered.length > 1;
  // The photos: each hinge from the range the door hangs on, looked up in the
  // finish chosen, and each handle's as the company's CRL number for it gives.
  const engine = useEngine();
  const spec = useMemo(() => buildSpec(state, engine), [state, engine]);
  const rangeOf = (mount: HingeMount) => spec.panels.find((p, i) => p.door && hingeMountOf(state, spec, i) === mount)?.door?.hingeBrand ?? null;
  const finishCode = crlFinishCode(config.finishes.find((f) => f.id === state.finishId));
  const handlePhoto = (h: (typeof config.handles)[number]) => h.photoIn?.[state.finishId] ?? h.photo;
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Fixing method
        </Label>
        {fixing.offered.length > 1 ? (
          <div className="grid gap-2">
            {fixing.offered.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => update({ mounting: id })}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  state.mounting === id ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
                }`}
              >
                <div className="font-semibold">{MOUNTING_TEXT[id].label}</div>
                <div className="text-sm text-muted-foreground">{MOUNTING_TEXT[id].description}</div>
              </button>
            ))}
          </div>
        ) : (
          // One fixing on offer, so there is nothing to choose.
          <div className="rounded-lg border bg-muted p-4">
            <div className="font-semibold">{MOUNTING_TEXT[state.mounting].label}</div>
            <div className="text-sm text-muted-foreground">{MOUNTING_TEXT[state.mounting].description}</div>
          </div>
        )}
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

      {wallChoice && (
        <HingeChoice
          title="Hinges to the wall"
          styles={hinges.wall.offered.map((id) => [id, WALL_HINGE_STYLES[id]])}
          range={rangeOf('wall-to-glass')}
          finishCode={finishCode}
          standard={hinges.wall.standard}
          chosen={state.wallHinge ?? hinges.wall.standard}
          onChoose={(id) => update({ wallHinge: id })}
        />
      )}
      {inLineChoice && (
        <HingeChoice
          title="Hinges between the glass"
          styles={hinges.inLine.offered.map((id) => [id, IN_LINE_HINGE_STYLES[id]])}
          range={rangeOf('glass-to-glass-180')}
          finishCode={finishCode}
          standard={hinges.inLine.standard}
          chosen={state.inLineHinge ?? hinges.inLine.standard}
          onChoose={(id) => update({ inLineHinge: id })}
        />
      )}

      {state.sliding ? (
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Handle</Label>
          <p className="rounded-lg border p-3 text-sm text-muted-foreground">
            A sliding door has a round pull set through the glass, which comes with its sliding kit in the finish you choose.
          </p>
        </div>
      ) : (
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
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                  state.handleId === h.id ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
                }`}
              >
                <HardwarePhoto file={handlePhoto(h)} />
                <div className="min-w-0">
                  <div className="font-medium">{h.label}</div>
                  <div className="text-sm text-muted-foreground">{h.description}</div>
                </div>
              </button>
            ))}
          </div>
          {config.handles.some(handlePhoto) && <PhotoCredit />}
        </div>
      )}

      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Glass type
        </Label>
        {glassTypes.offered.length > 1 ? (
          <div className="grid gap-2">
            {glassTypes.offered.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => update({ glassType: id })}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  state.glassType === id ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
                }`}
              >
                <div className="font-medium">{GLASS_TYPE_TEXT[id].label}</div>
                <div className="text-sm text-muted-foreground">{GLASS_TYPE_TEXT[id].description}</div>
              </button>
            ))}
          </div>
        ) : (
          // One glass on offer, so there is nothing to choose.
          <div className="rounded-lg border bg-muted p-3">
            <div className="font-medium">{GLASS_TYPE_TEXT[state.glassType].label}</div>
            <div className="text-sm text-muted-foreground">{GLASS_TYPE_TEXT[state.glassType].description}</div>
          </div>
        )}
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

      {/* No coating, and nothing else on offer, is nothing to show. */}
      {(coatings.offered.length > 1 || state.glassCoating !== 'none') && (
        <div className="space-y-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Coating
          </Label>
          {coatings.offered.length > 1 ? (
            <div className="grid gap-2">
              {coatings.offered.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => update({ glassCoating: id })}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    state.glassCoating === id ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="font-medium">{GLASS_COATING_TEXT[id].label}</div>
                  <div className="text-sm text-muted-foreground">{GLASS_COATING_TEXT[id].description}</div>
                </button>
              ))}
            </div>
          ) : (
            // One coating on offer, so there is nothing to choose.
            <div className="rounded-lg border bg-muted p-3">
              <div className="font-medium">{GLASS_COATING_TEXT[state.glassCoating].label}</div>
              <div className="text-sm text-muted-foreground">{GLASS_COATING_TEXT[state.glassCoating].description}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One way of hanging's hinges, as cards: the company's standard first marked as such. */
function HingeChoice<T extends string>({
  title,
  styles,
  range,
  finishCode,
  standard,
  chosen,
  onChoose,
}: {
  title: string;
  styles: [T, HingeStyle][];
  /** The range the door hangs on, where there is a door to say. */
  range: string | null;
  /** CRL's code for the finish chosen, where it has one. */
  finishCode: string | null;
  standard: T;
  chosen: T;
  onChoose: (id: T) => void;
}) {
  const photos = styles.map(([, style]) => hingePhotoOf(style, range, finishCode));
  return (
    <div className="space-y-3">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</Label>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={title}>
        {styles.map(([id, style], i) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={chosen === id}
            onClick={() => onChoose(id)}
            className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${chosen === id ? 'border-foreground bg-muted' : 'hover:bg-muted/50'}`}
          >
            <HardwarePhoto file={photos[i]?.file} />
            <div className="min-w-0">
              <div className="font-medium">
                {style.name}
                {id === standard && <span className="ml-2 text-xs font-normal text-muted-foreground">Our standard</span>}
              </div>
              <div className="text-sm text-muted-foreground">{style.about}</div>
            </div>
          </button>
        ))}
      </div>
      {photos.some(Boolean) && <PhotoCredit />}
    </div>
  );
}

/**
 * CRL's photo on a card, small enough that the cards stay compact on a phone.
 * With no photo, or one that will not load, there is nothing: no gap either.
 * The card's own words name the part, so the photo says nothing to a screen
 * reader: the choice is read out by its name alone.
 */
function HardwarePhoto({ file }: { file: string | undefined }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!file || failed === file) return null;
  return (
    <img
      src={crlPhotoSrc(file)}
      alt=""
      width={64}
      height={64}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(file)}
      className="h-14 w-14 shrink-0 rounded-md border bg-white object-contain p-0.5 sm:h-16 sm:w-16"
    />
  );
}

/** CRL photographs a part once, so a photo is not always in the finish chosen. */
function PhotoCredit() {
  return <p className="text-xs text-muted-foreground">Photos: C.R. Laurence. They show the shape, not always your finish.</p>;
}
