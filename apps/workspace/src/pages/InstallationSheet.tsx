/**
 * The installation sheets for a job: a printed page for each checked shower,
 * for the fitters, laid out as Custom Showers' own are.
 *
 * Across the top, the shower seen from outside, beside who it is for, where it
 * goes, and how far out of square the opening is. Below, every pane as cut
 * with the gaps to set it out by, then the fittings to take and the
 * installation comments. The company's name and the page number are at the
 * foot of each page.
 *
 * Only a checked shower gets one, because what is fitted must be what a
 * member of staff has looked over. Every size comes from the revision that was
 * checked, as the engine works it out. The address and the comments are the
 * job's own, and are written here.
 */

import type { ConfiguratorSpec, ConfiguratorState, Fitting, HingeMount } from '@setout/engine';
import { useState, type FormEvent } from 'react';
import { api, ApiError, signInAgain, SignedOut, type JobDetail, type OptionLabel, type Revision } from '../lib/api';
import { humanise, layoutName } from '../lib/format';
import { useLoad } from '../lib/load';
import { fittings, panes as panesFor, setOut as setOutFor } from '../lib/panes';
import { Link } from '../lib/router';
import { Elevation, OutOfSquare, paneName, SetOutBand } from './InstallDrawings';
import { Problem, PrintedPage } from './parts';

const GLASS: Record<string, string> = { clear: 'Clear', 'low-iron': 'Low-iron', satin: 'Satin', bronze: 'Bronze tint', grey: 'Grey tint' };
const MOUNTS: Record<HingeMount, string> = {
  'wall-to-glass': 'wall to glass',
  'glass-to-glass-180': 'glass to glass, 180°',
  'glass-to-glass-90': 'glass to glass, 90°',
};

const named = (list: OptionLabel[], id: string) => list.find((o) => o.id === id)?.label ?? humanise(id);
const day = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Where the glass goes: the job's own address, or the customer's, with the postcode once. */
function addressOf(detail: JobDetail): string {
  const lines = (detail.job.site_address ?? detail.customer?.address ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const postcode = detail.job.site_postcode ?? detail.customer?.postcode ?? '';
  const squashed = (text: string) => text.replace(/\s+/g, '').toUpperCase();
  if (postcode && !lines.some((line) => squashed(line).includes(squashed(postcode)))) lines.push(postcode);
  return lines.join('\n');
}

export function InstallationSheet({ id, companyName }: { id: string; companyName: string }) {
  const job = useLoad<JobDetail>(`installation:${id}`, (signal) => api.job(id, signal));
  const detail = job.data;
  if (!detail) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-4 sm:px-6">
        {job.error ? <Problem error={job.error} retry={job.reload} /> : <p className="text-quiet" role="status">Loading the installation sheets</p>}
      </div>
    );
  }
  const received = detail.events.find((e) => e.type === 'received');
  const layout = typeof received?.data.template === 'string' ? received.data.template : null;
  const count = detail.designs.length;
  const titled = detail.designs.map((design, i) => ({
    design,
    title:
      design.label && design.label !== 'Shower' ? design.label : count > 1 ? `Shower ${i + 1}` : layoutName(layout),
  }));
  const checked = titled.filter(({ design }) => design.revision?.checked_at);
  const unchecked = titled.filter(({ design }) => !design.revision?.checked_at);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-4 sm:px-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={`/jobs/${detail.job.id}`} className="text-sm font-medium text-accent">
          ← Back to the job
        </Link>
        <button
          type="button"
          disabled={checked.length === 0}
          onClick={() => window.print()}
          className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          Print
        </button>
      </div>

      <Details key={detail.job.id} detail={detail} said={typeof received?.data.notes === 'string' ? received.data.notes.trim() : ''} onSaved={job.reload} />

      {unchecked.length > 0 && (
        <p className="mt-4 rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm print:hidden">
          {unchecked.map((u) => u.title).join(', ')} {unchecked.length === 1 ? 'is' : 'are'} not checked yet, so {unchecked.length === 1 ? 'it has' : 'they have'} no
          installation sheet. Check {unchecked.length === 1 ? 'it' : 'them'} on the job page first.
        </p>
      )}

      {checked.map(({ design, title }, i) => {
        const revision = design.revision as Revision;
        return (
          <Sheet
            key={design.id}
            detail={detail}
            title={title}
            revision={revision}
            design={revision.document.design}
            spec={revision.computed}
            number={i + 1}
            of={checked.length}
            companyName={companyName}
          />
        );
      })}
    </div>
  );
}

