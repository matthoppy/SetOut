/**
 * The company's settings: the finishes, handles, fixing, glass and hinges its
 * customers choose from in the designer, who hears about each design, how its
 * quotes start, its colours and logo, and its name.
 *
 * Everyone on the team can see them. Only an owner can change them, a part at
 * a time, and sees a record of each change. The server checks everything
 * again, and refuses a change made from an older copy, so two owners never
 * save over each other unawares.
 */

import {
  ADJUSTABLE,
  CRL_CODE,
  crlFinishCode,
  DEFAULT_MAKING_RULES,
  GLASS_COATING_TEXT,
  GLASS_COATINGS,
  GLASS_TYPE_TEXT,
  GLASS_TYPES,
  handlePhotoOf,
  hingePhotoOf,
  IN_LINE_HINGE_STYLES,
  IN_LINE_HINGES,
  MOUNTING_TEXT,
  MOUNTINGS,
  resolveRuleset,
  RULE_GROUPS,
  RULE_TEXT,
  ruleValue,
  WALL_HINGE_STYLES,
  WALL_HINGES,
  type ChoiceText,
  type HingeStyle,
  type Offer,
  type RulesetOverrides,
} from '@setout/engine';
import { crlPhotoSrc } from '@setout/ui';
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  api,
  ApiError,
  signInAgain,
  SignedOut,
  type Branding,
  type CompanySettings,
  type DesignerChanges,
  type DesignerSettings,
  type Me,
  type PriceBook,
  type PriceChange,
  type QuoteUnit,
  type RulesSettings,
  type Settings as SettingsData,
  type PricingSettings,
  type SettingsChange,
  type SettingsChangeItem,
  type SupplierKind,
  type SupplierPriceList,
} from '../lib/api';
import { money, when, whenExactly } from '../lib/format';
import { useLoad } from '../lib/load';
import { Link } from '../lib/router';
import { Problem, Section } from './parts';

type Limits = SettingsData['limits'];

/** What went wrong, in words, or a fresh sign-in if the session has ended. */
function failure(error: unknown, otherwise: string): string {
  if (error instanceof SignedOut) {
    signInAgain();
    return '';
  }
  return error instanceof ApiError ? error.message : otherwise;
}

