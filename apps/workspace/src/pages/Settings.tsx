/**
 * The company's settings: the finishes and handles its customers choose from
 * in the designer, who hears about each design, how its quotes start, its
 * colours and logo, and its name.
 *
 * Everyone on the team can see them. Only an owner can change them, a part at
 * a time, and sees a record of each change. The server checks everything
 * again, and refuses a change made from an older copy, so two owners never
 * save over each other unawares.
 */

import { CRL_CODE, crlFinishCode, IN_LINE_HINGE_STYLES, IN_LINE_HINGES, WALL_HINGE_STYLES, WALL_HINGES, type HingeStyle } from '@setout/engine';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  api,
  ApiError,
  signInAgain,
  SignedOut,
  type Branding,
  type CompanySettings,
  type DesignerSettings,
  type Me,
  type Settings as SettingsData,
  type SettingsChange,
  type SettingsChangeItem,
} from '../lib/api';
import { when, whenExactly } from '../lib/format';
import { useLoad } from '../lib/load';
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
              <GlassPart
                key={designer.versions.glass}
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
            </div>
          ))}
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

function FinishesPart({ designer, owner, limits, justSaved, onSaved, onReload }: DesignerPartProps) {
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

function HandlesPart({ designer, owner, limits, justSaved, onSaved, onReload }: DesignerPartProps) {
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
            <li key={h.id}>
              <p className="flex items-baseline gap-3">
                <span className="font-medium">{h.label}</span>
                <CodeOf code={h.code ?? null} />
              </p>
              {h.description && <p className="text-quiet">{h.description}</p>}
              <p className="text-xs text-quiet">{drilling(h.id)}</p>
            </li>
          ))}
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
            <li key={row.key}>
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
              <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-quiet">
                {problems[i] && <span className="text-bad">{problems[i]}</span>}
                {long[i] && <span className="text-bad">Keep the line to {limits.description} characters.</span>}
                {codes[i] && <span className="text-bad">{codes[i]}</span>}
                {!row.id && <span className="font-medium text-accent">New</span>}
                <span>{drilledAs(row)}</span>
                {row.id && <UsedBy count={designer.inUse.handles[row.id] ?? 0} />}
              </p>
            </li>
          ))}
        </ul>
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

function GlassPart({ designer, owner, justSaved, onSaved, onReload }: DesignerPartProps) {
  const [offered, setOffered] = useState<number[]>(designer.glass.offered);
  const [standard, setStandard] = useState(designer.glass.standard);
  const saving = useSave(onSaved);
  const dirty = offered.join() !== designer.glass.offered.join() || standard !== designer.glass.standard;
  const valid = offered.length > 0 && offered.includes(standard);

  const toggle = (mm: number) => {
    const next = offered.includes(mm) ? offered.filter((t) => t !== mm) : [...offered, mm].sort((a, b) => a - b);
    setOffered(next);
    // New designs must start at a thickness on offer: 10mm if it is, or the first.
    if (next.length && !next.includes(standard)) setStandard(next.includes(10) ? 10 : next[0]);
  };
  const undo = () => {
    setOffered(designer.glass.offered);
    setStandard(designer.glass.standard);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void saving.save(
      () => api.saveDesignerSettings(designer.id, { glass: { offered, standard }, basedOn: { glass: designer.versions.glass } }),
      'The glass could not be saved. Please try again.'
    );
  };

  const about =
    'Your customers choose from the thicknesses you offer, and a new design starts at your standard one. Staff can make any shower in any of them. A thickness you have not quoted before starts with its glass unpriced.';

  if (!owner) {
    return (
      <Section title="Glass">
        <div className={`${CARD} text-sm`}>
          <Hint>{about}</Hint>
          <p>
            Offered: <span className="font-medium">{millimetres(designer.glass.offered)}</span>. A new design starts at{' '}
            <span className="font-medium">{designer.glass.standard}mm</span>.
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
function SlidingPart({ designer, owner, justSaved, onSaved, onReload }: DesignerPartProps) {
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

function HingesPart({ designer, owner, justSaved, onSaved, onReload }: DesignerPartProps) {
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
    const listed = <T extends string>(offered: T[], styles: Record<T, HingeStyle>, standard: T) =>
      offered.map((id) => `${styles[id].name}${id === standard ? ' (standard)' : ''}`).join(', ');
    return (
      <Section title="Hinges">
        <div className={`${CARD} space-y-1 text-sm`}>
          <Hint>{about}</Hint>
          <p>
            To the wall: <span className="font-medium">{listed(designer.hinges.wall.offered, WALL_HINGE_STYLES, designer.hinges.wall.standard)}</span>
          </p>
          <p>
            In line: <span className="font-medium">{listed(designer.hinges.inLine.offered, IN_LINE_HINGE_STYLES, designer.hinges.inLine.standard)}</span>
          </p>
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

function EmailsPart({ designer, owner, limits, justSaved, onSaved, onReload }: DesignerPartProps) {
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

function BrandingPart({ company, owner, justSaved, onSaved, onReload }: CompanyPartProps) {
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

function NamePart({ company, owner, limits, justSaved, onSaved, onReload }: CompanyPartProps & { limits: Limits }) {
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

/** One change to the settings, in words. */
function describe(item: SettingsChangeItem, by: string): string {
  switch (item.field) {
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