/** The address the glass goes to and the comments for the fitters, written on screen and printed on every sheet. */
function Details({ detail, said, onSaved }: { detail: JobDetail; said: string; onSaved: () => void }) {
  const saved = {
    address: detail.job.site_address ?? detail.customer?.address ?? '',
    postcode: detail.job.site_postcode ?? detail.customer?.postcode ?? '',
    notes: detail.job.install_notes ?? '',
  };
  const [form, setForm] = useState(saved);
  const [state, setState] = useState<{ busy: boolean; error: string | null; done: boolean }>({ busy: false, error: null, done: false });
  const changed = form.address.trim() !== saved.address.trim() || form.postcode.trim() !== saved.postcode.trim() || form.notes.trim() !== saved.notes.trim();
  const edit = (field: keyof typeof form) => (event: { target: { value: string } }) => {
    setForm({ ...form, [field]: event.target.value });
    setState({ busy: false, error: null, done: false });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setState({ busy: true, error: null, done: false });
    try {
      const { installation } = await api.saveInstallation(detail.job.id, form);
      setForm({ address: installation.address ?? '', postcode: installation.postcode ?? '', notes: installation.notes ?? '' });
      setState({ busy: false, error: null, done: true });
      onSaved();
    } catch (error) {
      if (error instanceof SignedOut) return signInAgain();
      setState({ busy: false, error: error instanceof ApiError ? error.message : 'The details could not be saved.', done: false });
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 rounded-lg border border-rule bg-surface p-4 text-sm print:hidden">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-quiet">For the fitters</h2>
      <p className="mt-1 text-quiet">Printed on every installation sheet for this job.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="block">
          <span className="font-medium">Installation address</span>
          <textarea rows={3} maxLength={300} value={form.address} onChange={edit('address')} className="mt-1 w-full rounded-md border border-rule bg-surface p-2" />
        </label>
        <label className="block">
          <span className="font-medium">Postcode</span>
          <input maxLength={12} value={form.postcode} onChange={edit('postcode')} autoComplete="off" className="mt-1 h-10 w-full rounded-md border border-rule bg-surface px-2 uppercase" />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="font-medium">Installation comments</span>
        <textarea
          rows={4}
          maxLength={2000}
          value={form.notes}
          onChange={edit('notes')}
          placeholder="How the glass goes in, what to take, how to get in"
          className="mt-1 w-full rounded-md border border-rule bg-surface p-2"
        />
      </label>
      {said && <p className="mt-1 text-xs text-quiet">The customer wrote: “{said}”</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={state.busy || !changed} className="h-10 rounded-md bg-accent px-4 font-semibold text-accent-ink disabled:opacity-50">
          {state.busy ? 'Saving' : 'Save'}
        </button>
        {state.done && !changed && (
          <span role="status" className="text-good">
            Saved
          </span>
        )}
        {state.error && (
          <span role="alert" className="text-bad">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

function Sheet({
  detail,
  title,
  revision,
  design,
  spec,
  number,
  of,
  companyName,
}: {
  detail: JobDetail;
  title: string;
  revision: Revision;
  design: ConfiguratorState;
  spec: ConfiguratorSpec;
  number: number;
  of: number;
  companyName: string;
}) {
  const panes = panesFor(design, spec);
  const setOut = setOutFor(design, spec);
  const rows = fittingRows(fittings(design, spec), spec, design, detail.labels);
  const glass = `${spec.glassThicknessMm}mm ${GLASS[design.glassType] ?? humanise(design.glassType)}`;
  const customer = detail.customer;
  const address = addressOf(detail);

  return (
    <PrintedPage companyName={companyName} number={number} of={of}>
      <div className="border border-black">
        <header className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3 border-b border-black px-2 py-1.5">
          <h1 className="text-[17px] font-bold uppercase">Installation sheet</h1>
          <p className="text-center text-[17px] font-bold">{title}</p>
          <p className="text-right text-[17px] font-bold">{detail.job.reference}</p>
        </header>

        <div className="grid grid-cols-[1.12fr_1fr] border-b border-black">
          <div className="border-r border-black p-1">
            <Elevation setOut={setOut} panes={panes} spec={spec} />
            <p className="px-1 text-[11px]">Seen from outside</p>
          </div>
          <div className="flex flex-col">
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 border-b border-black p-2 text-[12px]">
              <dt className="text-right">Customer:</dt>
              <dd className="font-bold">{customer?.name ?? ''}</dd>
              <dt className="text-right">Installation address:</dt>
              <dd className="whitespace-pre-line font-bold">{address || 'Not given yet'}</dd>
              {customer?.phone && (
                <>
                  <dt className="text-right">Phone:</dt>
                  <dd>{customer.phone}</dd>
                </>
              )}
              {customer?.email && (
                <>
                  <dt className="text-right">Email:</dt>
                  <dd className="break-all">{customer.email}</dd>
                </>
              )}
              <dt className="text-right">Reference:</dt>
              <dd>
                Revision {revision.number}, checked {revision.checked_at ? day(revision.checked_at) : ''}
              </dd>
            </dl>
            <div className="flex flex-1 items-center p-2">
              <div className="w-full">
                <OutOfSquare setOut={setOut} />
              </div>
            </div>
          </div>
        </div>

        <div className="border-b border-black p-1">
          <SetOutBand setOut={setOut} panes={panes} glass={glass} />
        </div>

        <section className="border-b border-black px-2 py-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[13px] font-bold uppercase">Shower fittings</h2>
            <p className="text-[11px] font-semibold">Sizes in mm</p>
          </div>
          <table className="mt-1 w-full border-collapse text-left text-[12px]">
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="align-top">
                  <td className="w-10 py-0.5 pr-2 text-right tabular-nums">{row.qty}</td>
                  <td className="py-0.5 pr-3 font-semibold">{row.item}</td>
                  <td className="py-0.5 pr-3">{row.where}</td>
                  <td className="py-0.5">{row.finish}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="min-h-[70px] px-2 py-1.5">
          <h2 className="text-[13px] font-bold uppercase">Installation comments</h2>
          <p className="mt-0.5 whitespace-pre-line text-[12px]">{detail.job.install_notes ?? ''}</p>
        </section>
      </div>
    </PrintedPage>
  );
}

interface Row {
  qty: string;
  item: string;
  where: string;
  finish: string;
}

/** The fittings in the words the fitters use, with the company's own names for its finishes and handles. */
function fittingRows(fittings: Fitting[], spec: ConfiguratorSpec, design: ConfiguratorState, labels: JobDetail['labels']): Row[] {
  const finish = named(labels.finishes, design.finishId);
  const door = (pane: number) => `${paneName(spec.panels[pane]?.label ?? '')} door`;
  return fittings.map((f): Row => {
    switch (f.kind) {
      case 'hinges':
        return { qty: String(f.count), item: `${f.brand} hinge`, where: `${door(f.pane)}, ${MOUNTS[f.mount]}`, finish };
      case 'handle':
        return { qty: '1', item: named(labels.handles, f.handleId), where: door(f.pane), finish };
      case 'seal':
        return { qty: '1', item: capitalised(f.seal), where: `${door(f.pane)}, latch edge, ${f.lengthMm}mm`, finish: '' };
      case 'channel':
        return { qty: `${(f.lengthMm / 1000).toFixed(2)}m`, item: 'U-channel', where: 'In all, cut on site', finish };
      case 'clamps':
        return { qty: '', item: 'Glass clamps', where: 'For the fixed glass', finish };
      case 'support-bar':
        return { qty: '1', item: 'Support bar', where: f.reason ?? '', finish };
      case 'support-panel':
        return { qty: '1', item: 'Support panel', where: f.reason ?? '', finish: '' };
    }
  });
}