/** A name as the server keeps it: one line, single spaces. */
const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();
const folded = (text: string) => tidy(text).toLocaleLowerCase('en-GB');
const COLOUR = /^#[0-9a-f]{6}$/i;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** onRenamed: the company's name is shown elsewhere too, so it is fetched again. */
export function Settings({ me, onRenamed }: { me: Me; onRenamed?: () => void }) {
  const settings = useLoad<SettingsData>('settings', (signal) => api.settings(signal));
  // Which part was saved last, so it can say so once it is shown afresh.
  const [saved, setSaved] = useState<string | null>(null);
  const data = settings.data;
  const owner = data ? data.canChange : me.role === 'owner';
  const onSaved = (part: string) => {
    setSaved(part);
    settings.reload();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-quiet">
        What your customers can choose, who hears about each design, and how your quotes start.
        {owner ? ' Each part is saved on its own.' : ' Only an owner can change these.'}
      </p>
      {owner && (
        <p className="mt-2 text-sm">
          <Link to="/set-up" className="font-medium text-accent underline underline-offset-2">
            Set-up guide and the code for your website
          </Link>
        </p>
      )}

      {settings.error && !data ? <Problem error={settings.error} retry={settings.reload} /> : null}
      {!data && !settings.error && (
        <p className="pt-6 text-quiet" role="status">
          Loading the settings
        </p>
      )}

      {data && (
        <>
          {data.designers.length === 0 && (
            <Section title="Your designer">
              <p className={`${CARD} text-sm text-quiet`}>This company has no designer yet, so there are no finishes, handles or addresses to set. SetOut adds one when the company is set up.</p>
            </Section>
          )}
          {data.designers.map((designer) => (
            <div key={designer.id}>
              {data.designers.length > 1 && (
                <h2 className="mt-8 text-lg font-bold">
                  On {designer.name}
                  {!designer.active && <span className="ml-2 text-sm font-medium text-quiet">(switched off)</span>}
                </h2>
              )}
              <FinishesPart
                key={designer.versions.finishes}
                designer={designer}
                owner={owner}
                limits={data.limits}
                justSaved={saved === `finishes:${designer.id}`}
                onSaved={() => onSaved(`finishes:${designer.id}`)}
                onReload={settings.reload}
              />
              <HandlesPart
                key={designer.versions.handles}
                designer={designer}
                owner={owner}
                limits={data.limits}
                justSaved={saved === `handles:${designer.id}`}
                onSaved={() => onSaved(`handles:${designer.id}`)}
                onReload={settings.reload}
              />
              <FixingPart
                key={designer.versions.fixing}
                designer={designer}
                owner={owner}
                limits={data.limits}
                justSaved={saved === `fixing:${designer.id}`}
                onSaved={() => onSaved(`fixing:${designer.id}`)}
                onReload={settings.reload}
              />
              <GlassPart
                key={`${designer.versions.glass}-${designer.versions.glassTypes}-${designer.versions.coatings}`}
                designer={designer}
                owner={owner}
                limits={data.limits}
                justSaved={saved === `glass:${designer.id}`}
                onSaved={() => onSaved(`glass:${designer.id}`)}
                onReload={settings.reload}
              />
              <HingesPart
                key={designer.versions.hinges}
                designer={designer}
                owner={owner}
                limits={data.limits}
                justSaved={saved === `hinges:${designer.id}`}
                onSaved={() => onSaved(`hinges:${designer.id}`)}
                onReload={settings.reload}
              />
              <SlidingPart
                key={designer.versions.sliding}
                designer={designer}
                owner={owner}
                limits={data.limits}
                justSaved={saved === `sliding:${designer.id}`}
                onSaved={() => onSaved(`sliding:${designer.id}`)}
                onReload={settings.reload}
              />
              <EmailsPart
                key={designer.versions.notifyEmails}
                designer={designer}
                owner={owner}
                limits={data.limits}
                justSaved={saved === `emails:${designer.id}`}
                onSaved={() => onSaved(`emails:${designer.id}`)}
                onReload={settings.reload}
              />
              <WebsitesPart
                key={designer.versions.websites}
                designer={designer}
                owner={owner}
                limits={data.limits}
                justSaved={saved === `websites:${designer.id}`}
                onSaved={() => onSaved(`websites:${designer.id}`)}
                onReload={settings.reload}
              />
            </div>
          ))}
          <MeasurementsPart
            key={data.rules.version}
            rules={data.rules}
            owner={owner}
            justSaved={saved === 'rules'}
            onSaved={() => onSaved('rules')}
            onReload={settings.reload}
          />
          <PricesPart
            prices={data.prices}
            pricing={data.pricing}
            owner={owner}
            justSaved={saved === 'prices'}
            onSaved={() => onSaved('prices')}
            onReload={settings.reload}
          />
          <QuotesPart
            key={data.company.versions.quotes}
            company={data.company}
            owner={owner}
            justSaved={saved === 'quotes'}
            onSaved={() => onSaved('quotes')}
            onReload={settings.reload}
          />
          <BrandingPart
            key={data.company.versions.branding}
            company={data.company}
            owner={owner}
            justSaved={saved === 'branding'}
            onSaved={() => onSaved('branding')}
            onReload={settings.reload}
          />
          <NamePart
            key={data.company.versions.name}
            company={data.company}
            owner={owner}
            limits={data.limits}
            justSaved={saved === 'name'}
            onSaved={() => {
              onSaved('name');
              onRenamed?.();
            }}
            onReload={settings.reload}
          />
          {owner && data.changes && data.changes.length > 0 && <Changes changes={data.changes} me={me} several={data.designers.length > 1} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saving a part
// ---------------------------------------------------------------------------

interface PartProps {
  owner: boolean;
  justSaved: boolean;
  onSaved: () => void;
  /** Fetch the settings afresh, after someone else changed them. */
  onReload: () => void;
}

/** Saving one part of the settings: busy, what went wrong, and whether the server says someone got there first. */
function useSave(onSaved: () => void) {
  const [state, setState] = useState<{ busy: boolean; error: string | null; stale: boolean }>({ busy: false, error: null, stale: false });
  const save = async (send: () => Promise<unknown>, otherwise: string) => {
    setState({ busy: true, error: null, stale: false });
    try {
      await send();
      setState({ busy: false, error: null, stale: false });
      onSaved();
    } catch (error) {
      setState({ busy: false, error: failure(error, otherwise), stale: error instanceof ApiError && error.code === 'stale' });
    }
  };
  return { ...state, save };
}

/**
 * The set-up wizard is told whether the part on screen has changes waiting to
 * be saved, so it never moves on and loses them. The settings page gives no
 * one to tell.
 */
export const UnsavedContext = createContext<((unsaved: boolean) => void) | null>(null);

function SaveRow({
  label,
  dirty,
  valid,
  saving,
  onUndo,
  justSaved,
  savedNote,
  onReload,
}: {
  label: string;
  dirty: boolean;
  valid: boolean;
  saving: ReturnType<typeof useSave>;
  onUndo: () => void;
  justSaved: boolean;
  savedNote: string;
  onReload: () => void;
}) {
  const report = useContext(UnsavedContext);
  useEffect(() => {
    report?.(dirty);
    return () => report?.(false);
  }, [report, dirty]);
  return (
    <>
      {saving.error && (
        <div role="alert" className="mt-3 text-sm text-bad">
          {saving.stale ? (
            <>
              <p>Someone else changed this while you were editing, so your change was not saved.</p>
              <button type="button" onClick={onReload} className="mt-1 font-semibold underline underline-offset-2">
                Show their change
              </button>
            </>
          ) : (
            <p>{saving.error}</p>
          )}
        </div>
      )}
      {justSaved && !dirty && !saving.error && (
        <p role="status" className="mt-3 text-sm text-good">
          {savedNote}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={!dirty || !valid || saving.busy} className="h-10 rounded-md bg-accent px-4 font-semibold text-accent-ink disabled:opacity-50">
          {saving.busy ? 'Saving' : label}
        </button>
        {dirty && (
          <button type="button" onClick={onUndo} disabled={saving.busy} className="h-10 rounded-md border border-rule bg-surface px-4 font-medium disabled:opacity-50">
            Undo changes
          </button>
        )}
      </div>
    </>
  );
}

const FIELD = 'h-10 w-full rounded-md border bg-ground px-3 text-base';
const CARD = 'rounded-lg border border-rule bg-surface p-4';

function Hint({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-sm text-quiet">{children}</p>;
}

// ---------------------------------------------------------------------------
// Finishes and handles
// ---------------------------------------------------------------------------

/** An option as it is being changed. One without an id is new. */
interface Row {
  key: string;
  id?: string;
  label: string;
  swatch: string;
  description: string;
  /** CRL's code, as typed. */
  code: string;
}

const rowOf = (option: { id: string; label: string; swatch?: string; description?: string; code?: string }): Row => ({
  key: option.id,
  id: option.id,
  label: option.label,
  swatch: option.swatch ?? '#cccccc',
  description: option.description ?? '',
  code: option.code ?? '',
});

/** A CRL code as the server keeps it: capitals and digits, no spaces. */
const tidyCode = (code: string) => code.replace(/\s+/g, '').toUpperCase();
const codeProblem = (code: string, example: string) =>
  !tidyCode(code) || CRL_CODE.test(tidyCode(code)) ? null : `Letters and numbers only, up to 12, such as ${example}.`;

/** What is wrong with each row's name, if anything. */
function nameProblems(rows: Row[], limits: Limits): (string | null)[] {
  const seen = new Map<string, number>();
  for (const row of rows) seen.set(folded(row.label), (seen.get(folded(row.label)) ?? 0) + 1);
  return rows.map((row) => {
    const label = tidy(row.label);
    if (!label) return 'Give it a name.';
    if (label.length > limits.label) return `Keep the name to ${limits.label} characters.`;
    if ((seen.get(folded(row.label)) ?? 0) > 1) return 'Another one has this name.';
    return null;
  });
}

/** How a shower that already uses a removed option will name it from then on: as its sheets and quotes do. */
const fallbackName = (id: string) => id.replace(/[-_]+/g, ' ');

/**
 * The id the server will give a new handle, as far as how it is drilled
 * goes: made from its name the same way.
 */
const idFrom = (label: string) =>
  label
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Everything to do with changing one list: rows, the ones taken out, and
 * moving them about. Removed options that showers use are kept aside until
 * saved, with a warning, so they can be put back.
 */
function useOptionRows(original: Row[]) {
  const [rows, setRows] = useState<Row[]>(original);
  const [removed, setRemoved] = useState<{ row: Row; at: number }[]>([]);
  const [added, setAdded] = useState(0);

  const change = (key: string, patch: Partial<Row>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => {
    const at = rows.findIndex((r) => r.key === key);
    const row = rows[at];
    if (!row) return;
    setRows(rows.filter((r) => r.key !== key));
    if (row.id) setRemoved([...removed, { row, at }]);
  };
  const keep = (key: string) => {
    const back = removed.find((r) => r.row.key === key);
    if (!back) return;
    setRemoved(removed.filter((r) => r.row.key !== key));
    setRows([...rows.slice(0, back.at), back.row, ...rows.slice(back.at)]);
  };
  const moveUp = (key: string) => {
    const at = rows.findIndex((r) => r.key === key);
    if (at <= 0) return;
    setRows([...rows.slice(0, at - 1), rows[at], rows[at - 1], ...rows.slice(at + 1)]);
  };
  const add = (row: Omit<Row, 'key'>) => {
    setRows([...rows, { ...row, key: `new-${added}` }]);
    setAdded(added + 1);
  };
  const undo = () => {
    setRows(original);
    setRemoved([]);
  };
  return { rows, removed, change, remove, keep, moveUp, add, undo };
}

function MoveUp({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Move ${label || 'this one'} up`}
      title="Move up"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-rule bg-surface text-quiet disabled:opacity-30"
    >
      <span aria-hidden>↑</span>
    </button>
  );
}

function RemoveButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Remove ${label || 'this one'}`}
      title="Remove"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-sm font-medium text-bad disabled:opacity-40 sm:w-auto sm:px-2 sm:underline sm:underline-offset-2 sm:disabled:no-underline"
    >
      <span aria-hidden className="text-lg leading-none sm:hidden">
        ✕
      </span>
      <span aria-hidden className="hidden sm:inline">
        Remove
      </span>
    </button>
  );
}

/** The options that go when this is saved, and what that means for showers that already use them. */
function Removals({ kind, removed, inUse, onKeep }: { kind: string; removed: { row: Row }[]; inUse: Record<string, number>; onKeep: (key: string) => void }) {
  if (removed.length === 0) return null;
  return (
    <div className="mt-3 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">
      <p className="font-semibold">Removed when you save</p>
      <ul className="mt-1 space-y-2">
        {removed.map(({ row }) => {
          const used = (row.id && inUse[row.id]) || 0;
          return (
            <li key={row.key} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="min-w-0">
                <span className="font-medium">{row.label}</span>.{' '}
                {used > 0
                  ? `${plural(used, 'shower already uses', 'showers already use')} this ${kind}. ${used === 1 ? 'That shower keeps' : 'Those showers keep'} it, but ${used === 1 ? 'its' : 'their'} sheets and quotes will call it “${fallbackName(row.id ?? '')}” from then on.`
                  : `No shower uses this ${kind} yet.`}
              </span>
              <button type="button" onClick={() => onKeep(row.key)} className="shrink-0 font-semibold underline underline-offset-2">
                Keep it
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function UsedBy({ count }: { count: number }) {
  return count > 0 ? <span>Used by {plural(count, 'shower', 'showers')}</span> : null;
}

interface DesignerPartProps extends PartProps {
  designer: DesignerSettings;
  limits: Limits;
}

export function FinishesPart({ designer, owner, limits, justSaved, onSaved, onReload }: DesignerPartProps) {
  const original = designer.finishes.map(rowOf);
  const list = useOptionRows(original);
  const saving = useSave(onSaved);
  const { rows } = list;
  const problems = nameProblems(rows, limits);
  const colours = rows.map((r) => COLOUR.test(r.swatch));
  const codes = rows.map((r) => codeProblem(r.code, 'MBL'));
  const shape = (r: Row) => ({ id: r.id, label: tidy(r.label), swatch: r.swatch.toLowerCase(), code: tidyCode(r.code) });
  const dirty = JSON.stringify(rows.map(shape)) !== JSON.stringify(original.map(shape));
  const valid = rows.length > 0 && rows.length <= limits.options && problems.every((p) => !p) && colours.every(Boolean) && codes.every((p) => !p);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void saving.save(
      () =>
        api.saveDesignerSettings(designer.id, {
          finishes: rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), label: tidy(r.label), swatch: r.swatch.toLowerCase(), code: tidyCode(r.code) })),
          basedOn: { finishes: designer.versions.finishes },
        }),
      'The finishes could not be saved. Please try again.'
    );
  };

  if (!owner) {
    return (
      <Section title="Finishes">
        <ul className={`${CARD} grid gap-2 sm:grid-cols-2`}>
          {designer.finishes.map((f) => (
            <li key={f.id} className="flex items-center gap-3 text-sm">
              <Swatch colour={f.swatch} />
              <span className="font-medium">{f.label}</span>
              <CodeOf code={crlFinishCode(f)} />
            </li>
          ))}
        </ul>
      </Section>
    );
  }

  return (
    <Section title="Finishes" aside={<span className="text-xs text-quiet">{plural(rows.length, 'offered', 'offered')}</span>}>
      <form onSubmit={submit} className={CARD}>
        <Hint>
          Your customers choose from these in your designer, in this order. A new design starts with the first one. The CRL code goes on the
          end of each part&rsquo;s number on your installation sheets, as in GEN044<b>CH</b>; leave it empty to use CRL&rsquo;s code for a
          finish of the same name, shown faintly.
        </Hint>
        <ul className="space-y-3">
          {rows.map((row, i) => (
            <li key={row.key}>
              <div className="flex items-start gap-2">
                <label className="shrink-0">
                  <span className="sr-only">Colour of {row.label || 'this finish'}</span>
                  <input
                    type="color"
                    value={COLOUR.test(row.swatch) ? row.swatch.toLowerCase() : '#cccccc'}
                    onChange={(e) => list.change(row.key, { swatch: e.target.value })}
                    className="h-10 w-10 cursor-pointer rounded-md border border-rule bg-ground p-1 sm:w-12"
                  />
                </label>
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Name of finish {i + 1}</span>
                  <input
                    type="text"
                    value={row.label}
                    maxLength={limits.label + 20}
                    placeholder="Name, such as Brushed brass"
                    onChange={(e) => list.change(row.key, { label: e.target.value })}
                    aria-invalid={problems[i] ? true : undefined}
                    className={`${FIELD} ${problems[i] ? 'border-bad/60' : 'border-rule'}`}
                  />
                </label>
                <CodeField
                  label={`CRL code for ${row.label || 'this finish'}`}
                  value={row.code}
                  placeholder={crlFinishCode({ label: tidy(row.label) }) ?? 'CRL'}
                  invalid={codes[i] !== null}
                  onChange={(code) => list.change(row.key, { code })}
                />
                <MoveUp label={row.label} disabled={i === 0} onClick={() => list.moveUp(row.key)} />
                <RemoveButton label={row.label} disabled={rows.length === 1} onClick={() => list.remove(row.key)} />
              </div>
              <p className="ml-12 mt-1 flex flex-wrap gap-x-3 text-xs text-quiet sm:ml-14">
                {problems[i] && <span className="text-bad">{problems[i]}</span>}
                {codes[i] && <span className="text-bad">{codes[i]}</span>}
                {!row.id && <span className="font-medium text-accent">New</span>}
                {row.id && <UsedBy count={designer.inUse.finishes[row.id] ?? 0} />}
              </p>
            </li>
          ))}
        </ul>
        {rows.length === 1 && <p className="mt-2 text-xs text-quiet">Your designer needs at least one finish.</p>}
        <Removals kind="finish" removed={list.removed} inUse={designer.inUse.finishes} onKeep={list.keep} />
        {rows.length < limits.options && (
          <button
            type="button"
            onClick={() => list.add({ label: '', swatch: '#cccccc', description: '', code: '' })}
            className="mt-3 h-10 rounded-md border border-rule bg-surface px-3 text-sm font-medium"
          >
            Add a finish
          </button>
        )}
        <SaveRow
          label="Save the finishes"
          dirty={dirty}
          valid={valid}
          saving={saving}
          onUndo={list.undo}
          justSaved={justSaved}
          savedNote="Saved. Your designer offers these within a minute."
          onReload={onReload}
        />
      </form>
    </Section>
  );
}

/** How the glass is made for a handle, which SetOut fixes by its id. */
const drilling = (id: string) => (id === 'knob' ? 'Drilled with one hole, 950mm up' : 'Drilled with two holes, 203mm apart');

export function HandlesPart({ designer, owner, limits, justSaved, onSaved, onReload }: DesignerPartProps) {
  const original = designer.handles.map(rowOf);
  const list = useOptionRows(original);
  const saving = useSave(onSaved);
  const { rows } = list;
  const problems = nameProblems(rows, limits);
  const long = rows.map((r) => tidy(r.description).length > limits.description);
  const codes = rows.map((r) => codeProblem(r.code, 'BM8X8'));
  const shape = (r: Row) => ({ id: r.id, label: tidy(r.label), description: tidy(r.description), code: tidyCode(r.code) });
  const dirty = JSON.stringify(rows.map(shape)) !== JSON.stringify(original.map(shape));
  const valid = rows.length > 0 && rows.length <= limits.options && problems.every((p) => !p) && !long.some(Boolean) && codes.every((p) => !p);
  // A new handle is drilled as a pull handle, unless it takes the knob's place.
  const drilledAs = (row: Row) => drilling(row.id ?? (idFrom(row.label) === 'knob' && !rows.some((r) => r.id === 'knob') ? 'knob' : 'new'));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void saving.save(
      () =>
        api.saveDesignerSettings(designer.id, {
          handles: rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), label: tidy(r.label), description: tidy(r.description), code: tidyCode(r.code) })),
          basedOn: { handles: designer.versions.handles },
        }),
      'The handles could not be saved. Please try again.'
    );
  };

  const about = 'SetOut decides how the glass is drilled for each: two holes 203mm apart for a pull handle, and one hole 950mm up for the knob. A handle you add is drilled as a pull handle.';
  const crl = 'Give each its CRL number without the finish, such as BM8X8, and your installation sheets add the finish code.';

  if (!owner) {
    return (
      <Section title="Handles">
        <ul className={`${CARD} space-y-3 text-sm`}>
          {designer.handles.map((h) => (
            <li key={h.id} className="flex items-start gap-3">
              <HandleThumb code={h.code} />
              <div className="min-w-0">
                <p className="flex items-baseline gap-3">
                  <span className="font-medium">{h.label}</span>
                  <CodeOf code={h.code ?? null} />
                </p>
                {h.description && <p className="text-quiet">{h.description}</p>}
                <p className="text-xs text-quiet">{drilling(h.id)}</p>
              </div>
            </li>
          ))}
          {designer.handles.some((h) => handlePhotoOf(h.code, null)) && <li className="text-xs text-quiet">{PHOTOS}</li>}
        </ul>
      </Section>
    );
  }

  return (
    <Section title="Handles" aside={<span className="text-xs text-quiet">{plural(rows.length, 'offered', 'offered')}</span>}>
      <form onSubmit={submit} className={CARD}>
        <Hint>
          Your customers choose from these, in this order, and a new design starts with the first. {about} {crl}
        </Hint>
        <ul className="space-y-4">
          {rows.map((row, i) => (
            <li key={row.key} className="flex items-start gap-3">
              {/* Beside the row where there is room; on a phone, under it, so the name keeps its width. */}
              <HandleThumb code={tidyCode(row.code)} className="hidden sm:block" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Name of handle {i + 1}</span>
                    <input
                      type="text"
                      value={row.label}
                      maxLength={limits.label + 20}
                      placeholder="Name, such as Pull handle"
                      onChange={(e) => list.change(row.key, { label: e.target.value })}
                      aria-invalid={problems[i] ? true : undefined}
                      className={`${FIELD} font-medium ${problems[i] ? 'border-bad/60' : 'border-rule'}`}
                    />
                  </label>
                  <CodeField
                    label={`CRL number for ${row.label || 'this handle'}`}
                    value={row.code}
                    placeholder="CRL no."
                    invalid={codes[i] !== null}
                    onChange={(code) => list.change(row.key, { code })}
                    wide
                  />
                  <MoveUp label={row.label} disabled={i === 0} onClick={() => list.moveUp(row.key)} />
                  <RemoveButton label={row.label} disabled={rows.length === 1} onClick={() => list.remove(row.key)} />
                </div>
                <label className="mt-2 block">
                  <span className="sr-only">What your customers are told about {row.label || 'this handle'}</span>
                  <input
                    type="text"
                    value={row.description}
                    maxLength={limits.description + 20}
                    placeholder="A line for your customers, if you like"
                    onChange={(e) => list.change(row.key, { description: e.target.value })}
                    aria-invalid={long[i] ? true : undefined}
                    className={`${FIELD} text-sm ${long[i] ? 'border-bad/60' : 'border-rule'}`}
                  />
                </label>
                <HandleThumb code={tidyCode(row.code)} className="mt-2 sm:hidden" />
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-quiet">
                  {problems[i] && <span className="text-bad">{problems[i]}</span>}
                  {long[i] && <span className="text-bad">Keep the line to {limits.description} characters.</span>}
                  {codes[i] && <span className="text-bad">{codes[i]}</span>}
                  {!row.id && <span className="font-medium text-accent">New</span>}
                  <span>{drilledAs(row)}</span>
                  {row.id && <UsedBy count={designer.inUse.handles[row.id] ?? 0} />}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {rows.some((r) => handlePhotoOf(tidyCode(r.code), null)) && <p className="mt-3 text-xs text-quiet">{PHOTOS}</p>}
        {rows.length === 1 && <p className="mt-2 text-xs text-quiet">Your designer needs at least one handle.</p>}
        <Removals kind="handle" removed={list.removed} inUse={designer.inUse.handles} onKeep={list.keep} />
        {rows.length < limits.options && (
          <button
            type="button"
            onClick={() => list.add({ label: '', swatch: '', description: '', code: '' })}
            className="mt-3 h-10 rounded-md border border-rule bg-surface px-3 text-sm font-medium"
          >
            Add a handle
          </button>
        )}
        <SaveRow
          label="Save the handles"
          dirty={dirty}
          valid={valid}
          saving={saving}
          onUndo={list.undo}
          justSaved={justSaved}
          savedNote="Saved. Your designer offers these within a minute."
          onReload={onReload}
        />
      </form>
    </Section>
  );
}

function Swatch({ colour }: { colour: string }) {
  return <span className="h-6 w-6 shrink-0 rounded-full border border-rule" style={{ background: colour }} aria-hidden />;
}

/** A CRL code, typed in capitals. */
function CodeField({
  label,
  value,
  placeholder,
  invalid,
  onChange,
  wide = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  invalid: boolean;
  onChange: (code: string) => void;
  wide?: boolean;
}) {
  return (
    <label className={`shrink-0 ${wide ? 'w-28' : 'w-20'}`}>
      <span className="sr-only">{label}</span>
      <input
        type="text"
        value={value}
        maxLength={20}
        placeholder={placeholder}
        autoCapitalize="characters"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        aria-invalid={invalid ? true : undefined}
        className={`${FIELD} font-mono uppercase placeholder:normal-case ${invalid ? 'border-bad/60' : 'border-rule'}`}
      />
    </label>
  );
}

function CodeOf({ code }: { code: string | null }) {
  return code ? <span className="font-mono text-xs text-quiet">CRL {code}</span> : null;
}

// ---------------------------------------------------------------------------
// Who is emailed
// ---------------------------------------------------------------------------

const EMAIL = /^[^\s@<>,;:"]+@[^\s@<>,;:"]+\.[^\s@<>,;:"]+$/;

/** The thicknesses SetOut makes showers in. */
const THICKNESSES = [8, 10, 12];
const millimetres = (list: number[]) => listed(list.map((mm) => `${mm}mm`));

/** The same offer: the same ones, in the same order, with the same standard. */
const sameOffer = <T extends string>(a: Offer<T>, b: Offer<T>) => a.offered.join() === b.offered.join() && a.standard === b.standard;
const validOffer = <T extends string>(o: Offer<T>) => o.offered.length > 0 && o.offered.includes(o.standard);
/** An offer in words: "U-channel and glass clamps. A new design starts with U-channel." */
const offerWords = <T extends string>(o: Offer<T>, text: Record<T, ChoiceText>) =>
  `${listed(o.offered.map((id) => text[id].words))}. A new design starts with ${text[o.standard].words}.`;

/** One kind of choice: which customers may choose, and the one a new design starts with. */
function OfferList<T extends string>({
  legend,
  ids,
  text,
  offer,
  onChange,
  name,
}: {
  legend: string;
  ids: readonly T[];
  text: Record<T, ChoiceText>;
  offer: Offer<T>;
  onChange: (offer: Offer<T>) => void;
  name: string;
}) {
  const toggle = (id: T) => {
    const offered = offer.offered.includes(id) ? offer.offered.filter((o) => o !== id) : ids.filter((o) => o === id || offer.offered.includes(o));
    onChange({ offered, standard: offered.includes(offer.standard) || offered.length === 0 ? offer.standard : offered[0] });
  };
  return (
    <fieldset className="mt-4 first:mt-0">
      <legend className="text-sm font-semibold">{legend}</legend>
      <ul className="mt-2 divide-y divide-rule rounded-md border border-rule">
        {ids.map((id) => (
          <li key={id} className="flex items-start gap-3 px-3 py-2">
            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
              <input type="checkbox" checked={offer.offered.includes(id)} onChange={() => toggle(id)} className="mt-1 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="font-medium">{text[id].label}</span>
                <span className="block text-xs text-quiet">{text[id].description}</span>
              </span>
            </label>
            <label className={`flex shrink-0 items-center gap-1.5 text-xs ${offer.offered.includes(id) ? 'cursor-pointer' : 'invisible'}`}>
              <input type="radio" name={name} checked={offer.standard === id} onChange={() => onChange({ ...offer, standard: id })} className="h-4 w-4" />
              Standard
            </label>
          </li>
        ))}
      </ul>
      {offer.offered.length === 0 && <p className="mt-2 text-xs text-bad">Offer at least one.</p>}
    </fieldset>
  );
}

/** How the fixed glass is held: which ways customers may choose, and the one a new design starts with. */
export function FixingPart({ designer, owner, justSaved, onSaved, onReload }: DesignerPartProps) {
  const [fixing, setFixing] = useState(designer.fixing);
  const saving = useSave(onSaved);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void saving.save(
      () => api.saveDesignerSettings(designer.id, { fixing, basedOn: { fixing: designer.versions.fixing } }),
      'The fixing could not be saved. Please try again.'
    );
  };

  const about =
    'How the fixed glass is held: in U-channel along the wall and floor, or with glass clamps. Your customers choose from the ones you offer, and a new design starts with your standard one. Staff can make any shower with either.';

  if (!owner) {
    return (
      <Section title="Fixing">
        <div className={`${CARD} text-sm`}>
          <Hint>{about}</Hint>
          <p>
            Offered: <span className="font-medium">{offerWords(designer.fixing, MOUNTING_TEXT)}</span>
          </p>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Fixing">
      <form onSubmit={submit} className={CARD}>
        <Hint>{about}</Hint>
        <OfferList legend="Fixing your customers can choose" ids={MOUNTINGS} text={MOUNTING_TEXT} offer={fixing} onChange={setFixing} name={`fixing-${designer.id}`} />
        <SaveRow
          label="Save the fixing"
          dirty={!sameOffer(fixing, designer.fixing)}
          valid={validOffer(fixing)}
          saving={saving}
          onUndo={() => setFixing(designer.fixing)}
          justSaved={justSaved}
          savedNote="Saved. Your designer offers these within a minute."
          onReload={onReload}
        />
      </form>
    </Section>
  );
}

export function GlassPart({ designer, owner, justSaved, onSaved, onReload }: DesignerPartProps) {
  const [offered, setOffered] = useState<number[]>(designer.glass.offered);
  const [standard, setStandard] = useState(designer.glass.standard);
  const [types, setTypes] = useState(designer.glassTypes);
  const [coatings, setCoatings] = useState(designer.coatings);
  const saving = useSave(onSaved);
  const thicknessChanged = offered.join() !== designer.glass.offered.join() || standard !== designer.glass.standard;
  const typesChanged = !sameOffer(types, designer.glassTypes);
  const coatingsChanged = !sameOffer(coatings, designer.coatings);
  const dirty = thicknessChanged || typesChanged || coatingsChanged;
  const valid = offered.length > 0 && offered.includes(standard) && validOffer(types) && validOffer(coatings);

  const toggle = (mm: number) => {
    const next = offered.includes(mm) ? offered.filter((t) => t !== mm) : [...offered, mm].sort((a, b) => a - b);
    setOffered(next);
    // New designs must start at a thickness on offer: 10mm if it is, or the first.
    if (next.length && !next.includes(standard)) setStandard(next.includes(10) ? 10 : next[0]);
  };
  const undo = () => {
    setOffered(designer.glass.offered);
    setStandard(designer.glass.standard);
    setTypes(designer.glassTypes);
    setCoatings(designer.coatings);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    // Only what changed is sent, so a change someone else made to the rest is not in the way.
    const changes: DesignerChanges = { basedOn: {} };
    if (thicknessChanged) {
      changes.glass = { offered, standard };
      changes.basedOn.glass = designer.versions.glass;
    }
    if (typesChanged) {
      changes.glassTypes = types;
      changes.basedOn.glassTypes = designer.versions.glassTypes;
    }
    if (coatingsChanged) {
      changes.coatings = coatings;
      changes.basedOn.coatings = designer.versions.coatings;
    }
    void saving.save(() => api.saveDesignerSettings(designer.id, changes), 'The glass could not be saved. Please try again.');
  };

  const about =
    'Your customers choose from the thicknesses, glass types and coatings you offer, and a new design starts with your standard of each. Staff can make any shower in any of them. Glass you have not quoted before starts unpriced.';

  if (!owner) {
    return (
      <Section title="Glass">
        <div className={`${CARD} text-sm`}>
          <Hint>{about}</Hint>
          <p>
            Offered: <span className="font-medium">{millimetres(designer.glass.offered)}</span>. A new design starts at{' '}
            <span className="font-medium">{designer.glass.standard}mm</span>.
          </p>
          <p className="mt-2">
            Glass types: <span className="font-medium">{offerWords(designer.glassTypes, GLASS_TYPE_TEXT)}</span>
          </p>
          <p className="mt-2">
            Coatings: <span className="font-medium">{offerWords(designer.coatings, GLASS_COATING_TEXT)}</span>
          </p>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Glass">
      <form onSubmit={submit} className={CARD}>
        <Hint>{about}</Hint>
        <fieldset>
          <legend className="text-sm font-semibold">Thicknesses your customers can choose</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {THICKNESSES.map((mm) => (
              <label key={mm} className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-rule bg-ground px-3">
                <input type="checkbox" checked={offered.includes(mm)} onChange={() => toggle(mm)} className="h-4 w-4" />
                <span className="font-medium">{mm}mm</span>
              </label>
            ))}
          </div>
          {offered.length === 0 && <p className="mt-2 text-xs text-bad">Offer at least one thickness.</p>}
        </fieldset>
        {offered.length > 1 && (
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">A new design starts at</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {offered.map((mm) => (
                <label key={mm} className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-rule bg-ground px-3">
                  <input type="radio" name={`standard-${designer.id}`} checked={standard === mm} onChange={() => setStandard(mm)} className="h-4 w-4" />
                  <span className="font-medium">{mm}mm</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <OfferList legend="Glass types your customers can choose" ids={GLASS_TYPES} text={GLASS_TYPE_TEXT} offer={types} onChange={setTypes} name={`glass-type-${designer.id}`} />
        <OfferList legend="Coatings your customers can choose" ids={GLASS_COATINGS} text={GLASS_COATING_TEXT} offer={coatings} onChange={setCoatings} name={`coating-${designer.id}`} />
        <SaveRow
          label="Save the glass"
          dirty={dirty}
          valid={valid}
          saving={saving}
          onUndo={undo}
          justSaved={justSaved}
          savedNote="Saved. Your designer offers these within a minute."
          onReload={onReload}
        />
      </form>
    </Section>
  );
}

/**
 * Whether the designer offers sliding doors. Off until an owner turns it on:
 * the sizes are CRL's own for its Serenity kit, and are not confirmed yet.
 */
export function SlidingPart({ designer, owner, justSaved, onSaved, onReload }: DesignerPartProps) {
  const [on, setOn] = useState(designer.sliding);
  const saving = useSave(onSaved);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void saving.save(
      () => api.saveDesignerSettings(designer.id, { sliding: on, basedOn: { sliding: designer.versions.sliding } }),
      'Sliding doors could not be saved. Please try again.'
    );
  };

  const about =
    'Sliding doors are on CRL’s Serenity kit: one fixed panel and one sliding door, wall to wall, or with a side panel returning to the wall. SetOut cuts them to CRL’s own installation sheets. Those sizes have not been confirmed against a job yet, so sliding is off until you turn it on, and every sheet a sliding shower appears on says its sizes are to be checked before glass is ordered.';

  if (!owner) {
    return (
      <Section title="Sliding doors">
        <div className={`${CARD} text-sm`}>
          <Hint>{about}</Hint>
          <p>
            Sliding doors are <span className="font-medium">{designer.sliding ? 'offered to your customers' : 'not offered'}</span>.
          </p>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Sliding doors">
      <form onSubmit={submit} className={CARD}>
        <Hint>{about}</Hint>
        <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-rule bg-ground px-3 py-2">
          <input type="checkbox" checked={on} onChange={() => setOn(!on)} className="h-4 w-4" />
          <span className="font-medium">Offer sliding doors (CRL Serenity) in this designer</span>
        </label>
        <SaveRow
          label="Save sliding doors"
          dirty={on !== designer.sliding}
          valid
          saving={saving}
          onUndo={() => setOn(designer.sliding)}
          justSaved={justSaved}
          savedNote={designer.sliding ? 'Saved. Your designer offers sliding doors within a minute.' : 'Saved. Your designer stops offering sliding doors within a minute.'}
          onReload={onReload}
        />
      </form>
    </Section>
  );
}

const hingeName = (style: HingeStyle) => [style.Geneva, style.Vienna].filter(Boolean).join(', ');

/** One way of hanging's hinges: which customers may choose, and the standard. */
function HingeList<T extends string>({
  legend,
  ids,
  styles,
  offered,
  standard,
  onChange,
  name,
}: {
  legend: string;
  ids: readonly T[];
  styles: Record<T, HingeStyle>;
  offered: T[];
  standard: T;
  onChange: (offered: T[], standard: T) => void;
  name: string;
}) {
  const toggle = (id: T) => {
    const next = offered.includes(id) ? offered.filter((h) => h !== id) : ids.filter((h) => h === id || offered.includes(h));
    onChange(next, next.includes(standard) || next.length === 0 ? standard : next[0]);
  };
  return (
    <fieldset className="mt-4 first:mt-0">
      <legend className="text-sm font-semibold">{legend}</legend>
      <ul className="mt-2 divide-y divide-rule rounded-md border border-rule">
        {ids.map((id) => (
          <li key={id} className="flex items-start gap-3 px-3 py-2">
            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
              <input type="checkbox" checked={offered.includes(id)} onChange={() => toggle(id)} className="mt-1 h-4 w-4 shrink-0" />
              <HingeThumb style={styles[id]} />
              <span className="min-w-0">
                <span className="font-medium">{styles[id].name}</span>{' '}
                <span className="ml-1 font-mono text-xs text-quiet">{hingeName(styles[id])}</span>{' '}
                <span className="block text-xs text-quiet">{styles[id].about}</span>
              </span>
            </label>
            <label className={`flex shrink-0 items-center gap-1.5 text-xs ${offered.includes(id) ? 'cursor-pointer' : 'invisible'}`}>
              <input type="radio" name={name} checked={standard === id} onChange={() => onChange(offered, id)} className="h-4 w-4" />
              Standard
            </label>
          </li>
        ))}
      </ul>
      {offered.length === 0 && <p className="mt-2 text-xs text-bad">Offer at least one.</p>}
    </fieldset>
  );
}

/**
 * CRL's photo of a part, small, beside its name. Nothing where there is no
 * photo, or it will not load. The name beside it says what it is, so the
 * photo says nothing to a screen reader, and a tick box keeps its own name.
 */
function Thumb({ file, className = '' }: { file: string | undefined; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!file || failed === file) return null;
  return (
    <img
      src={crlPhotoSrc(file)}
      alt=""
      width={40}
      height={40}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(file)}
      className={`h-10 w-10 shrink-0 rounded border border-rule bg-white object-contain p-0.5 ${className}`}
    />
  );
}

/** A hinge style's photo: Geneva's, or Vienna's where only Vienna makes it. */
function HingeThumb({ style }: { style: HingeStyle }) {
  const photo = hingePhotoOf(style, null, null);
  return <Thumb file={photo?.file} />;
}

/** A handle's photo, once it has a CRL number CRL shows a photo for. */
function HandleThumb({ code, className }: { code: string | undefined; className?: string }) {
  const photo = handlePhotoOf(code, null);
  return <Thumb file={photo?.file} className={className} />;
}

const PHOTOS = 'Photos: C.R. Laurence. Each shows the part’s shape, in whichever finish CRL photographed it.';

export function HingesPart({ designer, owner, justSaved, onSaved, onReload }: DesignerPartProps) {
  const [hinges, setHinges] = useState(designer.hinges);
  const saving = useSave(onSaved);
  const dirty = JSON.stringify(hinges) !== JSON.stringify(designer.hinges);
  const valid = hinges.wall.offered.includes(hinges.wall.standard) && hinges.inLine.offered.includes(hinges.inLine.standard);
  const cuts = [
    ['mouse-ear', 'Mouse ear', 'Two 16mm holes drilled as well, so the glass costs more to make.'],
    ['rectangular', 'Rectangular', 'A 12mm hole at each inner corner instead. The fitters take two screws out of each hinge.'],
  ] as const;
  const fits = [
    ['with-seals', 'With seals', 'The door’s notch 58mm high by 47mm deep.'],
    ['without-seals', 'Without seals', 'Often better for a bigger shower. The door’s notch 58mm by 52mm deep, in a rebate 6mm deep and 84mm high.'],
  ] as const;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void saving.save(
      () => api.saveDesignerSettings(designer.id, { hinges, basedOn: { hinges: designer.versions.hinges } }),
      'The hinges could not be saved. Please try again.'
    );
  };

  const about =
    'Which of CRL’s hinges your customers can choose, where a door hangs from a wall and where it hangs from the glass beside it. A new design starts with the standard one. Staff can choose any for a shower. Each range has its own cut-out (Vienna’s is bigger than Geneva’s); a hinge whose cut-out has not been checked against CRL’s drawing of it is marked on the glass order to check against the template in its box. Bellagio makes one of each (BEL344 to the wall, BEL380 in line), and every range one hinge for a corner.';

  if (!owner) {
    const listed = <T extends string>(offered: T[], styles: Record<T, HingeStyle>, standard: T) => (
      <ul className="mt-1 space-y-1">
        {offered.map((id) => (
          <li key={id} className="flex items-center gap-3">
            <HingeThumb style={styles[id]} />
            <span className="font-medium">
              {styles[id].name}
              {id === standard ? ' (standard)' : ''}
            </span>
          </li>
        ))}
      </ul>
    );
    return (
      <Section title="Hinges">
        <div className={`${CARD} space-y-1 text-sm`}>
          <Hint>{about}</Hint>
          <div>
            To the wall:
            {listed(designer.hinges.wall.offered, WALL_HINGE_STYLES, designer.hinges.wall.standard)}
          </div>
          <div>
            In line:
            {listed(designer.hinges.inLine.offered, IN_LINE_HINGE_STYLES, designer.hinges.inLine.standard)}
          </div>
          <p className="text-xs text-quiet">{PHOTOS}</p>
          <p>
            Vienna cut-out: <span className="font-medium">{designer.hinges.viennaCutout === 'rectangular' ? 'Rectangular' : 'Mouse ear'}</span>
          </p>
          <p>
            Bellagio: <span className="font-medium">{designer.hinges.bellagioFit === 'without-seals' ? 'without seals' : 'with seals'}</span>
          </p>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Hinges">
      <form onSubmit={submit} className={CARD}>
        <Hint>{about}</Hint>
        <HingeList
          legend="Doors hung from a wall"
          ids={WALL_HINGES}
          styles={WALL_HINGE_STYLES}
          offered={hinges.wall.offered}
          standard={hinges.wall.standard}
          onChange={(offered, standard) => setHinges({ ...hinges, wall: { offered, standard } })}
          name={`wall-${designer.id}`}
        />
        <HingeList
          legend="Doors hung in line from the glass"
          ids={IN_LINE_HINGES}
          styles={IN_LINE_HINGE_STYLES}
          offered={hinges.inLine.offered}
          standard={hinges.inLine.standard}
          onChange={(offered, standard) => setHinges({ ...hinges, inLine: { offered, standard } })}
          name={`in-line-${designer.id}`}
        />
        <p className="mt-2 text-xs text-quiet">{PHOTOS}</p>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">How a Vienna hinge’s cut-out is made</legend>
          <p className="text-xs text-quiet">Both are CRL’s, 76mm by 46mm. Staff can choose the other for a shower.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {cuts.map(([id, name, about]) => (
              <label key={id} className="flex cursor-pointer items-start gap-2 rounded-md border border-rule px-3 py-2">
                <input
                  type="radio"
                  name={`vienna-${designer.id}`}
                  checked={hinges.viennaCutout === id}
                  onChange={() => setHinges({ ...hinges, viennaCutout: id })}
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <span>
                  <span className="font-medium">{name}</span>{' '}
                  <span className="block text-xs text-quiet">{about}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">How a Bellagio hinge is fitted</legend>
          <p className="text-xs text-quiet">Both are CRL’s. The panels are cut the same either way. Staff can choose the other for a shower.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {fits.map(([id, name, about]) => (
              <label key={id} className="flex cursor-pointer items-start gap-2 rounded-md border border-rule px-3 py-2">
                <input
                  type="radio"
                  name={`bellagio-${designer.id}`}
                  checked={hinges.bellagioFit === id}
                  onChange={() => setHinges({ ...hinges, bellagioFit: id })}
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <span>
                  <span className="font-medium">{name}</span>{' '}
                  <span className="block text-xs text-quiet">{about}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <SaveRow
          label="Save the hinges"
          dirty={dirty}
          valid={valid}
          saving={saving}
          onUndo={() => setHinges(designer.hinges)}
          justSaved={justSaved}
          savedNote="Saved. Your designer offers these within a minute."
          onReload={onReload}
        />
      </form>
    </Section>
  );
}

export function EmailsPart({ designer, owner, limits, justSaved, onSaved, onReload }: DesignerPartProps) {
  const original = designer.notifyEmails.length ? designer.notifyEmails : [''];
  const [emails, setEmails] = useState<string[]>(original);
  const saving = useSave(onSaved);
  const typed = emails.map((e) => e.trim().toLowerCase());
  const filled = typed.filter(Boolean);
  const bad = typed.map((e) => e !== '' && !EMAIL.test(e));
  const dirty = JSON.stringify(filled) !== JSON.stringify(designer.notifyEmails);
  const valid = filled.length > 0 && filled.length <= limits.notifyEmails && !bad.some(Boolean);
  const nobody = designer.notifyEmails.length === 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void saving.save(
      () => api.saveDesignerSettings(designer.id, { notifyEmails: filled, basedOn: { notifyEmails: designer.versions.notifyEmails } }),
      'The addresses could not be saved. Please try again.'
    );
  };

  const about =
    'Each design your customers send is emailed to these addresses, and so is each quote a customer accepts. When a customer replies to their copy of a design or to a quote, the reply goes to the first address.';

  return (
    <Section title="Who hears about each design">
      {!owner ? (
        <div className={`${CARD} text-sm`}>
          <Hint>{about}</Hint>
          {nobody ? (
            <p className="text-warn">Nobody is emailed yet. New designs still arrive in the inbox.</p>
          ) : (
            <ul className="space-y-1">
              {designer.notifyEmails.map((e) => (
                <li key={e} className="break-all font-medium">
                  {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className={CARD}>
          <Hint>{about}</Hint>
          {nobody && <p className="mb-3 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">Nobody is emailed yet. New designs arrive in the inbox, but no one is told.</p>}
          <ul className="space-y-2">
            {emails.map((email, i) => (
              <li key={i}>
                <div className="flex items-center gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Address {i + 1}</span>
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      value={email}
                      placeholder="sales@yourcompany.co.uk"
                      onChange={(e) => setEmails(emails.map((v, j) => (j === i ? e.target.value : v)))}
                      aria-invalid={bad[i] ? true : undefined}
                      className={`${FIELD} ${bad[i] ? 'border-bad/60' : 'border-rule'}`}
                    />
                  </label>
                  <RemoveButton label={email} disabled={emails.length === 1} onClick={() => setEmails(emails.filter((_, j) => j !== i))} />
                </div>
                {bad[i] && <p className="mt-1 text-xs text-bad">That does not look like an email address.</p>}
                {i === 0 && emails.length > 1 && !bad[i] && <p className="mt-1 text-xs text-quiet">Replies from customers go here.</p>}
              </li>
            ))}
          </ul>
          {filled.length === 0 && <p className="mt-2 text-xs text-bad">Add at least one address, so each new design reaches someone.</p>}
          {emails.length < limits.notifyEmails ? (
            <button type="button" onClick={() => setEmails([...emails, ''])} className="mt-3 h-10 rounded-md border border-rule bg-surface px-3 text-sm font-medium">
              Add an address
            </button>
          ) : (
            <p className="mt-3 text-xs text-quiet">Up to {limits.notifyEmails} addresses can be emailed.</p>
          )}
          <SaveRow
            label="Save the addresses"
            dirty={dirty}
            valid={valid}
            saving={saving}
            onUndo={() => setEmails(original)}
            justSaved={justSaved}
            savedNote="Saved. The next design that arrives goes to these addresses."
            onReload={onReload}
          />
        </form>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Websites
// ---------------------------------------------------------------------------

/** A website as the server keeps it: https and the site's own address, nothing after it. Null if it is not one. */
export function websiteOf(typed: string): string | null {
  const text = typed.trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || /^[\d.]+$/.test(url.hostname)) return null;
    return `https://${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

export function WebsitesPart({ designer, owner, limits, justSaved, onSaved, onReload }: DesignerPartProps) {
  const original = designer.websites.length ? designer.websites : [''];
  const [sites, setSites] = useState<string[]>(original);
  const saving = useSave(onSaved);
  const read = sites.map((site) => (site.trim() ? websiteOf(site) : ''));
  const bad = read.map((site) => site === null);
  const filled = [...new Set(read.filter((site): site is string => Boolean(site)))];
  const dirty = JSON.stringify(filled) !== JSON.stringify(designer.websites);
  const valid = !bad.some(Boolean) && filled.length <= limits.websites;
  const none = designer.websites.length === 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void saving.save(
      () => api.saveDesignerSettings(designer.id, { websites: filled, basedOn: { websites: designer.versions.websites } }),
      'The websites could not be saved. Please try again.'
    );
  };

  const about =
    'The designer shows only on the websites listed here. A browser refuses to show it anywhere else, so nobody can put your designer on a site of their own. List each address your site answers on: with www and without are two addresses.';

  return (
    <Section title="Websites the designer appears on">
      {!owner ? (
        <div className={`${CARD} text-sm`}>
          <Hint>{about}</Hint>
          {none ? (
            <p className="text-warn">No website is listed yet, so the designer shows nowhere.</p>
          ) : (
            <ul className="space-y-1">
              {designer.websites.map((site) => (
                <li key={site} className="break-all font-medium">
                  {site}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className={CARD}>
          <Hint>{about}</Hint>
          {none && <p className="mb-3 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">No website is listed yet, so the designer will not show on your site.</p>}
          <ul className="space-y-2">
            {sites.map((site, i) => (
              <li key={i}>
                <div className="flex items-center gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Website {i + 1}</span>
                    <input
                      type="text"
                      inputMode="url"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={site}
                      placeholder="https://www.yourcompany.co.uk"
                      onChange={(e) => setSites(sites.map((v, j) => (j === i ? e.target.value : v)))}
                      aria-invalid={bad[i] ? true : undefined}
                      className={`${FIELD} ${bad[i] ? 'border-bad/60' : 'border-rule'}`}
                    />
                  </label>
                  <RemoveButton label={site} disabled={sites.length === 1 && !site} onClick={() => setSites(sites.length === 1 ? [''] : sites.filter((_, j) => j !== i))} />
                </div>
                {bad[i] && <p className="mt-1 text-xs text-bad">That is not a website’s address. It should look like https://www.yourcompany.co.uk.</p>}
                {!bad[i] && read[i] && read[i] !== site.trim() && <p className="mt-1 text-xs text-quiet">Kept as {read[i]}</p>}
              </li>
            ))}
          </ul>
          {sites.length < limits.websites ? (
            <button type="button" onClick={() => setSites([...sites, ''])} className="mt-3 h-10 rounded-md border border-rule bg-surface px-3 text-sm font-medium">
              Add a website
            </button>
          ) : (
            <p className="mt-3 text-xs text-quiet">A designer can be shown on up to {limits.websites} websites.</p>
          )}
          <SaveRow
            label="Save the websites"
            dirty={dirty}
            valid={valid}
            saving={saving}
            onUndo={() => setSites(original)}
            justSaved={justSaved}
            savedNote={filled.length ? 'Saved. The designer can be shown on these websites from now.' : 'Saved. The designer now shows nowhere.'}
            onReload={onReload}
          />
        </form>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

type NamedRule = keyof typeof RULE_TEXT;
const NAMED_RULES = Object.keys(RULE_TEXT) as NamedRule[];
const boundsOf = (rule: NamedRule) => ADJUSTABLE[rule] as { min: number; max: number };
const standardOf = (rule: NamedRule) => ruleValue(DEFAULT_MAKING_RULES, rule);
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
/** A rule that is one of a few choices, rather than a measurement. */
const choicesOf = (rule: NamedRule): Readonly<Record<string, string>> | undefined => (RULE_TEXT[rule] as { choices?: Readonly<Record<string, string>> }).choices;
/** A rule's value as an owner reads it: "10mm", or the choice in words. */
const inWords = (rule: string, value: number | string): string => {
  const text = (RULE_TEXT as Record<string, { unit?: string; choices?: Readonly<Record<string, string>> } | undefined>)[rule];
  return text?.choices ? lowerFirst(text.choices[String(value)] ?? String(value)) : `${value}${text?.unit ?? ''}`;
};

/** The value set for a rule: a whole number inside its bounds, one of its choices, or NaN. */
function ruleNumber(rule: NamedRule, typed: string): number | string {
  const choices = choicesOf(rule);
  if (choices) return Object.hasOwn(choices, typed) ? typed : NaN;
  if (!/^\d+$/.test(typed.trim())) return NaN;
  const value = Number(typed.trim());
  const { min, max } = boundsOf(rule);
  return value >= min && value <= max ? value : NaN;
}

/**
 * What comes off each pane, a door's gaps, the channel's depth and the
 * company's own limits. SetOut's standards are filled in until an owner
 * changes one; only the ones that differ are saved.
 */
function MeasurementsPart({ rules, owner, justSaved, onSaved, onReload }: PartProps & { rules: RulesSettings }) {
  const making = resolveRuleset(rules.overrides).making;
  const original = Object.fromEntries(NAMED_RULES.map((rule) => [rule, String(ruleValue(making, rule))])) as Record<NamedRule, string>;
  const [form, setForm] = useState(original);
  const saving = useSave(onSaved);
  const numbers = Object.fromEntries(NAMED_RULES.map((rule) => [rule, ruleNumber(rule, form[rule])])) as Record<NamedRule, number | string>;
  const valid = NAMED_RULES.every((rule) => !Number.isNaN(numbers[rule]));
  const dirty = NAMED_RULES.some((rule) => form[rule].trim() !== original[rule]);
  const grouped = RULE_GROUPS.map((group) => ({ group, rules: NAMED_RULES.filter((rule) => RULE_TEXT[rule].group === group) }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const overrides: RulesetOverrides = {};
    for (const rule of NAMED_RULES) if (numbers[rule] !== standardOf(rule)) overrides[rule] = numbers[rule];
    void saving.save(() => api.saveRules(overrides, rules.version), 'The measurements could not be saved. Please try again.');
  };

  if (!owner) {
    return (
      <Section title="Measurements">
        <div className={`${CARD} text-sm`}>
          <p className="text-quiet">What comes off each pane, and the gaps and limits your showers are made to. Only an owner can change them.</p>
          {grouped.map(({ group, rules: inGroup }) => (
            <div key={group} className="mt-4">
              <h3 className="font-semibold">{group}</h3>
              <dl className="mt-1 divide-y divide-rule">
                {inGroup.map((rule) => (
                  <div key={rule} className="flex items-baseline justify-between gap-4 py-1.5">
                    <dt>{RULE_TEXT[rule].label}</dt>
                    <dd className="whitespace-nowrap tabular-nums">{choicesOf(rule) ? choicesOf(rule)![String(ruleValue(making, rule))] : inWords(rule, ruleValue(making, rule))}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </Section>
    );
  }

  return (
    <Section title="Measurements">
      <form onSubmit={submit} className={CARD}>
        <Hint>
          What comes off each pane, and the gaps and limits your showers are made to. SetOut’s standards are filled in: change any to your own. New designs, and showers your team changes, are made to these from
          now on. Designs already sent keep the sizes they were made to.
        </Hint>
        {grouped.map(({ group, rules: inGroup }) => (
          <fieldset key={group} className="mt-6 border-t border-rule pt-4 first-of-type:mt-2 first-of-type:border-t-0 first-of-type:pt-0">
            <legend className="float-left w-full text-sm font-bold">{group}</legend>
            <div className="clear-both grid gap-x-6 gap-y-4 pt-3 sm:grid-cols-2">
              {inGroup.map((rule) => {
                const text = RULE_TEXT[rule];
                const choices = choicesOf(rule);
                if (choices) {
                  const standard = String(standardOf(rule));
                  return (
                    <fieldset key={rule} className="text-sm sm:col-span-2">
                      <legend className="block font-medium">{text.label}</legend>
                      {text.about && <span className="block text-xs text-quiet">{text.about}</span>}
                      <span className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(choices).map(([value, words]) => (
                          <label
                            key={value}
                            className={`flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 ${form[rule] === value ? 'border-ink bg-ground font-medium' : 'border-rule'}`}
                          >
                            <input type="radio" name={rule} value={value} checked={form[rule] === value} onChange={() => setForm({ ...form, [rule]: value })} />
                            {words}
                            {value === standard && <span className="text-xs font-normal text-quiet">SetOut’s standard</span>}
                          </label>
                        ))}
                      </span>
                    </fieldset>
                  );
                }
                const { min, max } = boundsOf(rule);
                const ok = !Number.isNaN(numbers[rule]);
                const standard = standardOf(rule);
                return (
                  <label key={rule} className="text-sm">
                    <span className="block font-medium">{text.label}</span>
                    {text.about && <span className="block text-xs text-quiet">{text.about}</span>}
                    <span className={`mt-1 flex h-10 w-32 items-center rounded-md border bg-ground px-3 ${ok ? 'border-rule' : 'border-bad/60'}`}>
                      <input
                        inputMode="numeric"
                        value={form[rule]}
                        onChange={(e) => setForm({ ...form, [rule]: e.target.value })}
                        aria-invalid={ok ? undefined : true}
                        className="w-full bg-transparent text-base tabular-nums outline-none"
                      />
                      <span className="text-quiet">{text.unit}</span>
                    </span>
                    {!ok ? (
                      <span className="mt-1 block text-xs text-bad">
                        A whole number from {min} to {max}
                        {text.unit}.
                      </span>
                    ) : numbers[rule] !== standard ? (
                      <span className="mt-1 block text-xs text-quiet">
                        SetOut’s standard is {standard}
                        {text.unit}.
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        <SaveRow
          label="Save the measurements"
          dirty={dirty}
          valid={valid}
          saving={saving}
          onUndo={() => setForm(original)}
          justSaved={justSaved}
          savedNote="Saved. New designs are made to these from now on."
          onReload={onReload}
        />
      </form>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

/** "45", "£1,250.5" as pence; null for nothing typed; NaN if it is not a price from 1p to £1,000,000. */
function pennies(text: string): number | null {
  const typed = text.replace(/[£,\s]/g, '');
  if (typed === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(typed)) return NaN;
  const pence = Math.round(Number(typed) * 100);
  return pence >= 1 && pence <= 100_000_000 ? pence : NaN;
}
const typedPrice = (pence: number | undefined) => (pence === undefined ? '' : (pence / 100).toFixed(2));
const isPrice = (value: number | null): value is number => typeof value === 'number' && !Number.isNaN(value);

/** How each thing is priced, after its price. */
const PER: Record<QuoteUnit, string> = { m2: 'a m²', each: 'each', m: 'a metre', set: 'a set', job: 'a job' };

/** What the owner is told about each part of the price book. */
const PRICE_HINTS: Record<PriceBook['groups'][number]['id'], string> = {
  glass: 'By the square metre of each pane, measured as the rectangle it is cut from, as a toughener prices it.',
  cutouts: 'A mouse-ear hinge cut-out is a notch and two holes. Polished edges are by the metre of the rectangle each pane is cut from. Enduroshield is the easy-clean coating, by the square metre.',
  hinges: 'Each hinge a door can hang on, in each finish.',
  handles: 'Each handle, in each finish.',
  fixing: 'In each finish.',
  sliding: 'Each of CRL’s Serenity kits, in each finish.',
  job: 'Fitting goes on every new quote once it has a price: leave it empty if you supply only. Delivery is added to a quote by hand.',
  other: 'Prices on quotes you have sent, for things you no longer offer. Empty one to take it away.',
};

/** A short fingerprint of what a form was filled from, so the form starts again whenever that changes. */
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

function MoneyField({ label, value, invalid, per, onChange, wide }: { label: string; value: string; invalid: boolean; per?: string; onChange: (value: string) => void; wide?: boolean; editable?: boolean }) {
  return (
    <span className={`flex h-10 items-center rounded-md border bg-ground px-3 ${wide ? 'w-full' : 'w-40 shrink-0'} ${invalid ? 'border-bad/60' : 'border-rule'}`}>
      <span className="text-quiet">£</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        aria-invalid={invalid ? true : undefined}
        className="w-full min-w-0 bg-transparent pl-1 text-base tabular-nums outline-none"
      />
      {per && <span className="whitespace-nowrap pl-1 text-xs text-quiet">{per}</span>}
    </span>
  );
}

/** A price: a field to type it in, or, for the rest of the team, the price itself. */
function PriceCell(props: { editable: boolean; label: string; value: string; invalid: boolean; per?: string; onChange: (value: string) => void; wide?: boolean }) {
  if (props.editable) return <MoneyField {...props} />;
  const pence = pennies(props.value);
  return (
    <span className={`flex h-10 items-center whitespace-nowrap tabular-nums ${props.wide ? '' : 'justify-end'}`}>
      {isPrice(pence) ? (
        <>
          {money(pence)}
          {props.per && <span className="pl-1 text-xs text-quiet">{props.per}</span>}
        </>
      ) : (
        <span className="text-quiet">No price</span>
      )}
    </span>
  );
}

/** What one thing costs the company: the cheapest of its suppliers' prices, and whose. */
interface Cost {
  pence: number;
  supplier: string;
}

function cheapest(suppliers: readonly SupplierPriceList[], key: string): Cost | null {
  let best: Cost | null = null;
  for (const s of suppliers) {
    const pence = s.prices[key]?.pence;
    if (pence !== undefined && pence > 0 && (!best || pence < best.pence)) best = { pence, supplier: s.name };
  }
  return best;
}

/** How much a price adds to what it costs, as a whole percentage. */
const markUpOn = (price: number, cost: number) => Math.round(((price - cost) / cost) * 100);
const span = (low: number, high: number, show: (n: number) => string) => (low === high ? show(low) : `${show(low)}–${show(high)}`);

/**
 * Under a price, what it costs the company and what the price adds on. For
 * one price standing for every finish, the range across them.
 */
function CostNote({ costs, price, compact }: { costs: Cost[]; price: number | null; compact?: boolean }) {
  if (costs.length === 0) return null;
  const pence = costs.map((c) => c.pence);
  const [low, high] = [Math.min(...pence), Math.max(...pence)];
  const who = [...new Set(costs.map((c) => c.supplier))];
  const ups = isPrice(price) ? [markUpOn(price, high), markUpOn(price, low)] : null;
  const under = ups !== null && ups[0] < 0;
  const added = ups === null ? '' : under ? ` · under cost` : ` · +${span(ups[0], ups[1], (n) => String(n))}%`;
  const full = `Costs ${span(low, high, money)}${who.length === 1 ? ` from ${who[0]}` : ''}${added}`;
  return (
    <span title={full} className={`mt-0.5 block truncate text-xs ${under ? 'text-bad' : 'text-quiet'}`}>
      {compact ? `${span(low, high, money)} cost${added}` : full}
    </span>
  );
}

interface PriceFormProps {
  groups: PriceBook['groups'];
  /** The prices it starts from, by key. */
  stored: PriceBook['prices'];
  editable: boolean;
  intro: string;
  hints: Record<string, string>;
  saveLabel: string;
  savedNote: string;
  failedNote: string;
  justSaved: boolean;
  save: (changes: PriceChange[]) => Promise<unknown>;
  onSaved: () => void;
  onReload: () => void;
  /** Told whether there are changes waiting to be saved. */
  onDirty?: (dirty: boolean) => void;
  /** For the company's own prices: its suppliers, to show what each thing costs and fill prices from them. */
  suppliers?: SupplierPriceList[];
}

/**
 * A price list to fill in, laid out as the price book is: glass in several
 * thicknesses as a table, a column for each; hardware with one price for
 * every finish until a finish is priced on its own. The company's own prices
 * and each supplier's are filled in with it.
 */
function PriceForm({ groups, stored, editable, intro, hints, saveLabel, savedNote, failedNote, justSaved, save, onSaved, onReload, onDirty, suppliers = [] }: PriceFormProps) {
  const keys = groups.flatMap((g) => g.rows.flatMap((r) => r.keys));
  const original = Object.fromEntries(keys.map((key) => [key, typedPrice(stored[key]?.pence)]));
  const [form, setForm] = useState<Record<string, string>>(original);
  // A row of hardware has one price for every finish while its prices are all the same, as they are with none.
  const [sameAtFirst] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groups.filter((g) => g.sameAcross).flatMap((g) => g.rows.filter((r) => r.keys.length > 1).map((r) => [r.keys[0], new Set(r.keys.map((key) => original[key])).size === 1]))
    )
  );
  const [same, setSame] = useState(sameAtFirst);
  const [filled, setFilled] = useState<Record<string, string>>({});
  const saving = useSave(onSaved);
  const typed = Object.fromEntries(keys.map((key) => [key, pennies(form[key] ?? '')]));
  const valid = keys.every((key) => !Number.isNaN(typed[key]));
  const changes = keys.flatMap((key) => {
    const from = stored[key]?.pence ?? null;
    const to = typed[key];
    return Number.isNaN(to) || to === from ? [] : [{ key, from, to }];
  });
  const dirty = changes.length > 0 || !valid;
  useEffect(() => {
    onDirty?.(dirty);
  }, [onDirty, dirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  const set = (key: string, value: string) => setForm((now) => ({ ...now, [key]: value }));
  const setAll = (row: string[], value: string) => setForm((now) => ({ ...now, ...Object.fromEntries(row.map((key) => [key, value])) }));
  const costsOf = (row: string[]) => row.flatMap((key) => cheapest(suppliers, key) ?? []);

  /** Every price in a part of the list from what a supplier charges, plus a mark-up. Nothing is saved until the owner saves. */
  const fill = (group: PriceBook['groups'][number], supplier: SupplierPriceList, markUp: number) => {
    const updates: Record<string, string> = {};
    for (const key of group.rows.flatMap((r) => r.keys)) {
      const cost = supplier.prices[key]?.pence;
      if (cost && cost > 0) updates[key] = typedPrice(Math.min(100_000_000, Math.round(cost * (1 + markUp / 100))));
    }
    const count = Object.keys(updates).length;
    setForm((now) => ({ ...now, ...updates }));
    setSame((now) => {
      const next = { ...now };
      for (const row of group.rows) {
        if (row.keys.length > 1 && next[row.keys[0]] && new Set(row.keys.map((key) => updates[key] ?? form[key] ?? '')).size > 1) next[row.keys[0]] = false;
      }
      return next;
    });
    setFilled((now) => ({
      ...now,
      [group.id]: count === 0 ? `${supplier.name} has no prices here yet.` : `${count === 1 ? '1 price' : `${count} prices`} filled in from ${supplier.name} plus ${markUp}%. Check them, then save.`,
    }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void saving.save(() => save(changes), failedNote);
  };

  const body = groups.map((group) => {
    const columns = group.columns && group.columns.length > 1 ? group.columns : null;
    // The one finish, where a company offers only one.
    const only = group.columns?.length === 1 ? group.columns[0].label : null;
    return (
      // A fieldset is as wide as its widest line unless told otherwise, and a cost note is one line.
      <fieldset key={group.id} className="mt-6 min-w-0 border-t border-rule pt-4 first-of-type:mt-2 first-of-type:border-t-0 first-of-type:pt-0">
        <legend className="float-left w-full text-sm font-bold">{group.title}</legend>
        <p className="clear-both pt-1 text-xs text-quiet">{hints[group.id]}</p>
        {!columns ? (
          <div className="divide-y divide-rule pt-1">
            {group.rows.map((row) => {
              const key = row.keys[0];
              const label = only ? `${row.label}, ${only}` : row.label;
              return (
                <label key={key} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span className="min-w-0">
                    {label} {row.code && <CodeOf code={row.code} />}
                    <CostNote costs={costsOf([key])} price={typed[key]} />
                  </span>
                  <PriceCell editable={editable} label={label} value={form[key] ?? ''} invalid={Number.isNaN(typed[key])} per={PER[row.unit]} onChange={(v) => set(key, v)} />
                </label>
              );
            })}
          </div>
        ) : !group.sameAcross ? (
          // A table, as a toughener's price list is: on a phone each row has its columns under it.
          <div className="pt-3 text-sm">
            <div className="hidden gap-2 pb-1 text-xs font-medium text-quiet sm:grid" style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(${columns.length}, 7.5rem)` }}>
              <span>{PER[group.rows[0]?.unit ?? 'each']}</span>
              {columns.map((c) => (
                <span key={c.id}>{c.label}</span>
              ))}
            </div>
            <div className="space-y-4 sm:space-y-2">
              {group.rows.map((row) => (
                <div key={row.keys[0]} className="sm:grid sm:items-start sm:gap-2" style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(${columns.length}, 7.5rem)` }}>
                  <p className="min-w-0 sm:pt-2.5">
                    {row.label} <span className="text-xs text-quiet sm:hidden">{PER[row.unit]}</span>
                  </p>
                  <div className="mt-1.5 grid grid-cols-3 gap-2 sm:contents">
                    {row.keys.map((key, i) => (
                      <label key={key} className="block min-w-0">
                        <span className="block truncate text-xs text-quiet sm:hidden">{columns[i].label}</span>
                        <PriceCell
                          editable={editable}
                          wide
                          label={`${columns[i].label} ${row.label}`}
                          value={form[key] ?? ''}
                          invalid={Number.isNaN(typed[key])}
                          onChange={(v) => set(key, v)}
                        />
                        <CostNote costs={costsOf([key])} price={typed[key]} compact />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 pt-3">
            {group.rows.map((row) => {
              const id = row.keys[0];
              const one = same[id] === true;
              return (
                <div key={id} className="text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <p className="min-w-0 pt-2">
                      <span className="font-medium">{row.label}</span> {row.code && <CodeOf code={row.code} />} {!one && <span className="text-xs text-quiet">{PER[row.unit]}</span>}
                    </p>
                    {one && (
                      <span className="block">
                        <PriceCell editable={editable} label={row.label} value={form[id] ?? ''} invalid={Number.isNaN(typed[id])} per={PER[row.unit]} onChange={(v) => setAll(row.keys, v)} />
                        <CostNote costs={costsOf(row.keys)} price={typed[id]} compact />
                      </span>
                    )}
                  </div>
                  {editable && (
                    <label className="mt-1 inline-flex cursor-pointer items-center gap-2 text-xs text-quiet">
                      <input
                        type="checkbox"
                        checked={one}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setSame((now) => ({ ...now, [id]: on }));
                          // One price for them all starts from the first finish priced.
                          if (on) setAll(row.keys, row.keys.map((key) => form[key] ?? '').find((v) => v.trim() !== '') ?? '');
                        }}
                      />
                      Same price in every finish
                    </label>
                  )}
                  {!one && (
                    <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {row.keys.map((key, i) => (
                        <label key={key} className="block min-w-0">
                          <span className="block truncate text-xs text-quiet">{columns[i].label}</span>
                          <PriceCell
                            editable={editable}
                            wide
                            label={`${row.label}, ${columns[i].label}`}
                            value={form[key] ?? ''}
                            invalid={Number.isNaN(typed[key])}
                            onChange={(v) => set(key, v)}
                          />
                          <CostNote costs={costsOf([key])} price={typed[key]} compact />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {editable && suppliers.length > 0 && group.id !== 'job' && group.id !== 'other' && (
          <FillFrom
            suppliers={suppliers}
            // The first supplier that prices anything here: the toughener for glass, CRL for hinges.
            initial={suppliers.find((s) => group.rows.some((r) => r.keys.some((key) => s.prices[key])))?.id}
            onFill={(supplier, markUp) => fill(group, supplier, markUp)}
          />
        )}
        {filled[group.id] && (
          <p role="status" className="mt-2 text-xs text-ink">
            {filled[group.id]}
          </p>
        )}
      </fieldset>
    );
  });

  if (!editable) {
    return (
      <div className={CARD}>
        <Hint>{intro}</Hint>
        {body}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={CARD}>
      <Hint>{intro}</Hint>
      {body}
      {!valid && (
        <p role="alert" className="mt-4 text-sm text-bad">
          A price is in pounds and pence, such as 45 or 45.50, up to £1,000,000. The ones outlined in red are not.
        </p>
      )}
      <SaveRow
        label={saveLabel}
        dirty={dirty}
        valid={valid}
        saving={saving}
        onUndo={() => {
          setForm(original);
          setSame(sameAtFirst);
          setFilled({});
        }}
        justSaved={justSaved}
        savedNote={savedNote}
        onReload={onReload}
      />
    </form>
  );
}

/** Fill a part of the company's prices from what one of its suppliers charges, plus a mark-up. */
function FillFrom({ suppliers, initial, onFill }: { suppliers: SupplierPriceList[]; initial?: string; onFill: (supplier: SupplierPriceList, markUp: number) => void }) {
  const [supplierId, setSupplierId] = useState(initial ?? suppliers[0]?.id ?? '');
  const [markUp, setMarkUp] = useState('');
  const supplier = suppliers.find((s) => s.id === supplierId) ?? suppliers[0];
  const typed = markUp.replace(/[%\s]/g, '');
  const percent = /^\d{1,4}(\.\d)?$/.test(typed) ? Number(typed) : NaN;
  const ok = Number.isFinite(percent) && percent <= 1000;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-ground px-3 py-2 text-xs">
      <span>Fill in from</span>
      {suppliers.length === 1 ? (
        <span className="font-medium">{supplier.name}</span>
      ) : (
        <select aria-label="Supplier" value={supplier.id} onChange={(e) => setSupplierId(e.target.value)} className="h-8 rounded-md border border-rule bg-surface px-2">
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      <span>plus</span>
      <span className={`flex h-8 w-20 items-center rounded-md border bg-surface px-2 ${markUp && !ok ? 'border-bad/60' : 'border-rule'}`}>
        <input inputMode="decimal" aria-label="Mark-up" value={markUp} onChange={(e) => setMarkUp(e.target.value)} className="w-full min-w-0 bg-transparent tabular-nums outline-none" />
        <span className="text-quiet">%</span>
      </span>
      <button type="button" disabled={!ok} onClick={() => onFill(supplier, percent)} className="h-8 rounded-md border border-rule bg-surface px-3 font-medium disabled:opacity-50">
        Fill in
      </button>
    </div>
  );
}

/** What each part of a supplier's price list says to the owner. */
const supplierHints = (name: string): Record<string, string> => ({
  ...PRICE_HINTS,
  glass: `What ${name} charges by the square metre of each pane.`,
  cutouts: `What ${name} charges for each notch, each hole, polished edges, and Enduroshield.`,
  other: `${name}’s prices for things you no longer offer. Empty one to take it away.`,
});

/** A supplier's own price list, with its name to change and the supplier to remove. */
function SupplierPanel({
  supplier,
  groups,
  justSaved,
  onSaved,
  onRemoved,
  onReload,
  onDirty,
}: {
  supplier: SupplierPriceList;
  groups: PriceBook['groups'];
  justSaved: boolean;
  onSaved: () => void;
  onRemoved: () => void;
  onReload: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [mode, setMode] = useState<'view' | 'rename' | 'remove'>('view');
  const [name, setName] = useState(supplier.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>, done: () => void, otherwise: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMode('view');
      done();
    } catch (e) {
      setError(failure(e, otherwise));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {mode === 'rename' ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api.renameSupplier(supplier.id, name.trim(), supplier.name), onSaved, 'The supplier could not be renamed. Please try again.');
            }}
          >
            <input aria-label="Supplier’s name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={`${FIELD} w-64 border-rule`} />
            <button type="submit" disabled={busy || !name.trim()} className="h-10 rounded-md bg-accent px-4 font-semibold text-accent-ink disabled:opacity-50">
              Rename
            </button>
            <button type="button" onClick={() => setMode('view')} className="h-10 rounded-md border border-rule bg-surface px-4 font-medium">
              Cancel
            </button>
          </form>
        ) : (
          <h3 className="text-lg font-semibold">{supplier.name}</h3>
        )}
        {mode === 'view' && (
          <span className="flex gap-4 text-sm">
            <button type="button" onClick={() => setMode('rename')} className="font-medium text-accent underline underline-offset-2">
              Rename
            </button>
            <button type="button" onClick={() => setMode('remove')} className="font-medium text-bad underline underline-offset-2">
              Remove
            </button>
          </span>
        )}
      </div>
      {mode === 'remove' && (
        <div role="alert" className="mb-3 rounded-md border border-bad/40 bg-surface p-3 text-sm">
          <p>Remove {supplier.name}, and every price you have from them? Your own prices stay as they are.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => api.removeSupplier(supplier.id), onRemoved, 'The supplier could not be removed. Please try again.')}
              className="h-10 rounded-md bg-bad px-4 font-semibold text-white disabled:opacity-50"
            >
              Remove {supplier.name}
            </button>
            <button type="button" onClick={() => setMode('view')} className="h-10 rounded-md border border-rule bg-surface px-4 font-medium">
              Keep them
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mb-3 text-sm text-bad">
          {error}
        </p>
      )}
      <SupplierMeta supplier={supplier} busy={busy} onChange={(action, done, otherwise) => void run(action, done, otherwise)} onSaved={onSaved} />
      <PriceForm
        key={fingerprint([groups.map((g) => g.rows.map((r) => r.keys)), supplier.prices])}
        groups={groups}
        stored={supplier.prices}
        editable
        intro={`What ${supplier.name} charges you, before VAT. If they are your default ${kindLabel(supplier.kind).toLowerCase()} supplier, a new quote uses these costs plus your mark-up. Fill in what they supply, import a CSV, and leave the rest empty. Only owners see this.`}
        hints={supplierHints(supplier.name)}
        saveLabel={`Save ${supplier.name}’s prices`}
        savedNote="Saved. Your own prices now show what each thing costs you."
        failedNote="The prices could not be saved. Please try again."
        justSaved={justSaved}
        save={(changes) => api.saveSupplierPrices(supplier.id, changes)}
        onSaved={onSaved}
        onReload={onReload}
        onDirty={onDirty}
      />
    </>
  );
}



function SupplierMeta({
  supplier,
  busy,
  onChange,
  onSaved,
}: {
  supplier: SupplierPriceList;
  busy: boolean;
  onChange: (action: () => Promise<unknown>, done: () => void, otherwise: string) => void;
  onSaved: () => void;
}) {
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const saveMeta = (changes: { kind?: SupplierKind; isDefault?: boolean }) =>
    onChange(
      () => api.updateSupplier(supplier.id, changes, { name: supplier.name, kind: supplier.kind }),
      onSaved,
      'That could not be saved. Please try again.'
    );
  const importFile = async (file: File, replace: boolean) => {
    setImporting(true);
    setImportError(null);
    try {
      const csv = await file.text();
      await api.importSupplierCsv(supplier.id, csv, replace);
      onSaved();
    } catch (e) {
      setImportError(failure(e, 'The CSV could not be imported. Please try again.'));
    } finally {
      setImporting(false);
    }
  };
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-md bg-ground px-3 py-3 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-medium text-quiet">What they supply</span>
          <select
            value={supplier.kind}
            disabled={busy}
            onChange={(e) => saveMeta({ kind: e.target.value as SupplierKind })}
            className="mt-1 h-8 rounded-md border border-rule bg-surface px-2"
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1">
          <input
            type="checkbox"
            checked={supplier.isDefault}
            disabled={busy || (supplier.isDefault && supplier.kind !== 'other')}
            onChange={(e) => saveMeta({ isDefault: e.target.checked })}
            className="accent-accent"
          />
          <span>Default {kindLabel(supplier.kind).toLowerCase()} supplier for new quotes</span>
        </label>
      </div>
      <div>
        <p className="text-xs text-quiet">Import a CSV with columns key, sku, description, unit, and cost (pounds) or cost_pence. A row needs a SetOut key or a SKU.</p>
        <label className="mt-2 inline-flex h-8 cursor-pointer items-center rounded-md border border-rule bg-surface px-3 text-xs font-medium">
          {importing ? 'Importing…' : 'Import a CSV'}
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={importing || busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importFile(file, true);
            }}
          />
        </label>
        {importError && (
          <p role="alert" className="mt-2 text-sm text-bad">
            {importError}
          </p>
        )}
      </div>
    </div>
  );
}

function MarkupSettings({ pricing, onSaved }: { pricing: PricingSettings; onSaved: () => void }) {
  const shown = (pricing.markupBp / 100).toString();
  const [value, setValue] = useState(shown);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const typed = value.replace(/[%\s]/g, '');
  const percent = /^\d{1,4}(\.\d{1,2})?$/.test(typed) ? Number(typed) : NaN;
  const markupBp = Number.isFinite(percent) ? Math.round(percent * 100) : NaN;
  const ok = Number.isInteger(markupBp) && markupBp >= 0 && markupBp <= 100_000;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.savePricing({ markupBp });
      setJustSaved(true);
      onSaved();
    } catch (e) {
      setError(failure(e, 'The mark-up could not be saved. Please try again.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-ground px-3 py-2 text-xs">
      <span>A new quote sells at cost plus</span>
      <span className={`flex h-8 w-20 items-center rounded-md border bg-surface px-2 ${value && !ok ? 'border-bad/60' : 'border-rule'}`}>
        <input
          inputMode="decimal"
          aria-label="Default mark-up"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setJustSaved(false);
          }}
          className="w-full min-w-0 bg-transparent tabular-nums outline-none"
        />
        <span className="text-quiet">%</span>
      </span>
      <button type="submit" disabled={busy || !ok || markupBp === pricing.markupBp} className="h-8 rounded-md border border-rule bg-surface px-3 font-medium disabled:opacity-50">
        {busy ? 'Saving' : 'Save the mark-up'}
      </button>
      {justSaved && <span className="text-quiet">Saved. The next quote uses this mark-up.</span>}
      {error && (
        <span role="alert" className="text-bad">
          {error}
        </span>
      )}
    </form>
  );
}

const KIND_OPTIONS: { id: SupplierKind; label: string }[] = [
  { id: 'glass', label: 'Glass' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'other', label: 'Other' },
];
const kindLabel = (kind: SupplierKind) => KIND_OPTIONS.find((k) => k.id === kind)?.label ?? kind;

/** A new supplier, by name. */
function AddSupplier({ onAdded }: { onAdded: (id: string) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SupplierKind>('glass');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.addSupplier(name.trim(), kind);
      onAdded(id);
    } catch (e) {
      setError(failure(e, 'The supplier could not be added. Please try again.'));
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className={CARD}>
      <Hint>
        Who you buy from: ESG or another toughener for glass, CRL for hardware, or someone else. A company can have more than one of each. The first of a kind becomes the default: a new quote takes its
        cost from that supplier, plus your mark-up. Each has its own price list here, and you can import a CSV of what they charge.
      </Hint>
      <label className="block text-sm">
        <span className="font-medium">The supplier’s name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={`${FIELD} mt-1 border-rule sm:w-80`} />
      </label>
      <label className="mt-3 block text-sm">
        <span className="font-medium">What they supply</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as SupplierKind)} className={`${FIELD} mt-1 border-rule sm:w-80`}>
          {KIND_OPTIONS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || !name.trim()} className="mt-4 h-10 rounded-md bg-accent px-4 font-semibold text-accent-ink disabled:opacity-50">
        {busy ? 'Adding' : 'Add the supplier'}
      </button>
    </form>
  );
}

/**
 * The price book: what each new quote starts from, before VAT. Everything
 * the company's quotes can price is listed, from what its designer offers.
 * Owners also keep a price list for each supplier they buy from, laid out
 * the same way: their own prices then show what each thing costs and the
 * mark-up on it, and can be filled in from a supplier's plus a mark-up. The
 * rest of the team sees the company's prices, never what it pays.
 */
export function PricesPart({ prices, pricing, owner, justSaved, onSaved, onReload }: PartProps & { prices: PriceBook; pricing?: PricingSettings }) {
  const suppliers = owner ? (prices.suppliers ?? []) : [];
  const [tab, setTab] = useState('ours');
  const [savedTab, setSavedTab] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const supplier = suppliers.find((s) => s.id === tab) ?? null;
  // A supplier removed leaves its tab for the company's own prices.
  const shown = tab === 'add' || supplier ? tab : 'ours';
  const savedHere = (which: string) => () => {
    setSavedTab(which);
    onSaved();
  };
  const open = (which: string) => {
    setTab(which);
    setSavedTab(null);
  };
  const supplierGroups = (s: SupplierPriceList): PriceBook['groups'] => [
    ...prices.groups.filter((g) => g.id !== 'job' && g.id !== 'other'),
    ...(s.others.length > 0 ? [{ id: 'other' as const, title: 'Other prices', rows: s.others }] : []),
  ];
  const tabClass = (active: boolean) =>
    `h-9 rounded-full border px-3 text-sm font-medium disabled:opacity-50 ${active ? 'border-accent bg-accent text-accent-ink' : 'border-rule bg-surface text-ink'}`;

  return (
    <Section title="Prices">
      {owner && (
        <>
          <div role="tablist" aria-label="Price lists" className="mb-3 flex flex-wrap gap-2">
            <button type="button" role="tab" aria-selected={shown === 'ours'} disabled={dirty && shown !== 'ours'} onClick={() => open('ours')} className={tabClass(shown === 'ours')}>
              Your prices
            </button>
            {suppliers.map((s) => (
              <button key={s.id} type="button" role="tab" aria-selected={shown === s.id} disabled={dirty && shown !== s.id} onClick={() => open(s.id)} className={tabClass(shown === s.id)}>
                {s.name}
                {s.isDefault ? ' · default' : ''}
              </button>
            ))}
            <button type="button" role="tab" aria-selected={shown === 'add'} disabled={dirty} onClick={() => open('add')} className={tabClass(shown === 'add')}>
              + Add a supplier
            </button>
          </div>
          {dirty && <p className="-mt-1 mb-3 text-xs text-quiet">Save or undo your changes before you open another price list.</p>}
          {pricing && shown === 'ours' && <MarkupSettings key={pricing.markupBp} pricing={pricing} onSaved={onSaved} />}
        </>
      )}
      {shown === 'ours' && (
        <PriceForm
          key={fingerprint([prices.groups.map((g) => g.rows.map((r) => r.keys)), prices.prices])}
          groups={prices.groups}
          stored={prices.prices}
          editable={owner}
          intro={
            owner
              ? `A new quote starts from what your default glass and hardware suppliers charge, plus your mark-up, before VAT. If a supplier has no cost for a line, it starts from the price in this book. You can still change any line on a quote before you send it. A quote you have already sent is never changed. Anything left empty here is left for you to price on the quote when there is no supplier cost.${suppliers.length > 0 ? ' Under each price is what it costs you from your cheapest supplier, and what you add on.' : ''}`
              : 'What each new quote starts from, before VAT. Only an owner can change them.'
          }
          hints={PRICE_HINTS}
          saveLabel="Save the prices"
          savedNote="Saved. The next quote you write starts from these."
          failedNote="The prices could not be saved. Please try again."
          justSaved={justSaved && savedTab === 'ours'}
          save={(changes) => api.savePrices(changes)}
          onSaved={savedHere('ours')}
          onReload={onReload}
          onDirty={setDirty}
          suppliers={suppliers}
        />
      )}
      {supplier && (
        <SupplierPanel
          key={supplier.id}
          supplier={supplier}
          groups={supplierGroups(supplier)}
          justSaved={justSaved && savedTab === supplier.id}
          onSaved={savedHere(supplier.id)}
          onRemoved={() => {
            open('ours');
            onSaved();
          }}
          onReload={onReload}
          onDirty={setDirty}
        />
      )}
      {shown === 'add' && (
        <AddSupplier
          onAdded={(id) => {
            open(id);
            onSaved();
          }}
        />
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

/** "17.5" as 1750, or NaN if it is not a percentage to two places. */
function basisPoints(text: string): number {
  const value = Number(text.replace(/%/g, '').trim());
  if (text.trim() === '' || !Number.isFinite(value)) return NaN;
  const bp = Math.round(value * 100);
  return Math.abs(value * 100 - bp) < 1e-6 ? bp : NaN;
}
const percent = (bp: number) => `${Number((bp / 100).toFixed(2))}%`;
const days = (n: number) => plural(n, 'day', 'days');

interface CompanyPartProps extends PartProps {
  company: CompanySettings;
}

function QuotesPart({ company, owner, justSaved, onSaved, onReload }: CompanyPartProps) {
  const original = { vat: String(company.quotes.vatRateBp / 100), days: String(company.quotes.validDays) };
  const [form, setForm] = useState(original);
  const saving = useSave(onSaved);
  const vatRateBp = basisPoints(form.vat);
  const validDays = /^\d+$/.test(form.days.trim()) ? Number(form.days.trim()) : NaN;
  const vatOk = vatRateBp >= 0 && vatRateBp <= 10_000;
  const daysOk = validDays >= 1 && validDays <= 365;
  const dirty = vatRateBp !== company.quotes.vatRateBp || validDays !== company.quotes.validDays;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void saving.save(
      () => api.saveCompanySettings({ quotes: { vatRateBp, validDays }, basedOn: { quotes: company.versions.quotes } }),
      'How quotes start could not be saved. Please try again.'
    );
  };

  if (!owner) {
    return (
      <Section title="Quotes">
        <p className={`${CARD} text-sm`}>
          A new quote starts with VAT at {percent(company.quotes.vatRateBp)} and stands for {days(company.quotes.validDays)} once it is sent.
        </p>
      </Section>
    );
  }

  return (
    <Section title="Quotes">
      <form onSubmit={submit} className={CARD}>
        <Hint>Each new quote starts with these. You can still change them on a quote before you send it. Quotes already written keep their own.</Hint>
        <div className="flex flex-wrap gap-6 text-sm">
          <label>
            <span className="font-medium">VAT</span>
            <span className={`mt-1 flex h-10 w-28 items-center rounded-md border bg-ground px-3 ${vatOk ? 'border-rule' : 'border-bad/60'}`}>
              <input
                inputMode="decimal"
                value={form.vat}
                onChange={(e) => setForm({ ...form, vat: e.target.value })}
                aria-invalid={vatOk ? undefined : true}
                className="w-full bg-transparent text-base tabular-nums outline-none"
              />
              <span className="text-quiet">%</span>
            </span>
            {!vatOk && <span className="mt-1 block text-xs text-bad">Between 0% and 100%, to two decimal places.</span>}
          </label>
          <label>
            <span className="font-medium">A quote stands for</span>
            <span className={`mt-1 flex h-10 w-36 items-center rounded-md border bg-ground px-3 ${daysOk ? 'border-rule' : 'border-bad/60'}`}>
              <input
                inputMode="numeric"
                value={form.days}
                onChange={(e) => setForm({ ...form, days: e.target.value })}
                aria-invalid={daysOk ? undefined : true}
                className="w-full bg-transparent text-base tabular-nums outline-none"
              />
              <span className="text-quiet">days</span>
            </span>
            {!daysOk && <span className="mt-1 block text-xs text-bad">Between 1 and 365 days.</span>}
          </label>
        </div>
        <SaveRow
          label="Save"
          dirty={dirty}
          valid={vatOk && daysOk}
          saving={saving}
          onUndo={() => setForm(original)}
          justSaved={justSaved}
          savedNote="Saved. The next quote you write starts with these."
          onReload={onReload}
        />
      </form>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Colours and logo
// ---------------------------------------------------------------------------

/** How much two colours stand apart, as WCAG measures it: 1 to 21. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const https = (text: string) => {
  try {
    const url = new URL(text.trim());
    return url.protocol === 'https:' && url.hostname.includes('.');
  } catch {
    return false;
  }
};

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const ok = COLOUR.test(value.trim());
  return (
    <div className="text-sm">
      <span className="font-medium">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <label className="shrink-0">
          <span className="sr-only">Pick the {label.toLowerCase()}</span>
          <input
            type="color"
            value={ok ? value.trim().toLowerCase() : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 w-12 cursor-pointer rounded-md border border-rule bg-ground p-1"
          />
        </label>
        <label className="w-32">
          <span className="sr-only">{label}, as #rrggbb</span>
          <input
            type="text"
            value={value}
            spellCheck={false}
            maxLength={7}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={ok ? undefined : true}
            className={`${FIELD} font-mono ${ok ? 'border-rule' : 'border-bad/60'}`}
          />
        </label>
      </div>
      {!ok && <p className="mt-1 text-xs text-bad">Write it like #1e293b.</p>}
    </div>
  );
}

export function BrandingPart({ company, owner, justSaved, onSaved, onReload }: CompanyPartProps) {
  const original = { primary: company.branding.primary, primaryForeground: company.branding.primaryForeground, logoUrl: company.branding.logoUrl ?? '' };
  const [form, setForm] = useState(original);
  const [logoBroken, setLogoBroken] = useState(false);
  const saving = useSave(onSaved);
  const coloursOk = COLOUR.test(form.primary.trim()) && COLOUR.test(form.primaryForeground.trim());
  const logoOk = form.logoUrl.trim() === '' || https(form.logoUrl);
  const next: Branding = {
    primary: form.primary.trim().toLowerCase(),
    primaryForeground: form.primaryForeground.trim().toLowerCase(),
    logoUrl: form.logoUrl.trim() || null,
  };
  const dirty =
    next.primary !== company.branding.primary || next.primaryForeground !== company.branding.primaryForeground || next.logoUrl !== company.branding.logoUrl;
  const ratio = coloursOk ? contrast(next.primary, next.primaryForeground) : 21;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void saving.save(
      () => api.saveCompanySettings({ branding: next, basedOn: { branding: company.versions.branding } }),
      'The colours and logo could not be saved. Please try again.'
    );
  };

  const preview = (colours: Branding) => (
    <div className="rounded-md border border-rule bg-white p-4">
      <span
        className="inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold"
        style={{ background: colours.primary, color: colours.primaryForeground }}
      >
        Send my design
      </span>
      <span className="ml-3 text-xs text-black/60">How a button looks in your designer</span>
    </div>
  );

  const logo = company.branding.logoUrl && (
    <div className="mt-4 text-sm">
      <p className="font-medium">Your logo now</p>
      {logoBroken ? (
        <p className="mt-1 text-bad">No picture could be shown from that link. Check it opens in a browser.</p>
      ) : (
        <img
          src={company.branding.logoUrl}
          alt={`${company.name} logo`}
          referrerPolicy="no-referrer"
          onError={() => setLogoBroken(true)}
          className="mt-1 h-12 w-auto max-w-full rounded border border-rule bg-white p-1"
        />
      )}
    </div>
  );

  if (!owner) {
    return (
      <Section title="Colours and logo">
        <div className={CARD}>
          {preview(company.branding)}
          <p className="mt-3 text-sm text-quiet">
            Buttons {company.branding.primary}, words on them {company.branding.primaryForeground}.
          </p>
          {logo}
        </div>
      </Section>
    );
  }

  return (
    <Section title="Colours and logo">
      <form onSubmit={submit} className={CARD}>
        <Hint>Your designer and the quotes your customers open use your colours. Your logo goes at the top of each quote, in place of your name.</Hint>
        <div className="flex flex-wrap gap-6">
          <ColourField label="Buttons" value={form.primary} onChange={(primary) => setForm({ ...form, primary })} />
          <ColourField label="Words on buttons" value={form.primaryForeground} onChange={(primaryForeground) => setForm({ ...form, primaryForeground })} />
        </div>
        <div className="mt-4">{coloursOk && preview(next)}</div>
        {ratio < 4.5 && (
          <p role="status" className="mt-2 text-sm text-warn">
            The words may be hard to read on that colour. A darker button or lighter words would help.
          </p>
        )}
        <label className="mt-4 block text-sm">
          <span className="font-medium">Logo</span> <span className="text-quiet">(if you like)</span>
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={form.logoUrl}
            placeholder="https://yourcompany.co.uk/logo.png"
            onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
            aria-invalid={logoOk ? undefined : true}
            className={`mt-1 ${FIELD} ${logoOk ? 'border-rule' : 'border-bad/60'}`}
          />
          <span className={`mt-1 block text-xs ${logoOk ? 'text-quiet' : 'text-bad'}`}>
            {logoOk ? 'A link to the picture on your own website, starting https://. Leave it empty to show your name instead.' : 'The link must start https://.'}
          </span>
        </label>
        {logo}
        <SaveRow
          label="Save the colours and logo"
          dirty={dirty}
          valid={coloursOk && logoOk}
          saving={saving}
          onUndo={() => setForm(original)}
          justSaved={justSaved}
          savedNote="Saved. Your designer uses these within a minute, and quotes at once."
          onReload={onReload}
        />
      </form>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// The company's name
// ---------------------------------------------------------------------------

export function NamePart({ company, owner, limits, justSaved, onSaved, onReload }: CompanyPartProps & { limits: Limits }) {
  const [name, setName] = useState(company.name);
  const saving = useSave(onSaved);
  const next = tidy(name);
  const dirty = next !== company.name;
  const valid = next.length > 0 && next.length <= limits.companyName;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void saving.save(() => api.saveCompanySettings({ name: next, basedOn: { name: company.versions.name } }), 'The name could not be saved. Please try again.');
  };

  if (!owner) {
    return (
      <Section title="Company name">
        <p className={`${CARD} font-medium`}>{company.name}</p>
      </Section>
    );
  }

  return (
    <Section title="Company name">
      <form onSubmit={submit} className={CARD}>
        <label className="block text-sm">
          <span className="sr-only">Company name</span>
          <input
            type="text"
            autoComplete="organization"
            value={name}
            maxLength={limits.companyName + 20}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={valid ? undefined : true}
            className={`${FIELD} ${valid ? 'border-rule' : 'border-bad/60'}`}
          />
        </label>
        <p className="mt-2 text-sm text-quiet">
          Your customers see it in your designer, on their quotes and in the emails sent for you. The notes on each new design name you as the one who checks it.
        </p>
        {!valid && <p className="mt-1 text-xs text-bad">A name of up to {limits.companyName} characters.</p>}
        <SaveRow
          label="Save the name"
          dirty={dirty}
          valid={valid}
          saving={saving}
          onUndo={() => setName(company.name)}
          justSaved={justSaved}
          savedNote="Saved."
          onReload={onReload}
        />
      </form>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// The record of changes
// ---------------------------------------------------------------------------

function Changes({ changes, me, several }: { changes: SettingsChange[]; me: Me; several: boolean }) {
  return (
    <Section title="Recent changes">
      <ol className="space-y-2 rounded-lg border border-rule bg-surface p-4 text-sm">
        {changes.flatMap((change) => {
          const by = !change.by ? 'SetOut' : change.by.email === me.user.email ? 'You' : (change.by.name ?? change.by.email);
          const where = several && change.data.designer ? `On ${change.data.designer.name}: ` : '';
          const items = change.data.changes?.length ? change.data.changes : [null];
          // A price book filled in at once is one line, opened to see each price.
          const prices = items.filter((item): item is SettingsChangeItem => item?.field === 'price' || item?.field === 'cost');
          if (prices.length > 3 && prices.length === items.length) {
            const first = prices[0];
            const whose = first.field === 'cost' && prices.every((p) => p.field === 'cost' && p.supplier.id === first.supplier.id) ? ` of ${first.supplier.name}’s` : '';
            return [
              <li key={change.id} className="flex justify-between gap-3">
                <details className="min-w-0">
                  <summary className="cursor-pointer">
                    {where}
                    {by} changed {prices.length}
                    {whose} prices.
                  </summary>
                  <ul className="mt-1 space-y-1 pl-4 text-quiet">
                    {prices.map((item, i) => (
                      <li key={i}>{describe(item, by)}</li>
                    ))}
                  </ul>
                </details>
                <span className="shrink-0 text-xs text-quiet" title={whenExactly(change.at)}>
                  {when(change.at)}
                </span>
              </li>,
            ];
          }
          return items.map((item, i) => (
            <li key={`${change.id}-${i}`} className="flex justify-between gap-3">
              <span className="min-w-0">
                {where}
                {item ? describe(item, by) : `${by} changed the settings.`}
              </span>
              <span className="shrink-0 text-xs text-quiet" title={whenExactly(change.at)}>
                {when(change.at)}
              </span>
            </li>
          ));
        })}
      </ol>
    </Section>
  );
}

const listed = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** What each fixing, glass type and coating is called, by the field a change to it is recorded under. */
const CHOICE_TEXT: Record<string, Record<string, ChoiceText>> = {
  fixingOffered: MOUNTING_TEXT,
  fixingStandard: MOUNTING_TEXT,
  glassTypesOffered: GLASS_TYPE_TEXT,
  glassTypeStandard: GLASS_TYPE_TEXT,
  coatingsOffered: GLASS_COATING_TEXT,
  coatingStandard: GLASS_COATING_TEXT,
};

/** One change to the settings, in words. */
function describe(item: SettingsChangeItem, by: string): string {
  switch (item.field) {
    case 'supplier':
      if (item.change === 'renamed') return `${by} renamed the supplier “${item.from}” to “${item.to}”.`;
      if (item.change === 'updated') return `${by} updated the supplier “${item.label}”.`;
      return item.change === 'added' ? `${by} added the supplier “${item.label}”.` : `${by} removed the supplier “${item.label}” and its prices.`;
    case 'cost': {
      if ('change' in item && item.change === 'imported') {
        return `${by} imported ${item.count} ${item.count === 1 ? 'price' : 'prices'} for ${item.supplier.name}.`;
      }
      const price = (pence: number) => `${money(pence)} ${PER[item.unit] ?? ''}`.trim();
      const whose = `${item.supplier.name}’s price of “${item.label}”`;
      if (item.to === null) return `${by} took ${whose} away${item.from === null ? '' : `, which was ${price(item.from)}`}.`;
      return `${by} set ${whose} to ${price(item.to)}${item.from === null ? '' : `, from ${price(item.from)}`}.`;
    }
    case 'pricing':
      return `${by} set the mark-up on a supplier’s cost to ${item.to.markupBp / 100}%, from ${item.from.markupBp / 100}%.`;
    case 'price': {
      const price = (pence: number) => `${money(pence)} ${PER[item.unit] ?? ''}`.trim();
      if (item.to === null) return `${by} took the price off “${item.label}”${item.from === null ? '' : `, which was ${price(item.from)}`}.`;
      return `${by} set the price of “${item.label}” to ${price(item.to)}${item.from === null ? '' : `, from ${price(item.from)}`}.`;
    }
    case 'rule': {
      const text = (RULE_TEXT as Record<string, (typeof RULE_TEXT)[NamedRule] | undefined>)[item.rule];
      const what = text ? `${lowerFirst(text.group)}, ${lowerFirst(text.label)}` : item.rule;
      return `${by} set ${what} to ${inWords(item.rule, item.to)}, from ${inWords(item.rule, item.from)}.`;
    }
    case 'name':
      return `${by} renamed the company from “${item.from}” to “${item.to}”.`;
    case 'primary':
      return `${by} changed the colour of buttons from ${item.from} to ${item.to}.`;
    case 'primaryForeground':
      return `${by} changed the colour of the words on buttons from ${item.from} to ${item.to}.`;
    case 'logoUrl':
      return !item.to ? `${by} took the logo off.` : !item.from ? `${by} added a logo.` : `${by} changed the logo.`;
    case 'vatRateBp':
      return `${by} set VAT on new quotes to ${percent(item.to)}, from ${percent(item.from)}.`;
    case 'quoteValidDays':
      return `${by} set new quotes to stand for ${days(item.to)}, from ${days(item.from)}.`;
    case 'websites': {
      const added = item.added.length ? `let the designer show on ${listed(item.added)}` : '';
      const removed = item.removed.length ? `stopped it showing on ${listed(item.removed)}` : '';
      return `${by} ${[added, removed].filter(Boolean).join(' and ') || 'changed the websites'}.`;
    }
    case 'glassOffered':
      return `${by} offered customers ${millimetres(item.to)} glass, from ${millimetres(item.from)}.`;
    case 'glassStandard':
      return `${by} started new designs at ${item.to}mm glass, from ${item.from}mm.`;
    case 'wallHingesOffered':
    case 'inLineHingesOffered': {
      const styles: Record<string, HingeStyle> = item.field === 'wallHingesOffered' ? WALL_HINGE_STYLES : IN_LINE_HINGE_STYLES;
      const names = (ids: string[]) => listed(ids.map((id) => styles[id]?.words ?? id));
      return `${by} offered customers ${names(item.to)} hinges ${item.field === 'wallHingesOffered' ? 'to the wall' : 'in line'}, from ${names(item.from)}.`;
    }
    case 'slidingDoors':
      return item.to ? `${by} started offering customers sliding doors.` : `${by} stopped offering customers sliding doors.`;
    case 'fixingOffered':
    case 'glassTypesOffered':
    case 'coatingsOffered': {
      const text = CHOICE_TEXT[item.field];
      const words = (ids: string[]) => listed(ids.map((id) => text[id]?.words ?? id));
      const added = item.to.filter((id) => !item.from.includes(id));
      const removed = item.from.filter((id) => !item.to.includes(id));
      const parts = [...(added.length ? [`started offering customers ${words(added)}`] : []), ...(removed.length ? [`stopped offering customers ${words(removed)}`] : [])];
      return `${by} ${parts.join(' and ') || 'changed what customers can choose'}.`;
    }
    case 'fixingStandard':
    case 'glassTypeStandard':
    case 'coatingStandard': {
      const text = CHOICE_TEXT[item.field];
      return `${by} started new designs with ${text[item.to]?.words ?? item.to}, from ${text[item.from]?.words ?? item.from}.`;
    }
    case 'bellagioFit':
      return `${by} made Bellagio fitted ${item.to === 'without-seals' ? 'without' : 'with'} seals as standard, from ${item.from === 'without-seals' ? 'without' : 'with'}.`;
    case 'viennaCutout':
      return `${by} made Vienna cut-outs ${item.to === 'rectangular' ? 'rectangular' : 'mouse ear'} as standard, from ${item.from === 'rectangular' ? 'rectangular' : 'mouse ear'}.`;
    case 'wallHingeStandard':
    case 'inLineHingeStandard': {
      const styles: Record<string, HingeStyle> = item.field === 'wallHingeStandard' ? WALL_HINGE_STYLES : IN_LINE_HINGE_STYLES;
      return `${by} made ${styles[item.to]?.words ?? item.to} the standard hinge ${item.field === 'wallHingeStandard' ? 'to the wall' : 'in line'}, from ${styles[item.from]?.words ?? item.from}.`;
    }
    case 'notifyEmails': {
      const parts = [
        ...(item.added.length ? [`started emailing ${listed(item.added)}`] : []),
        ...(item.removed.length ? [`stopped emailing ${listed(item.removed)}`] : []),
      ];
      return `${by} ${parts.join(' and ')} about new designs.`;
    }
    case 'finish':
    case 'handle': {
      const kind = item.field;
      switch (item.change) {
        case 'added':
          return `${by} added the ${kind} “${item.label}”.`;
        case 'removed':
          return `${by} removed the ${kind} “${item.label}”.`;
        case 'renamed':
          return `${by} renamed the ${kind} “${item.from}” to “${item.to}”.`;
        case 'recoloured':
          return `${by} changed the colour of the finish “${item.label}”.`;
        case 'described':
          return `${by} changed what customers are told about the handle “${item.label}”.`;
        case 'coded':
          return !item.to
            ? `${by} took the CRL code off the ${kind} “${item.label}”.`
            : `${by} set the CRL code of the ${kind} “${item.label}” to ${item.to}${item.from ? `, from ${item.from}` : ''}.`;
        case 'reordered':
          return `${by} changed the order of the ${kind === 'finish' ? 'finishes' : 'handles'}.`;
      }
    }
  }
  return `${by} changed the settings.`;
}
