/**
 * Measure step — the customer does the survey, one task at a time.
 *
 * The journey (journey.ts) decides which screens this shower needs and in
 * what order; this file draws them. Every screen answers the same four
 * questions — what you are measuring, where, why, and what comes next — in
 * the same shape: a heading, the drawing with the line being measured lit,
 * the one or two numbers to type, what those numbers mean, and the thing
 * that is easy to get wrong.
 *
 * Phone and desktop walk the same sequence. Desktop adds a rail of every
 * screen for jumping back, because someone at a desk is checking numbers
 * they took earlier; someone in the bathroom is taking them.
 *
 * The engine does not live here. Screens write into measure.ts's fields and
 * read its checks; the shell's Back and Next buttons move between screens.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Check, ChevronRight, Info, Pencil } from 'lucide-react';
import { PhotoCapture } from '../PhotoCapture';
import type { Photo, PhotoSlot } from '../photos';
import { ceilingChoice, hasTransom, isSingleDoor, openingContext, runPanelIndices } from '@setout/engine';
import {
  buildJourney,
  journeySummary,
  runEndNames,
  runNames,
  screenIndexForCheck,
  wallNames,
  type CrossScreen,
  type MeasureScreen,
  type RunScreen,
  type WallScreen,
} from '@setout/engine';
import { scaleRunPanels } from '@setout/engine';
import {
  applyCrossReadings,
  applyFloorReadings,
  ceilingGlassHeightMm,
  ceilingMeasured,
  ceilingSlope,
  checkMeasurements,
  createCrossReadings,
  CROSS_POINTS,
  floorMeasured,
  halvesTotalMm,
  LASER_OFFSET_DEFAULT_MM,
  measuredInHalves,
  signedLeanMm,
  toolFor,
  topWidthMm,
  WALK_IN_RECOMMENDED_MM,
  walkInGapMm,
  wallLean,
  wallMeasured,
  type CrossKey,
  type MeasureCheck,
  type MeasureMethod,
  type OpeningMeasurements,
  type RunMeasurement,
  type WallMeasurement,
} from '@setout/engine';
import { useEngine } from '../engine';
import { buildSpec } from '@setout/engine';
import { MeasureScene, type EndKind, type SceneFigure } from '../views/MeasureScene';
import { OpeningPreview } from '../views/MeasureDiagram';
import type { StepProps } from './types';

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** Everything a screen needs to read and write. One object, passed down. */
interface Api extends Pick<StepProps, 'state' | 'update' | 'templateId'> {
  m: OpeningMeasurements;
  tool: 'laser' | 'tape' | null;
  singleDoor: boolean;
  names: string[];
  walls: { start: string | null; end: string | null };
  runIndices: number[][];
  /** Which drawn measurement is lit. Follows the focused input. */
  active: string | null;
  setActive: (key: string | null) => void;
  patch: (p: Partial<OpeningMeasurements>) => void;
  patchRun: (i: number, p: Partial<RunMeasurement>) => void;
  setRunFloorWidth: (i: number, widthMm: number) => void;
  setRunHalves: (i: number, a: number | null, b: number | null) => void;
  setCross: (key: CrossKey, v: number | null) => void;
  patchWall: (key: 'startWall' | 'endWall', p: Partial<WallMeasurement>) => void;
  setFloor: (i: number, start: number | null, end: number | null) => void;
  setCeiling: (i: number, start: number | null, end: number | null) => void;
  photoFor: (slot: PhotoSlot) => Photo | undefined;
  setPhotoFor: (slot: PhotoSlot, photo: Photo | null) => void;
  checks: MeasureCheck[];
  screens: MeasureScreen[];
  jump: (index: number) => void;
}

/** What is at each end of a run, for the drawing. */
function endKinds(api: Api, runIndex: number): { left: EndKind; right: EndKind } {
  const last = api.runIndices.length - 1;
  const left: EndKind = runIndex === 0 ? (api.state.leftWall ? 'wall' : 'open') : 'corner';
  const right: EndKind = runIndex === last ? (api.state.rightWall ? 'wall' : 'open') : 'corner';
  return { left, right };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A millimetre box. Empty means not measured, which is not zero. */
function MmInput({
  id,
  label,
  value,
  onChange,
  onFocus,
  hint,
  autoFocus = false,
  allowZero = true,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  onFocus?: () => void;
  hint?: string;
  autoFocus?: boolean;
  allowZero?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium leading-snug">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          autoFocus={autoFocus}
          className="h-12 pr-12 text-lg font-semibold tabular-nums"
          placeholder={allowZero ? '0' : ''}
          value={value ?? ''}
          onFocus={onFocus}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (raw === '') return onChange(null);
            const n = Number(raw);
            onChange(Number.isFinite(n) ? Math.max(0, n) : null);
          }}
        />
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
          aria-hidden
        >
          mm
        </span>
      </div>
      {hint && <p className="text-xs leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Two or three choices laid out as buttons, one of them pressed. */
function Choice<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: { id: T; label: string; blurb?: string }[];
  value: T | null;
  onChange: (id: T) => void;
  columns?: 1 | 2 | 3;
}) {
  const cols = columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2';
  return (
    <div className={`grid gap-2 ${cols}`}>
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.id)}
            className={`rounded-lg border p-3 text-left transition-colors duration-150 ${
              selected ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
            }`}
          >
            <span className="block text-sm font-medium">{o.label}</span>
            {o.blurb && <span className="mt-0.5 block text-xs text-muted-foreground">{o.blurb}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** What the numbers just typed add up to, said back straight away. */
function Result({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'good' }) {
  return (
    <div className="flex gap-2 rounded bg-muted/60 px-3 py-2 text-sm">
      {tone === 'good' && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
      <div>{children}</div>
    </div>
  );
}

/**
 * What the checks have to say about the current screen's numbers. Provided
 * from the step so the frame can show it right under the inputs it is about,
 * without every screen having to pass it through.
 */
const AlertsContext = createContext<React.ReactNode>(null);

/** The screen's chassis: heading, drawing, inputs, the easy mistake, a photo. */
function Frame({
  title,
  intro,
  figure,
  active,
  caption,
  mistakes,
  photo,
  children,
}: {
  title: string;
  intro?: React.ReactNode;
  figure?: SceneFigure | null;
  active?: string | null;
  caption?: string;
  mistakes?: string[];
  photo?: { slot: PhotoSlot; prompt: string; photo: Photo | undefined; onChange: (p: Photo | null) => void };
  children: React.ReactNode;
  /** No drawing: the content takes the full width. */
  wide?: boolean;
}) {
  const alerts = useContext(AlertsContext);
  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h3 className="text-lg font-semibold leading-tight sm:text-xl">{title}</h3>
        {intro && <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p>}
      </header>

      {/* The drawing takes the full width on every device: it is the
          instruction, and a picture a third of the column wide is not one. */}
      <div className="space-y-4">
        {figure && (
          <figure className="max-w-[560px] space-y-2">
            <MeasureScene figure={figure} active={active} className="w-full rounded bg-muted/40 p-2" />
            {caption && <figcaption className="text-xs leading-snug text-muted-foreground">{caption}</figcaption>}
          </figure>
        )}
        <div className="max-w-[560px] space-y-4">{children}</div>
        {alerts}
      </div>

      {mistakes && mistakes.length > 0 && (
        <div className="rounded border border-dashed px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground/80">Easy to get wrong: </span>
          {mistakes.join(' ')}
        </div>
      )}

      {photo && (
        <PhotoCapture slot={photo.slot} prompt={photo.prompt} photo={photo.photo} onChange={photo.onChange} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function MethodScreen({ api, title }: { api: Api; title: string }) {
  const { m, tool } = api;
  const choose = (next: 'laser' | 'tape') =>
    api.patch({
      method:
        next === 'laser'
          ? 'laser'
          : m.method && m.method !== 'laser'
            ? m.method
            : 'packers',
      shapeConfirmed: false,
    });

  const options: { id: 'laser' | 'tape'; label: string; blurb: string; need: string[] }[] = [
    {
      id: 'laser',
      label: 'A laser level',
      blurb:
        'The most accurate. A self-levelling laser gives a true upright and a true level line, so a leaning wall or a sloping floor falls straight out of two readings.',
      need: ['A self-levelling cross-line laser', 'A tape measure', 'Masking tape and a pen'],
    },
    {
      id: 'tape',
      label: 'A tape measure',
      blurb:
        'Just as good, with one extra check. You measure to lines drawn on masking tape, and check the walls with a long spirit level and glazing packers.',
      need: ['A tape measure', 'Masking tape and a pen', 'A spirit level, the longer the better', 'Glazing packers, if you have some'],
    },
  ];

  return (
    <Frame
      title={title}
      intro="Pick the tool you have. Every screen after this is written for it, and you can change your mind later."
      wide
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => {
          const selected = tool === o.id;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={selected}
              onClick={() => choose(o.id)}
              className={`flex flex-col rounded-lg border p-4 text-left transition-colors duration-150 ${
                selected ? 'border-foreground bg-muted' : 'hover:bg-muted/50'
              }`}
            >
              <MeasureScene figure={{ kind: 'tool', tool: o.id }} className="mb-3 w-full rounded bg-background/60" />
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{o.label}</span>
                {selected && <Check className="h-4 w-4 shrink-0" />}
              </span>
              <span className="mt-1 text-sm leading-relaxed text-muted-foreground">{o.blurb}</span>
              <span className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">You will need</span>
              <ul className="mt-1 space-y-0.5 text-sm">
                {o.need.map((n) => (
                  <li key={n} className="flex gap-2">
                    <span aria-hidden className="text-muted-foreground">·</span>
                    {n}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
        <div className="font-semibold">Before you start</div>
        <ul className="space-y-1.5 text-muted-foreground">
          <li>
            <strong className="text-foreground">Everything is in millimetres.</strong> A 1.4 metre opening is 1400.
          </li>
          <li>
            <strong className="text-foreground">Measure to the tiles</strong> or the finished surface, never to plaster that will be tiled over.
          </li>
          <li>
            <strong className="text-foreground">Mark where the glass will stand.</strong> A small piece of masking tape at each end and
            each corner, about 10mm in from the edge of the tray. Every width is taken to the outside of those marks.
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">Most people take ten to fifteen minutes. Toughened glass cannot be trimmed once it is made, so this is the part worth getting right.</p>
      </div>
    </Frame>
  );
}

function OverviewScreen({ api, title }: { api: Api; title: string }) {
  const { state, names, singleDoor, screens, runIndices } = api;
  const count = (kind: MeasureScreen['kind']) => screens.filter((s) => s.kind === kind).length;
  const widths = singleDoor ? 0 : count('width');
  const walls = count('wall');
  const floors = count('floor');
  const ceilings = count('ceiling');
  const crosses = count('cross');
  const parts: string[] = [];
  if (crosses) parts.push(`${crosses * 2} readings to a cross in the middle`);
  if (widths) parts.push(`${widths} ${widths === 1 ? 'width' : 'widths'} along the floor`);
  if (walls) parts.push(`${walls} wall ${walls === 1 ? 'check' : 'checks'}`);
  if (floors) parts.push(`${floors} floor ${floors === 1 ? 'check' : 'checks'}`);
  if (ceilings) parts.push(`${ceilings} ceiling ${ceilings === 1 ? 'height' : 'heights'}`);

  return (
    <Frame
      title={title}
      intro={
        singleDoor
          ? 'One door between two walls. You measure it to a cross in the middle of the opening, and we work out the width, the walls and the floor from those readings.'
          : runIndices.length > 1
            ? 'Your shower turns a corner, so it is measured one straight wall at a time. Each run is numbered here and named the same way on every screen.'
            : 'One straight run of glass. Here is what we will ask for.'
      }
      figure={{
        kind: 'overview',
        panels: state.panels,
        junctions: state.junctions,
        leftWall: state.leftWall,
        rightWall: state.rightWall,
        runNames: names,
      }}
      caption="Your shower from above, as you chose it. Walls are the grey bars; an open end is where you walk in."
    >
      {!singleDoor && runIndices.length > 1 && (
        <ol className="space-y-1.5 text-sm">
          {runIndices.map((indices, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                {i + 1}
              </span>
              <span>
                <span className="font-medium">{cap(names[i])}</span>
                <span className="text-muted-foreground">
                  {' '}
                  — {indices.map((p) => (state.panels[p].kind === 'door' ? 'the door' : 'a fixed panel')).join(' and ')}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="rounded border p-3 text-sm">
        <div className="font-medium">You will measure</div>
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          <li>· The height of the glass</li>
          {parts.map((p) => (
            <li key={p}>· {cap(p)}</li>
          ))}
          <li>· Then we draw it back for you to check</li>
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        Tap Next when you are in the bathroom with your tools. You can come back to any screen.
      </p>
    </Frame>
  );
}

function HeightScreen({ api, title }: { api: Api; title: string }) {
  const { rules } = useEngine();
  const { heights, review } = rules.making;
  const { state, update, m, singleDoor, templateId } = api;
  const presets = templateId === 'over-bath' ? [1400, 1500, 1600] : [1850, 2000, 2100];
  const topGap = state.topGapMm ?? heights.singleDoorTopGapMm;
  const transom = hasTransom(state);
  const ends = endKinds(api, 0);
  const lastEnds = endKinds(api, api.runIndices.length - 1);

  const setToCeiling = (to: boolean) => update(ceilingChoice(rules, state, to));

  return (
    <Frame
      title={title}
      intro="Measure up from the tray at the wall and put a piece of tape where you want the top of the glass. Then check nothing is in the way at that height."
      figure={{
        kind: 'height',
        toCeiling: state.isFloorToCeiling,
        singleDoor,
        leftEnd: ends.left,
        rightEnd: api.runIndices.length > 1 ? 'corner' : lastEnds.right,
      }}
      active={api.active ?? 'height'}
      caption={
        state.isFloorToCeiling
          ? singleDoor
            ? 'The door stops a little short of the ceiling so air can get past when it opens.'
            : 'Glass right up to the ceiling. We cut the top to follow the ceiling, so we measure it at each end.'
          : 'From the tray or floor up to where the glass finishes.'
      }
      mistakes={[
        'Look up before you decide: a sloping ceiling, a window sill, a shelf or a shower head can all get in the way of the top of the glass.',
      ]}
      photo={
        state.isFloorToCeiling
          ? undefined
          : {
              slot: 'height',
              prompt: 'Show the tape running from the floor up to where the glass will finish.',
              photo: api.photoFor('height'),
              onChange: (p) => api.setPhotoFor('height', p),
            }
      }
    >
      <Choice
        options={[
          { id: 'set', label: 'A set height', blurb: 'The glass stops short of the ceiling.' },
          { id: 'ceiling', label: 'Up to the ceiling', blurb: 'The glass fills the full height.' },
        ]}
        value={state.isFloorToCeiling ? 'ceiling' : 'set'}
        onChange={(v) => setToCeiling(v === 'ceiling')}
      />

      {!state.isFloorToCeiling && (
        <>
          <MmInput
            id="height"
            label="Height of the glass"
            value={state.heightMm || null}
            onChange={(v) => update({ heightMm: v ?? 0 })}
            onFocus={() => api.setActive('height')}
            allowZero={false}
          />
          <div className="flex flex-wrap gap-2">
            {presets.map((h) => (
              <Button key={h} size="sm" variant={state.heightMm === h ? 'default' : 'outline'} onClick={() => update({ heightMm: h })}>
                {h}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {templateId === 'over-bath'
              ? 'A screen over a bath is usually around 1500mm.'
              : 'Most enclosures are 2000mm. 1850mm suits a low ceiling; 2100mm suits a tall room.'}
          </p>
          {state.heightMm > review.standardHeightMaxMm && (
            <Result>
              Glass over {review.standardHeightMaxMm}mm is fine. We check taller showers by hand before anything is cut, and a
              photo of the ceiling above the shower helps.
            </Result>
          )}
          <div className="space-y-2 rounded border p-3">
            <Label className="text-sm">Is anything in the way above that height?</Label>
            <Choice
              options={[
                { id: 'clear', label: 'No, it is clear' },
                { id: 'ceiling', label: 'The ceiling comes down over the shower' },
              ]}
              value={m.aboveGlass ?? null}
              onChange={(v) => api.patch({ aboveGlass: v, shapeConfirmed: false })}
            />
            {m.aboveGlass === 'ceiling' && (
              <p className="text-xs text-muted-foreground">
                We will ask for the ceiling height at each end after the floor, and check it clears the glass.
              </p>
            )}
          </div>
        </>
      )}

      {state.isFloorToCeiling && singleDoor && (
        <div className="space-y-3 rounded border p-3">
          <MmInput
            id="top-gap"
            label="Gap above the door"
            value={topGap}
            onChange={(v) => {
              const gap = Math.max(0, v ?? 0);
              update({ topGapMm: gap, ...(m.ceilingHeightMm ? { heightMm: m.ceilingHeightMm - gap } : {}) });
            }}
            onFocus={() => api.setActive('gap')}
            hint={`We recommend ${heights.singleDoorTopGapMm}mm. It lets air past the top of the door, so it does not suck shut or pull hard when you open it.`}
          />
          <Result>
            {m.ceilingHeightMm
              ? `Your ceiling is ${m.ceilingHeightMm}mm at its lowest, so the door will be ${m.ceilingHeightMm - topGap}mm tall.`
              : 'You take two ceiling readings on the cross (7 and 8). The door height is the lowest point less this gap.'}
          </Result>
        </div>
      )}

      {state.isFloorToCeiling && !singleDoor && (
        <Result>
          After the floor checks we ask for the floor-to-ceiling height at each end of{' '}
          {api.runIndices.length > 1 ? 'each run' : 'the glass'}. The glass is cut to the tallest point and the top edge follows
          any slope as one straight line.
          {transom && ' Next: what goes above the door.'}
        </Result>
      )}
    </Frame>
  );
}

function TransomScreen({ api, title }: { api: Api; title: string }) {
  const { heights } = useEngine().rules.making;
  const { state, update } = api;
  const doorH = state.doorHeightMm ?? heights.transomDoorHeightMm;
  const ceilingH = ceilingGlassHeightMm(api.m) ?? state.heightMm;
  return (
    <Frame
      title={title}
      intro="The fixed glass goes up to the ceiling. The door stops at the height you choose, and the space above it is a transom."
      wide
    >
      <Choice
        options={[
          { id: 'open', label: 'Open transom', blurb: 'A gap above the door, to let air and steam out.' },
          { id: 'glass', label: 'Glass transom', blurb: 'A fixed glass panel above the door, up to the ceiling.' },
        ]}
        value={state.aboveDoor ?? null}
        onChange={(v) => update({ aboveDoor: v })}
      />
      <MmInput
        id="door-height"
        label="How tall do you want the door?"
        value={doorH}
        onChange={(v) => update({ doorHeightMm: v ?? 0 })}
        hint="2000mm is usual. A shorter door gives a taller transom."
        allowZero={false}
      />
      {ceilingH > doorH ? (
        <Result>
          That leaves a <strong>{ceilingH - doorH}mm</strong> {state.aboveDoor === 'open' ? 'open gap' : 'transom'} above the door,
          up to your {ceilingH}mm ceiling. We size the transom and its fixings for you.
        </Result>
      ) : (
        <Result>The door needs to be shorter than the ceiling, which you measure after the floor.</Result>
      )}
    </Frame>
  );
}

function CrossSetupScreen({ api, title }: { api: Api; title: string }) {
  const laser = api.tool === 'laser';
  return (
    <Frame
      title={title}
      intro={
        laser
          ? 'Every reading for a single door is taken to one cross of laser light in the middle of the opening.'
          : 'Every reading for a single door is taken to one cross drawn on masking tape in the middle of the opening.'
      }
      figure={{ kind: 'cross', points: null, ceiling: api.state.isFloorToCeiling, tool: api.tool }}
      caption={`${api.state.isFloorToCeiling ? 'Eight' : 'Six'} readings, numbered in the order we ask for them. Readings on opposite sides add up to the width and the height.`}
      mistakes={[
        'Measure straight across to the line, square to the wall, not at an angle.',
        'Measure to the tiles, not to plaster, grout gaps or a tile lip.',
      ]}
    >
      <ol className="space-y-2 text-sm">
        {(laser
          ? [
              'Stand the laser on the floor in the middle of the opening, about where the door will hang.',
              'Switch on both lines: one straight up and down, one level across. Let it settle.',
              'Measure from each wall across to the upright line, at the bottom and at the top.',
              'Measure from the level line straight down to the floor on each side' +
                (api.state.isFloorToCeiling ? ', and up to the ceiling.' : '.'),
            ]
          : [
              'Run masking tape across the floor and up both walls in the middle of the opening.',
              'Draw one straight line up and down and one across, meeting in the middle. A long level or a straight edge helps.',
              'Measure from each wall across to the up-and-down line, at the bottom and at the top.',
              'Measure from the across line straight down to the floor on each side' +
                (api.state.isFloorToCeiling ? ', and up to the ceiling.' : '.') +
                ' You check the walls with a level afterwards, because a pen line is not plumb.',
            ]
        ).map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {i + 1}
            </span>
            <span className="leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">Nothing to type here. Tap Next when the cross is up.</p>
    </Frame>
  );
}

function CrossReadingsScreen({ api, screen }: { api: Api; screen: CrossScreen }) {
  const { heights } = useEngine().rules.making;
  const { m, state, tool } = api;
  const cross = m.crossReadings ?? createCrossReadings();
  const laser = tool === 'laser';
  const point = (n: number) => CROSS_POINTS[n - 1];
  const [a, b] = screen.points;
  const value = (n: number) => cross[point(n).key];
  const add = (x: number | null, y: number | null) => (x === null || y === null ? null : Math.round(x + y));
  const run = m.runs[0];

  const where =
    screen.group === 'left' || screen.group === 'right'
      ? `Stand at the ${screen.group} wall. Measure from the tiles straight across to the up-and-down line, once near the floor and once at the height the glass will reach.`
      : screen.group === 'floor'
        ? `Measure from the ${laser ? 'level' : 'across'} line straight down to the floor, near the left wall and near the right wall.`
        : `Measure from the ${laser ? 'level' : 'across'} line straight up to the ceiling, near the left wall and near the right wall.`;

  const label = (n: number) => {
    const p = point(n);
    return `${n}. ${p.label}`;
  };

  const result = (() => {
    if (screen.group === 'left' || screen.group === 'right') {
      const bottom = add(cross.leftBottomMm, cross.rightBottomMm);
      const top = add(cross.leftTopMm, cross.rightTopMm);
      const wall = screen.group === 'left' ? m.startWall : m.endWall;
      const lean = laser ? wallLean(wall) : null;
      const lines: string[] = [];
      if (lean) {
        lines.push(
          lean.leanMm === 0
            ? `The ${screen.group} wall is straight up.`
            : `The ${screen.group} wall is ${lean.leanMm}mm out, leaning ${lean.direction === 'in' ? 'into' : 'away from'} the shower at the top.`
        );
      } else if (value(a) !== null && value(b) !== null && !laser) {
        lines.push('Both readings in. You check this wall with a level on a later screen.');
      }
      if (bottom !== null) lines.push(`Width at the floor: ${cross.leftBottomMm} + ${cross.rightBottomMm} = ${bottom}mm.`);
      if (top !== null) lines.push(`Width at the top: ${cross.leftTopMm} + ${cross.rightTopMm} = ${top}mm.`);
      return lines;
    }
    if (screen.group === 'floor') {
      if (!laser) {
        return value(a) !== null && value(b) !== null
          ? ['Both in. With tape these go with the ceiling readings to give the height each side; the floor itself is checked with a level later.']
          : [];
      }
      if (!floorMeasured(run)) return [];
      return [
        run.floorFallMm === 0
          ? 'The floor is level.'
          : `The floor is ${run.floorFallMm}mm lower on the ${run.floorLowEnd === 'start' ? 'left' : 'right'}. The bottom of the glass is cut to match.`,
      ];
    }
    const left = add(cross.floorLeftMm, cross.ceilingLeftMm);
    const right = add(cross.floorRightMm, cross.ceilingRightMm);
    const lines: string[] = [];
    if (left !== null) lines.push(`Floor to ceiling on the left: ${cross.floorLeftMm} + ${cross.ceilingLeftMm} = ${left}mm.`);
    if (right !== null) lines.push(`Floor to ceiling on the right: ${cross.floorRightMm} + ${cross.ceilingRightMm} = ${right}mm.`);
    if (m.ceilingHeightMm) {
      const gap = state.topGapMm ?? heights.singleDoorTopGapMm;
      lines.push(`Lowest point ${m.ceilingHeightMm}mm, so the door will be ${m.ceilingHeightMm - gap}mm tall with a ${gap}mm gap above it.`);
    }
    return lines;
  })();

  return (
    <Frame
      title={screen.title}
      intro={where}
      figure={{ kind: 'cross', points: screen.points, ceiling: state.isFloorToCeiling, tool }}
      active={api.active ?? String(value(a) === null ? a : b)}
      caption="The two readings for this screen are shown in blue. The one you are typing breathes."
      mistakes={
        screen.group === 'left' || screen.group === 'right'
          ? ['Take the top reading at the height the glass will reach, not at the ceiling.', 'Keep the tape level across to the line.']
          : ['Keep the tape plumb, straight up and down, from the line to the surface.']
      }
      photo={
        screen.group === 'left'
          ? {
              slot: 'width-floor-0',
              prompt: 'Show the cross in the opening, with the tape on one of the readings.',
              photo: api.photoFor('width-floor-0'),
              onChange: (p) => api.setPhotoFor('width-floor-0', p),
            }
          : undefined
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {[a, b].map((n) => (
          <MmInput
            key={n}
            id={`cross-${n}`}
            label={label(n)}
            value={value(n)}
            onChange={(v) => api.setCross(point(n).key, v)}
            onFocus={() => api.setActive(String(n))}
          />
        ))}
      </div>
      {result.length > 0 && (
        <Result tone="good">
          {result.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </Result>
      )}
    </Frame>
  );
}

function WidthScreen({ api, screen }: { api: Api; screen: RunScreen }) {
  const { m, state, tool, names, runIndices, templateId } = api;
  const i = screen.runIndex;
  const run = m.runs[i];
  const ends = endKinds(api, i);
  const endNames = runEndNames(state, i);
  const multi = runIndices.length > 1;
  const hasDoor = (runIndices[i] ?? []).some((p) => state.panels[p].kind === 'door');
  const [whole, setWhole] = useState(!hasDoor && !measuredInHalves(run));
  const halves = !whole || measuredInHalves(run);
  const total = halvesTotalMm(run);
  const walkIn = !state.rightWall && runIndices.length === 1 && templateId !== 'over-bath';
  const gap = walkInGapMm(m);

  const between = `from the ${endNames.start} to the ${endNames.end}`;

  return (
    <Frame
      title={screen.title}
      intro={
        halves
          ? `Measure ${between} in two halves, to a line in the middle. Two short pulls of the tape are more accurate than one long one, and we do the adding up.`
          : ends.right === 'open'
            ? 'Measure along the floor from the wall to the tape mark where you want the glass to stop.'
            : `Measure along the floor ${between}, to the outside of your tape marks.`
      }
      figure={{ kind: 'width', halves, tool, leftEnd: ends.left, rightEnd: ends.right, tray: walkIn }}
      active={api.active ?? (halves ? (run.halfAMm == null ? 'A' : 'B') : 'width')}
      caption={
        halves
          ? tool === 'laser'
            ? 'Stand the laser in the middle and measure from each end to its line.'
            : 'A piece of masking tape in the middle with a line drawn on it. Measure from each end to the line.'
          : 'Tape flat on the floor, along the line where the glass will stand.'
      }
      mistakes={[
        'Measure along the floor where the glass will stand, not up the wall or across the middle of the tray.',
        multi ? 'At a corner, measure to the outside of the corner mark, where the two glass lines cross.' : 'Measure to the tiles, not to the plaster behind them.',
      ]}
      photo={{
        slot: `width-floor-${i}` as PhotoSlot,
        prompt: 'Show the tape flat on the floor with both ends in place.',
        photo: api.photoFor(`width-floor-${i}` as PhotoSlot),
        onChange: (p) => api.setPhotoFor(`width-floor-${i}` as PhotoSlot, p),
      }}
    >
      {halves ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MmInput
              id={`half-a-${i}`}
              label={`A: ${endNames.start} to the line`}
              value={run.halfAMm ?? null}
              onChange={(v) => api.setRunHalves(i, v, run.halfBMm ?? null)}
              onFocus={() => api.setActive('A')}
            />
            <MmInput
              id={`half-b-${i}`}
              label={`B: line to the ${endNames.end}`}
              value={run.halfBMm ?? null}
              onChange={(v) => api.setRunHalves(i, run.halfAMm ?? null, v)}
              onFocus={() => api.setActive('B')}
            />
          </div>
          <Result tone={total !== null ? 'good' : 'plain'}>
            {total !== null ? (
              <>
                {multi ? `${cap(names[i])} is` : 'The opening is'} {run.halfAMm} + {run.halfBMm} = <strong>{total}mm</strong> along the floor.
              </>
            ) : (
              'Type both halves and we add them together.'
            )}
          </Result>
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2"
            onClick={() => {
              setWhole(true);
              if (measuredInHalves(run)) api.setRunFloorWidth(i, total ?? run.widthAtFloorMm);
            }}
          >
            Measured it in one go? Type the whole width instead
          </button>
        </>
      ) : (
        <>
          <MmInput
            id={`width-${i}`}
            label={ends.right === 'open' ? 'Length of the glass along the floor' : 'Width along the floor'}
            value={run.widthAtFloorMm || null}
            onChange={(v) => api.setRunFloorWidth(i, v ?? 0)}
            onFocus={() => api.setActive('width')}
            allowZero={false}
          />
          {hasDoor && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2"
              onClick={() => setWhole(false)}
            >
              Measure it in two halves instead (more accurate)
            </button>
          )}
        </>
      )}

      {walkIn && (
        <div className="space-y-2 rounded border p-3">
          <MmInput
            id="tray-width"
            label="Whole width of the tray, wall to the open end (optional)"
            value={m.walkInOpeningMm ?? null}
            onChange={(v) => api.patch({ walkInOpeningMm: v, shapeConfirmed: false })}
            onFocus={() => api.setActive('tray')}
          />
          {gap !== null && gap > 0 && (
            <p className="text-sm">
              That leaves a <strong>{gap}mm</strong> gap to walk through.
              {gap < WALK_IN_RECOMMENDED_MM && (
                <span className="text-muted-foreground">
                  {' '}
                  About {WALK_IN_RECOMMENDED_MM}mm is easier to walk through, but narrower is fine if it suits your room.
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {!(tool === 'tape' && !multi && state.leftWall && state.rightWall) && (
        <p className="text-xs text-muted-foreground">
          You do not need to measure the top. We work it out from this width and how far the walls lean, which comes next.
        </p>
      )}
    </Frame>
  );
}

function WidthTopScreen({ api, screen }: { api: Api; screen: RunScreen }) {
  const { m } = api;
  const i = screen.runIndex;
  const run = m.runs[i];
  const top = run.widthAtTopCheckMm ?? null;
  const diff = top === null ? null : Math.round(top - run.widthAtFloorMm);
  return (
    <Frame
      title={screen.title}
      intro="The same width again, held level at the height the glass will reach, between your two tape marks. If it differs from the floor, a wall leans, and the next screens find which one."
      figure={{ kind: 'width-top' }}
      active={api.active ?? (top === null ? 'top' : 'middle')}
      caption="Floor width below, top width above. Most openings differ by a few millimetres."
      mistakes={['Keep the tape level. A tape that droops or tilts reads long.', 'Measure to the tiles at both ends.']}
    >
      <MmInput
        id={`width-top-${i}`}
        label="Width at the top"
        value={top}
        onChange={(v) => api.patchRun(i, { widthAtTopCheckMm: v })}
        onFocus={() => api.setActive('top')}
      />
      <MmInput
        id={`width-mid-${i}`}
        label="Width at mid height (optional)"
        value={run.widthAtMiddleCheckMm ?? null}
        onChange={(v) => api.patchRun(i, { widthAtMiddleCheckMm: v })}
        onFocus={() => api.setActive('middle')}
        hint="Worth a moment if a wall looks bowed. Glass is cut straight and cannot follow a curve."
      />
      {diff !== null && (
        <Result tone="good">
          {Math.abs(diff) <= 3
            ? `Within ${Math.abs(diff)}mm of the floor width — the walls are close to straight up.`
            : `The top is ${Math.abs(diff)}mm ${diff < 0 ? 'narrower' : 'wider'} than the floor, so at least one wall leans. The wall checks find which.`}
        </Result>
      )}
    </Frame>
  );
}

function WallScreen({ api, screen }: { api: Api; screen: WallScreen }) {
  const { m, state, tool, walls, singleDoor } = api;
  const key = screen.wall === 'start' ? 'startWall' : 'endWall';
  const wall = m[key];
  const name = (screen.wall === 'start' ? walls.start : walls.end) ?? 'the wall';
  const side: 'left' | 'right' = screen.wall === 'start' ? 'left' : 'right';
  const laser = tool === 'laser';
  const unchecked = m.method === 'assumed-square';
  const lean = wallLean(wall);
  const offset = m.laserOffsetMm ?? LASER_OFFSET_DEFAULT_MM;
  const fromCross = singleDoor && !laser && m.crossReadings;
  const ctx = openingContext(state);
  const runs = m.runs;

  const subMethod: MeasureMethod | null = m.method === 'laser' ? null : m.method;

  return (
    <Frame
      title={screen.title}
      intro={
        laser
          ? `Set the laser to a true upright a little off ${name}, then measure from the line to the tiles twice: near the floor and at the height the glass will reach. The difference is the lean, and which reading is bigger tells us the direction.`
          : `Hold a long level upright against ${name} with the bubble centred. One end will touch the wall; at the other there will be a gap. Measure that gap, or fill it with glazing packers and add up their thicknesses.`
      }
      figure={{
        kind: 'wall',
        side,
        tool,
        leanMm: lean ? lean.signedMm : null,
        packers: subMethod === 'packers' || subMethod === null,
      }}
      active={api.active ?? (wall.gapBottomMm === null ? 'bottom' : 'top')}
      caption={
        laser
          ? `The laser line is a true upright. Your bottom reading should be about ${offset}mm; the top reading tells us the lean.`
          : 'The end that touches reads 0. The lean is drawn far bigger than it really is.'
      }
      mistakes={
        laser
          ? ['Let the laser settle before you read it: a blinking line means it is not level.', 'Measure to the tiles at the same two heights every time.']
          : ['Keep the bubble centred while you read the gap.', 'A short level on a tall wall can miss a gentle lean. Use the longest one you have.']
      }
      photo={{
        slot: 'walls',
        prompt: laser ? 'Show the laser line on the wall, with the tape on one reading.' : 'Show the level against the wall, with the gap visible.',
        photo: api.photoFor('walls'),
        onChange: (p) => api.setPhotoFor('walls', p),
      }}
    >
      {!laser && (
        <Choice
          columns={3}
          options={[
            { id: 'packers', label: 'Level and packers', blurb: 'Easiest: match a thickness.' },
            { id: 'level', label: 'Level and tape', blurb: 'Read the gap with a tape.' },
            { id: 'assumed-square', label: 'I cannot check', blurb: 'We cut the glass square.' },
          ]}
          value={subMethod}
          onChange={(v) => api.patch({ method: v, shapeConfirmed: false })}
        />
      )}

      {laser && !fromCross && (
        <div className="flex items-center gap-3 rounded border px-3 py-2 text-sm">
          <span className="flex-1 text-muted-foreground">Laser set off the wall at the bottom</span>
          <div className="relative w-24">
            <Input
              type="number"
              inputMode="numeric"
              aria-label="Laser distance off the wall at the bottom, in millimetres"
              className="h-9 pr-9 text-right tabular-nums"
              value={offset}
              onChange={(e) => api.patch({ laserOffsetMm: Math.max(0, parseInt(e.target.value, 10) || 0), shapeConfirmed: false })}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">mm</span>
          </div>
        </div>
      )}

      {unchecked ? (
        <Result>
          You have not checked whether this wall is straight up, so we will cut the glass square. Most bathrooms are out by a few
          millimetres somewhere, and where they are the gap shows at one end. If you can borrow a level, it is worth ten minutes.
        </Result>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MmInput
              id={`${key}-bottom`}
              label={laser ? 'Line to the wall, at the bottom' : 'Gap at the bottom'}
              value={wall.gapBottomMm}
              onChange={(v) => api.patchWall(key, { gapBottomMm: v })}
              onFocus={() => api.setActive('bottom')}
            />
            <MmInput
              id={`${key}-top`}
              label={laser ? 'Line to the wall, at the top' : 'Gap at the top'}
              value={wall.gapTopMm}
              onChange={(v) => api.patchWall(key, { gapTopMm: v })}
              onFocus={() => api.setActive('top')}
            />
          </div>
          <MmInput
            id={`${key}-middle`}
            label="At mid height (optional)"
            value={wall.gapMiddleMm}
            onChange={(v) => api.patchWall(key, { gapMiddleMm: v })}
            onFocus={() => api.setActive('middle')}
            hint="A third reading halfway up tells us whether the wall bows rather than leans."
          />
          {lean && (
            <Result tone="good">
              {lean.leanMm === 0 ? (
                <>{cap(name)} is <strong>straight up</strong>.</>
              ) : (
                <>
                  {cap(name)} is <strong>{lean.leanMm}mm out</strong>, leaning{' '}
                  {lean.direction === 'in' ? 'into the shower' : 'away from the shower'} at the top. The edge of the glass is cut
                  to follow it.
                </>
              )}
              {lean.isBowed && (
                <> The middle reading is {Math.abs(lean.bowMm ?? 0)}mm off a straight line, so it bows rather than leans.</>
              )}
              {runs.some(() => wallMeasured(m.startWall) || wallMeasured(m.endWall)) && (
                <div className="mt-1 text-muted-foreground">
                  {runs.length > 1
                    ? `Width at the top: ${runs.map((r, i) => `${topWidthMm(m, i, ctx)}mm along ${api.names[i]}`).join(', ')}.`
                    : `That makes the top ${topWidthMm(m, 0, ctx)}mm wide, from ${runs[0].widthAtFloorMm}mm at the floor.`}
                </div>
              )}
            </Result>
          )}
        </>
      )}
    </Frame>
  );
}

function FloorScreen({ api, screen }: { api: Api; screen: RunScreen }) {
  const { m, state, tool, templateId } = api;
  const i = screen.runIndex;
  const run = m.runs[i];
  const ends = endKinds(api, i);
  const endNames = runEndNames(state, i);
  const laser = tool === 'laser';
  const surface = templateId === 'over-bath' ? 'bath rim' : 'tray';
  const measured = floorMeasured(run);
  return (
    <Frame
      title={screen.title}
      intro={
        laser
          ? `Set the laser to a level line along where the glass will stand. Measure straight down from the line to the ${surface} at each end. The bigger reading is the lower end.`
          : `Rest a long level along the line where the glass will stand. One end will touch the ${surface}: that reading is 0. Measure the gap under the other end.`
      }
      figure={{
        kind: 'floor',
        tool,
        leftEnd: ends.left,
        rightEnd: ends.right,
        fallMm: measured ? run.floorFallMm : null,
        lowEnd: measured ? run.floorLowEnd : null,
      }}
      active={api.active ?? ((run.floorStartMm ?? null) === null ? 'start' : 'end')}
      caption={`Two readings, one at each end. We work out the fall and which way it goes. The glass is cut to sit on the ${surface} as it really is.`}
      mistakes={[
        laser ? 'Measure down from the line itself, not from the laser body.' : 'Put the level where the glass will stand, not across the middle of the tray.',
        'If both ends read the same, the floor is level: type the same number twice.',
      ]}
      photo={{
        slot: 'floor',
        prompt: laser ? 'Show the level line with the tape down to the floor.' : 'Show the level along the floor, with any gap underneath it.',
        photo: api.photoFor('floor'),
        onChange: (p) => api.setPhotoFor('floor', p),
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <MmInput
          id={`floor-start-${i}`}
          label={`At the ${endNames.start}`}
          value={run.floorStartMm ?? null}
          onChange={(v) => api.setFloor(i, v, run.floorEndMm ?? null)}
          onFocus={() => api.setActive('start')}
        />
        <MmInput
          id={`floor-end-${i}`}
          label={`At the ${endNames.end}`}
          value={run.floorEndMm ?? null}
          onChange={(v) => api.setFloor(i, run.floorStartMm ?? null, v)}
          onFocus={() => api.setActive('end')}
        />
      </div>
      {measured && (
        <Result tone="good">
          {run.floorFallMm === 0 ? (
            <>The {surface} is <strong>level</strong> along here.</>
          ) : (
            <>
              The {surface} is <strong>{run.floorFallMm}mm lower</strong> at the{' '}
              {run.floorLowEnd === 'start' ? endNames.start : endNames.end}. The bottom edge of the glass is cut on that slope, as
              one straight line.
            </>
          )}
        </Result>
      )}
    </Frame>
  );
}

function CeilingScreen({ api, screen }: { api: Api; screen: RunScreen }) {
  const { m, state, names, runIndices } = api;
  const i = screen.runIndex;
  const run = m.runs[i];
  const ends = endKinds(api, i);
  const endNames = runEndNames(state, i);
  const slope = ceilingSlope(run);
  const multi = runIndices.length > 1;
  return (
    <Frame
      title={screen.title}
      intro={`Measure from the floor straight up to the ceiling at each end of ${multi ? names[i] : 'the glass'}, on the line where it will stand. ${
        state.isFloorToCeiling
          ? 'The glass is cut to the taller reading and its top edge follows the slope between the two.'
          : 'We check both against the height you chose.'
      }`}
      figure={{
        kind: 'ceiling',
        leftEnd: ends.left,
        rightEnd: ends.right,
        dropMm: slope ? slope.dropMm : null,
        lowEnd: slope ? slope.lowEnd : null,
      }}
      active={api.active ?? ((run.ceilingStartMm ?? null) === null ? 'start' : 'end')}
      caption="Floor to ceiling, at each end. Ceilings often drop towards a wall or under a roof."
      mistakes={[
        'Measure where the glass will stand, not in the middle of the room: a ceiling can be lower at the wall.',
        'Keep the tape straight up. A tape that leans reads long.',
      ]}
    >
      <div className="grid grid-cols-2 gap-3">
        <MmInput
          id={`ceiling-start-${i}`}
          label={`Floor to ceiling at the ${endNames.start}`}
          value={run.ceilingStartMm ?? null}
          onChange={(v) => api.setCeiling(i, v, run.ceilingEndMm ?? null)}
          onFocus={() => api.setActive('start')}
        />
        <MmInput
          id={`ceiling-end-${i}`}
          label={`Floor to ceiling at the ${endNames.end}`}
          value={run.ceilingEndMm ?? null}
          onChange={(v) => api.setCeiling(i, run.ceilingStartMm ?? null, v)}
          onFocus={() => api.setActive('end')}
        />
      </div>
      {slope && (
        <Result tone="good">
          {slope.dropMm === 0 ? (
            <>The ceiling is <strong>level</strong> at {slope.highMm}mm.</>
          ) : (
            <>
              The ceiling is <strong>{slope.dropMm}mm lower</strong> at the{' '}
              {slope.lowEnd === 'start' ? endNames.start : endNames.end} ({slope.highMm}mm down to {slope.lowMm}mm).
            </>
          )}
          {state.isFloorToCeiling && (
            <div className="mt-1 text-muted-foreground">
              The glass here is cut {slope.highMm}mm tall
              {slope.dropMm > 0 ? ', with the top edge following that slope as one straight line.' : '.'}
            </div>
          )}
          {!state.isFloorToCeiling && slope.lowMm <= state.heightMm && (
            <div className="mt-1 text-muted-foreground">
              That is not above your {state.heightMm}mm glass. Lower the glass, or take it to the ceiling and we cut the top to follow.
            </div>
          )}
        </Result>
      )}
    </Frame>
  );
}

function NotchesScreen({ api, title }: { api: Api; title: string }) {
  const { state, update, walls } = api;
  const first = state.panels[0];
  const last = state.panels[state.panels.length - 1];
  const [activeSide, setActiveSide] = useState<'left' | 'right'>('left');

  const setNotch = (panelId: string, corner: 'bottom_left' | 'bottom_right', patch: Partial<NonNullable<typeof first.notches>> | null) => {
    update({
      panels: state.panels.map((p) => {
        if (p.id !== panelId) return p;
        const base = p.notches ?? { bottom_left: false, bottom_right: false, width_mm: 50, height_mm: 50 };
        if (patch === null) return { ...p, notches: { ...base, [corner]: false } };
        return { ...p, notches: { ...base, [corner]: true, ...patch } };
      }),
    });
  };

  const ends: { key: 'left' | 'right'; name: string; panel: typeof first; corner: 'bottom_left' | 'bottom_right' }[] = [];
  if (state.leftWall && walls.start) ends.push({ key: 'left', name: walls.start, panel: first, corner: 'bottom_left' });
  if (state.rightWall && walls.end && last) ends.push({ key: 'right', name: walls.end, panel: last, corner: 'bottom_right' });

  return (
    <Frame
      title={title}
      intro="A tiled upstand, a bath rim or a step where the glass meets a wall. The glass is cut to step around it. Most showers have nothing here, so skip this if yours is flat."
      figure={{ kind: 'notches', side: activeSide }}
      active={api.active}
      caption="How far the step comes out from the wall, and how tall it is. Both are measured at the glass line."
      mistakes={['Measure the step itself, not the tile trim on top of it.', 'Add a few millimetres if the step is uneven, so the glass clears it everywhere.']}
    >
      {ends.map(({ key, name, panel, corner }) => {
        const on = !!panel.notches?.[corner];
        return (
          <div key={key} className="space-y-3 rounded border p-3">
            <label className="flex cursor-pointer items-center gap-3">
              <Checkbox
                checked={on}
                onCheckedChange={(v) => {
                  setActiveSide(key);
                  setNotch(panel.id, corner, v === true ? {} : null);
                }}
              />
              <span className="text-sm">There is a step or upstand at {name}</span>
            </label>
            {on && (
              <div className="grid grid-cols-2 gap-3">
                <MmInput
                  id={`notch-${key}-w`}
                  label="How far out from the wall"
                  value={panel.notches?.width_mm ?? 50}
                  onChange={(v) => setNotch(panel.id, corner, { width_mm: v ?? 0 })}
                  onFocus={() => {
                    setActiveSide(key);
                    api.setActive('width');
                  }}
                />
                <MmInput
                  id={`notch-${key}-h`}
                  label="How tall"
                  value={panel.notches?.height_mm ?? 50}
                  onChange={(v) => setNotch(panel.id, corner, { height_mm: v ?? 0 })}
                  onFocus={() => {
                    setActiveSide(key);
                    api.setActive('height');
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
      {ends.length === 0 && <p className="text-sm text-muted-foreground">No wall ends on this shower, so nothing to step around.</p>}
    </Frame>
  );
}

function SummaryScreen({
  api,
  title,
}: {
  api: Api;
  title: string;
}) {
  const engine = useEngine();
  const { m, state, checks, screens } = api;
  const ctx = openingContext(state);
  const rows = journeySummary(state);
  const unresolved = checks.filter((c) => c.level === 'blocking' && c.code !== 'shape-unconfirmed');
  const spec = useMemo(() => buildSpec(state, engine), [state, engine]);
  const doors = spec.panels.filter((p) => p.door);
  // A sliding shower's notes are about its sizes, not a hinge: the review step shows them.
  const hingeNotes = spec.sliding ? [] : spec.warnings.filter((w) => /hinge|door/i.test(w));
  const screenIndex = (id: string) => screens.findIndex((s) => s.id === id);

  return (
    <Frame
      title={title}
      intro="Every number you gave us, and the opening drawn from them. Tap Change beside anything that does not look right."
      wide
    >
      {unresolved.length > 0 && (
        <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-4 text-sm dark:border-red-800 dark:bg-red-950/40">
          <div className="flex items-center gap-2 font-semibold text-red-900 dark:text-red-200">
            <AlertTriangle className="h-4 w-4" />
            {unresolved.length === 1 ? 'One thing still needs sorting' : `${unresolved.length} things still need sorting`}
          </div>
          <ul className="space-y-2">
            {unresolved.map((c) => (
              <li key={c.code} className="flex items-start justify-between gap-3 text-red-800 dark:text-red-300">
                <span>{c.message}</span>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => api.jump(screenIndexForCheck(c, screens, state))}>
                  Go to it
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="divide-y rounded-lg border">
        {rows.map((row, i) => (
          <div key={`${row.screenId}-${row.label}-${i}`} className="flex items-start gap-3 px-3 py-2.5 text-sm">
            <dt className="w-2/5 shrink-0 text-muted-foreground">{row.label}</dt>
            <dd className={`flex-1 ${row.status === 'missing' ? 'font-medium text-red-700 dark:text-red-300' : row.status === 'optional' ? 'text-muted-foreground' : 'font-medium'}`}>
              {row.value}
            </dd>
            {screenIndex(row.screenId) >= 0 && (
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => api.jump(screenIndex(row.screenId))}
                aria-label={`Change ${row.label.toLowerCase()}`}
              >
                <Pencil className="h-3 w-3" />
                Change
              </button>
            )}
          </div>
        ))}
      </dl>

      {unresolved.length === 0 && (
        <div className="space-y-3">
          <div className="text-sm font-medium">{m.runs.length > 1 ? 'Your opening, run by run' : 'Your opening'}</div>
          <div className="grid gap-4 sm:grid-cols-2">
            {m.runs.map((run, i) => {
              const bounding = i === 0 && ctx.hasStartWall ? signedLeanMm(m.startWall) : 0;
              const endLean = i === m.runs.length - 1 && ctx.hasEndWall ? signedLeanMm(m.endWall) : 0;
              return (
                <figure key={i} className="space-y-1">
                  <OpeningPreview
                    widthAtFloorMm={run.widthAtFloorMm}
                    widthAtTopMm={topWidthMm(m, i, ctx)}
                    heightMm={state.heightMm}
                    leftLeanMm={bounding}
                    rightLeanMm={endLean}
                    floorFallMm={run.floorFallMm}
                    floorLowEnd={run.floorLowEnd === 'start' ? 'left' : run.floorLowEnd === 'end' ? 'right' : null}
                    className="w-full rounded bg-muted/40 p-2"
                  />
                  {m.runs.length > 1 && (
                    <figcaption className="text-xs font-medium text-muted-foreground">{cap(api.names[i])}</figcaption>
                  )}
                </figure>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Leans and falls are drawn much bigger than they are so you can see which way they go. The dashed line is a perfectly
            square opening.
          </p>
        </div>
      )}

      {doors.length > 0 && (
        <div className="flex gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <div className="font-medium">Worth knowing about the door</div>
            {doors.map((d) => (
              <div key={d.id} className="text-muted-foreground">
                As laid out, the door glass is {d.cutWidthMm} × {d.cutHeightMm}mm and weighs about {Math.round(d.weightKg)}kg, which we
                would hang on {d.door!.hingeCount} × {d.door!.hingeBrand} hinges.
              </div>
            ))}
            {hingeNotes.map((w) => (
              <div key={w} className="text-amber-800 dark:text-amber-300">
                {w}
              </div>
            ))}
            {spec.blockingIssues.map((w) => (
              <div key={w} className="text-amber-800 dark:text-amber-300">
                {w}
              </div>
            ))}
            <div className="text-xs text-muted-foreground">You choose the door width and which side it hangs on the next step.</div>
          </div>
        </div>
      )}

      <label className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${unresolved.length ? 'opacity-50' : ''}`}>
        <Checkbox
          checked={m.shapeConfirmed}
          disabled={unresolved.length > 0}
          onCheckedChange={(v) => api.patch({ shapeConfirmed: v === true })}
          className="mt-0.5"
        />
        <span className="text-sm">
          Yes — these are my measurements, {m.runs.length > 1 ? 'those drawings look' : 'that drawing looks'} like my bathroom, and the
          walls lean the way shown.
        </span>
      </label>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

type ScreenStatus = 'done' | 'todo' | 'issue' | 'optional' | 'current';

/** Checks that say a number has not been given yet, as opposed to being wrong. */
const MISSING = /-missing$|-not-measured$|^no-method$|cross-missing|half-missing/;

export function MeasureStep({
  state,
  update,
  photos,
  setPhotos,
  measureCard,
  setMeasureCard,
  templateId,
}: StepProps) {
  const { heights } = useEngine().rules.making;
  const m = state.opening;
  const ctx = openingContext(state);
  const screens = useMemo(() => buildJourney(state), [state]);
  const index = Math.min(Math.max(measureCard ?? 0, 0), screens.length - 1);
  const screen = screens[index];
  const runIndices = runPanelIndices(state.panels, state.junctions);
  const singleDoor = isSingleDoor(state);
  const topGap = state.topGapMm ?? heights.singleDoorTopGapMm;

  const [active, setActive] = useState<string | null>(null);
  const [furthest, setFurthest] = useState(index);
  useEffect(() => {
    setFurthest((f) => Math.max(f, index));
    setActive(null);
  }, [index]);

  const checks = checkMeasurements(m, ctx);
  const screenOf = (c: MeasureCheck) => screenIndexForCheck(c, screens, state);
  // A screen's own empty boxes already say what is missing, and the summary
  // lists it with a link back. Saying it again in red the moment the screen
  // opens, before a single number is typed, is an alarm about nothing. So
  // the inline alerts are kept for things that are wrong, not things not
  // yet done.
  const here = checks.filter((c) => screenOf(c) === index && c.code !== 'shape-unconfirmed' && !MISSING.test(c.code));
  const earlier = checks.filter((c) => c.level === 'blocking' && screenOf(c) < index);

  const patch = (p: Partial<OpeningMeasurements>) => update({ opening: { ...m, ...p } });
  const patchRun = (i: number, p: Partial<RunMeasurement>) =>
    patch({ runs: m.runs.map((r, j) => (j === i ? { ...r, ...p } : r)), shapeConfirmed: false });

  /**
   * A run's floor width is the wall it fills, so its panels follow it. Without
   * this the customer measures 1000mm and then sees a drawing of the
   * template's default, which reads as the tool ignoring them.
   */
  const setRunFloorWidth = (i: number, widthMm: number) =>
    update({
      panels: scaleRunPanels(state.panels, runIndices[i] ?? [], widthMm),
      opening: {
        ...m,
        runs: m.runs.map((r, j) => (j === i ? { ...r, widthAtFloorMm: widthMm, halfAMm: null, halfBMm: null } : r)),
        shapeConfirmed: false,
      },
    });

  const setRunHalves = (i: number, a: number | null, b: number | null) => {
    const total = a !== null && b !== null ? Math.round(a + b) : null;
    update({
      panels: total ? scaleRunPanels(state.panels, runIndices[i] ?? [], total) : state.panels,
      opening: {
        ...m,
        runs: m.runs.map((r, j) => (j === i ? { ...r, halfAMm: a, halfBMm: b, widthAtFloorMm: total ?? r.widthAtFloorMm } : r)),
        shapeConfirmed: false,
      },
    });
  };

  const setCross = (key: CrossKey, v: number | null) => {
    const cross = m.crossReadings ?? createCrossReadings();
    const next = applyCrossReadings(m, { ...cross, [key]: v });
    const width = next.runs[0].widthAtFloorMm;
    update({
      opening: next,
      ...(width !== m.runs[0].widthAtFloorMm ? { panels: scaleRunPanels(state.panels, runIndices[0] ?? [], width) } : {}),
      // Door height follows the ceiling, less the air gap.
      ...(state.isFloorToCeiling && next.ceilingHeightMm ? { heightMm: next.ceilingHeightMm - topGap } : {}),
    });
  };

  const patchWall = (key: 'startWall' | 'endWall', p: Partial<WallMeasurement>) =>
    patch({ [key]: { ...m[key], ...p }, shapeConfirmed: false } as Partial<OpeningMeasurements>);

  const setFloor = (i: number, start: number | null, end: number | null) =>
    patch({ runs: m.runs.map((r, j) => (j === i ? applyFloorReadings(r, start, end) : r)), shapeConfirmed: false });

  /**
   * Ceiling heights set the glass height for an enclosure to the ceiling: the
   * tallest reading, because the cut size is the bounding box and the lower
   * end becomes a raked top edge.
   */
  const setCeiling = (i: number, start: number | null, end: number | null) => {
    const next: OpeningMeasurements = {
      ...m,
      runs: m.runs.map((r, j) => (j === i ? { ...r, ceilingStartMm: start, ceilingEndMm: end } : r)),
      shapeConfirmed: false,
    };
    const tallest = ceilingGlassHeightMm(next);
    update({
      opening: next,
      ...(state.isFloorToCeiling && !singleDoor && tallest ? { heightMm: tallest } : {}),
    });
  };

  const photoFor = (slot: PhotoSlot) => photos.find((p) => p.slot === slot);
  const setPhotoFor = (slot: PhotoSlot, photo: Photo | null) => {
    const rest = photos.filter((p) => p.slot !== slot);
    setPhotos(photo ? [...rest, photo] : rest);
  };

  const jump = (i: number) => setMeasureCard?.(Math.min(Math.max(i, 0), screens.length - 1));

  const api: Api = {
    state,
    update,
    templateId,
    m,
    tool: toolFor(m.method),
    singleDoor,
    names: runNames(state),
    walls: wallNames(state),
    runIndices,
    active,
    setActive,
    patch,
    patchRun,
    setRunFloorWidth,
    setRunHalves,
    setCross,
    patchWall,
    setFloor,
    setCeiling,
    photoFor,
    setPhotoFor,
    checks,
    screens,
    jump,
  };

  /**
   * Apply a corrected value a check offered. Handing someone the right number
   * to accept beats telling them they are wrong and leaving them to retype
   * it. The field is read back out of the check's code.
   */
  const applySuggestion = (check: MeasureCheck) => {
    if (check.suggestionMm === undefined) return;
    const i = check.runIndex ?? 0;
    const v = check.suggestionMm;
    if (check.code.includes('widthAtFloor')) return setRunFloorWidth(i, v);
    if (check.code.includes('widthAtTopCheck')) return patchRun(i, { widthAtTopCheckMm: v });
    if (check.code.includes('widthAtMiddleCheck')) return patchRun(i, { widthAtMiddleCheckMm: v });
    if (check.code.includes('ceiling-start')) return setCeiling(i, v, m.runs[i]?.ceilingEndMm ?? null);
    if (check.code.includes('ceiling-end')) return setCeiling(i, m.runs[i]?.ceilingStartMm ?? null, v);
  };

  const statusOf = (s: MeasureScreen, i: number): ScreenStatus => {
    if (i === index) return 'current';
    const visited = i <= furthest;
    // A screen not yet reached is simply still to do. Flagging it as a problem
    // before the customer has seen it is noise about a question not yet asked.
    if (!visited) return 'todo';
    if (checks.some((c) => c.level === 'blocking' && c.code !== 'shape-unconfirmed' && screenOf(c) === i)) return 'issue';
    switch (s.kind) {
      case 'method':
        return m.method ? 'done' : 'todo';
      case 'overview':
      case 'cross-setup':
      case 'notches':
        return visited ? 'done' : 'todo';
      case 'height':
        return 'done';
      case 'transom':
        return state.aboveDoor ? 'done' : 'todo';
      case 'cross': {
        const c = m.crossReadings;
        return c && s.points.every((n) => c[CROSS_POINTS[n - 1].key] !== null) ? 'done' : 'todo';
      }
      case 'width': {
        const run = m.runs[s.runIndex];
        return run && run.widthAtFloorMm > 0 && !(measuredInHalves(run) && halvesTotalMm(run) === null) ? 'done' : 'todo';
      }
      case 'width-top':
        return (m.runs[s.runIndex]?.widthAtTopCheckMm ?? null) !== null ? 'done' : 'optional';
      case 'wall':
        return m.method === 'assumed-square' ? 'optional' : wallMeasured(m[s.wall === 'start' ? 'startWall' : 'endWall']) ? 'done' : 'todo';
      case 'floor': {
        const run = m.runs[s.runIndex];
        return run && (floorMeasured(run) || (run.floorFallMm > 0 && run.floorLowEnd)) ? 'done' : 'todo';
      }
      case 'ceiling':
        return m.runs[s.runIndex] && ceilingMeasured(m.runs[s.runIndex]) ? 'done' : 'todo';
      case 'summary':
        return m.shapeConfirmed ? 'done' : 'todo';
    }
  };

  const body = (() => {
    switch (screen.kind) {
      case 'method':
        return <MethodScreen api={api} title={screen.title} />;
      case 'overview':
        return <OverviewScreen api={api} title={screen.title} />;
      case 'height':
        return <HeightScreen api={api} title={screen.title} />;
      case 'transom':
        return <TransomScreen api={api} title={screen.title} />;
      case 'cross-setup':
        return <CrossSetupScreen api={api} title={screen.title} />;
      case 'cross':
        return <CrossReadingsScreen api={api} screen={screen} />;
      case 'width':
        return <WidthScreen key={screen.id} api={api} screen={screen} />;
      case 'width-top':
        return <WidthTopScreen api={api} screen={screen} />;
      case 'wall':
        return <WallScreen api={api} screen={screen} />;
      case 'floor':
        return <FloorScreen api={api} screen={screen} />;
      case 'ceiling':
        return <CeilingScreen api={api} screen={screen} />;
      case 'notches':
        return <NotchesScreen api={api} title={screen.title} />;
      case 'summary':
        return <SummaryScreen api={api} title={screen.title} />;
    }
  })();

  const blocking = here.filter((c) => c.level === 'blocking');
  const confirms = here.filter((c) => c.level === 'confirm');
  const hints = here.filter((c) => c.level === 'hint');

  const alerts = (
    <>
      {blocking.length > 0 && (
        <div className="flex max-w-[560px] gap-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="space-y-2 text-sm">
            <div className="font-semibold text-red-900 dark:text-red-200">Something does not add up</div>
            {blocking.map((c) => (
              <div key={c.code} className="space-y-2">
                <p className="text-red-800 dark:text-red-300">{c.message}</p>
                {c.suggestionMm !== undefined && (
                  <Button size="sm" variant="outline" onClick={() => applySuggestion(c)}>
                    Use {c.suggestionMm}mm
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {confirms.length > 0 && (
        <div className="flex max-w-[560px] gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="space-y-2 text-sm">
            <div className="font-semibold text-amber-900 dark:text-amber-200">Worth double-checking</div>
            {confirms.map((c) => (
              <p key={c.code} className="text-amber-800 dark:text-amber-300">
                {c.message}
              </p>
            ))}
          </div>
        </div>
      )}

      {hints.length > 0 && (
        <div className="flex max-w-[560px] gap-3 rounded-lg border bg-muted/40 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1 text-sm text-muted-foreground">
            {hints.map((c) => (
              <p key={c.code}>{c.message}</p>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="md:grid md:grid-cols-[10rem_minmax(0,1fr)] md:gap-6">
      {/* The rail: every screen, with where you are and what is done. */}
      <nav aria-label="Measuring screens" className="hidden md:block">
        <ol className="sticky top-24 space-y-0.5 text-sm">
          {screens.map((s, i) => {
            const status = statusOf(s, i);
            const reachable = i <= furthest || status === 'done';
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => jump(i)}
                  aria-current={status === 'current' ? 'step' : undefined}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors duration-150 ${
                    status === 'current'
                      ? 'bg-muted font-semibold'
                      : reachable
                        ? 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                        : 'text-muted-foreground/50'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      status === 'done'
                        ? 'bg-foreground text-background'
                        : status === 'issue'
                          ? 'bg-red-600 text-white'
                          : status === 'current'
                            ? 'bg-primary text-primary-foreground'
                            : 'border text-muted-foreground'
                    }`}
                    aria-hidden
                  >
                    {status === 'done' ? <Check className="h-3 w-3" /> : status === 'issue' ? '!' : i + 1}
                  </span>
                  <span className="truncate">{s.short}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-w-0 space-y-5">
        {/* Where you are. The phone has no rail, so this carries the count. */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>
              Step {index + 1} of {screens.length}
            </span>
            {index < screens.length - 1 && (
              <button type="button" className="flex items-center gap-0.5 underline-offset-2 hover:underline" onClick={() => jump(screens.length - 1)}>
                See all your numbers
                <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((index + 1) / screens.length) * 100}%` }} />
          </div>
        </div>

        <AlertsContext.Provider value={alerts}>{body}</AlertsContext.Provider>

        {earlier.length > 0 && screen.kind !== 'summary' && (
          <div className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-xs text-muted-foreground">
            <span>
              {earlier.length === 1 ? 'An earlier screen still needs a look.' : `${earlier.length} earlier screens still need a look.`}
            </span>
            <button type="button" className="shrink-0 font-medium text-foreground underline-offset-2 hover:underline" onClick={() => jump(screenOf(earlier[0]))}>
              Go to it
            </button>
          </div>
        )}

        {screen.kind === 'summary' && !checks.some((c) => c.level === 'blocking') && (
          <p className="text-xs text-muted-foreground">That is the measuring done. Tap Next to lay out the glass.</p>
        )}
      </div>
    </div>
  );
}
