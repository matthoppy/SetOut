/**
 * What to order from CRL for the checked showers on the jobs chosen: every
 * part by its catalogue number, how many, and which jobs it is for. Seals,
 * wipes and channel come in 2.41m lengths, so they are counted as the
 * lengths the pieces are cut from. Anything SetOut cannot number, because a
 * finish or handle has no code yet, CRL does not make it in the finish, or
 * SetOut does not choose the part, is listed after, for the office.
 *
 * Jobs at Ordered are offered, or a single job when opened from its page.
 */

import { CRL_STOCK_LENGTH_MM, stockLengthsFor } from '@setout/engine';
import { useState } from 'react';
import { api, type Inbox, type JobDetail } from '../lib/api';
import { piecesOf, showerParts, type ShowerPart } from '../lib/crl';
import { whenExactly } from '../lib/format';
import { useLoad } from '../lib/load';
import { Link } from '../lib/router';
import { Problem, PrintedPage as Page } from './parts';

interface Need {
  job: string;
  shower: string;
  glassMm: number;
  part: ShowerPart;
  /** For a part bought by number. */
  each: number;
  /** For a part cut from lengths, the pieces in mm. */
  pieces: number[] | null;
}

interface Line {
  code: string;
  what: string;
  finish: string | null;
  each: number;
  pieces: number[] | null;
  jobs: Set<string>;
}

/** Every part a job's checked showers need, and the showers left out because they are not checked. */
function needsOf(detail: JobDetail): { needs: Need[]; unchecked: string[] } {
  const needs: Need[] = [];
  const unchecked: string[] = [];
  detail.designs.forEach((design, i) => {
    const shower = detail.designs.length > 1 ? (design.label && design.label !== 'Shower' ? design.label : `Shower ${i + 1}`) : '';
    const revision = design.revision;
    if (!revision?.checked_at) {
      unchecked.push(`${detail.job.reference}${shower ? ` ${shower}` : ''}`);
      return;
    }
    const spec = revision.computed;
    for (const part of showerParts(revision.document.design, spec, detail.labels)) {
      const pieces = piecesOf(part.fitting, spec);
      // Clamps are chosen on site, so there is no count to give.
      const each = part.fitting.kind === 'hinges' ? part.fitting.count : pieces || part.fitting.kind === 'clamps' ? 0 : 1;
      needs.push({ job: detail.job.reference, shower, glassMm: spec.glassThicknessMm, part, each, pieces });
    }
  });
  return { needs, unchecked };
}

const metres = (mm: number) => `${(mm / 1000).toFixed(2)}m`;

function quantity(line: Pick<Line, 'each' | 'pieces'>): string {
  if (!line.pieces) return line.each > 0 ? String(line.each) : '—';
  const lengths = stockLengthsFor(line.pieces);
  const total = line.pieces.reduce((sum, p) => sum + p, 0);
  return `${lengths} × ${metres(CRL_STOCK_LENGTH_MM)} ${lengths === 1 ? 'length' : 'lengths'} (${metres(total)} in all)`;
}

/** Why a part has no number, for the office. */
function whyNot(need: Need): string {
  const { part, what, finish, fitting } = need.part;
  if (!part) {
    return fitting.kind === 'seal' || fitting.kind === 'bottom-seal' || fitting.kind === 'channel'
      ? `SetOut has no CRL number for this on ${need.glassMm}mm glass yet.`
      : 'SetOut does not choose the model: choose it for the job.';
  }
  switch (part.status) {
    case 'no-finish-code':
      return `${finish} has no CRL finish code yet (Settings, Finishes): ${part.series} in ${finish}.`;
    case 'not-in-finish':
      return `Not in CRL's catalogue in ${finish?.toLowerCase()}: ${part.code}.`;
    case 'no-handle-code':
      return `${what} has no CRL number yet (Settings, Handles).`;
    case 'not-in-range':
      return `${part.range} makes no ${part.style} hinge.`;
    case 'found':
      return '';
  }
}

export function CrlOrder({ query, companyName }: { query: URLSearchParams; companyName: string }) {
  const asked = (query.get('jobs') ?? '').split(',').filter(Boolean);
  const ordered = useLoad<Inbox | null>(`crl:${asked.join(',')}`, (signal) => (asked.length ? Promise.resolve(null) : api.inbox({ stage: 'ordered' }, signal)));
  const ids = asked.length ? asked : (ordered.data?.jobs.map((j) => j.id) ?? []);
  const details = useLoad<JobDetail[]>(`crl-jobs:${ids.join(',')}`, (signal) => Promise.all(ids.map((id) => api.job(id, signal))));
  const [left, setLeft] = useState<Set<string>>(new Set());
  const printedAt = new Date().toISOString();

  if (ordered.error || details.error) {
    return (
      <div className="mx-auto max-w-4xl px-4 pt-4">
        <Problem error={ordered.error ?? details.error} retry={() => (ordered.reload(), details.reload())} />
      </div>
    );
  }
  if ((!asked.length && !ordered.data) || !details.data) {
    return (
      <p className="mx-auto max-w-4xl px-4 pt-6 text-quiet" role="status">
        Loading the CRL order
      </p>
    );
  }

  const jobs = details.data.map((d) => ({ detail: d, ...needsOf(d) }));
  const chosen = jobs.filter((j) => !left.has(j.detail.job.id));
  const needs = chosen.flatMap((j) => j.needs);
  const unchecked = chosen.flatMap((j) => j.unchecked);

  // Numbered parts, added up by number; the rest kept apart, one row each.
  const lines = new Map<string, Line>();
  const unnumbered: Need[] = [];
  for (const need of needs) {
    const { part } = need.part;
    if (part?.status !== 'found') {
      unnumbered.push(need);
      continue;
    }
    const line = lines.get(part.code) ?? { code: part.code, what: need.part.what, finish: need.part.finish, each: 0, pieces: need.pieces ? [] : null, jobs: new Set<string>() };
    line.each += need.each;
    if (line.pieces && need.pieces) line.pieces.push(...need.pieces);
    line.jobs.add(need.job);
    lines.set(part.code, line);
  }
  const ordering = [...lines.values()].sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-4 sm:px-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={asked.length === 1 ? `/jobs/${asked[0]}` : '/jobs'} className="text-sm font-medium text-accent">
          ← {asked.length === 1 ? 'Back to the job' : 'All jobs'}
        </Link>
        <button type="button" disabled={needs.length === 0} onClick={() => window.print()} className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-50">
          Print
        </button>
      </div>

      {!asked.length && (
        <fieldset className="mt-4 rounded-lg border border-rule bg-surface p-3 text-sm print:hidden">
          <legend className="px-1 font-semibold">Jobs on this order</legend>
          {jobs.length === 0 ? (
            <p className="text-quiet">No job is at Ordered yet. A job moves there when its customer accepts a quote, or when you move it.</p>
          ) : (
            <ul className="grid gap-1 sm:grid-cols-2">
              {jobs.map(({ detail }) => (
                <li key={detail.job.id}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!left.has(detail.job.id)}
                      onChange={(e) => {
                        const next = new Set(left);
                        if (e.target.checked) next.delete(detail.job.id);
                        else next.add(detail.job.id);
                        setLeft(next);
                      }}
                    />
                    <span>
                      {detail.job.reference} · {detail.customer?.name}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      )}

      {unchecked.length > 0 && (
        <p className="mt-3 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm print:hidden">
          Left off because they are not checked yet: {unchecked.join(', ')}. Check them on their job pages to add them.
        </p>
      )}

      <Page companyName={companyName} number={1} of={1}>
        <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider">CRL order</p>
            <h1 className="text-xl font-bold">{ordering.length === 1 ? '1 part' : `${ordering.length} parts`} by CRL catalogue number</h1>
            <p>{[...new Set(needs.map((n) => n.job))].join(', ')}</p>
          </div>
          <p className="text-right text-xs">{whenExactly(printedAt)}</p>
        </header>
        <table className="mt-2 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-black/50 text-[11px]">
              <th className="py-1 pr-2 font-semibold">CRL number</th>
              <th className="py-1 pr-2 font-semibold">What</th>
              <th className="py-1 pr-2 font-semibold">How many</th>
              <th className="py-1 font-semibold">For</th>
            </tr>
          </thead>
          <tbody>
            {ordering.map((line) => (
              <tr key={line.code} className="break-inside-avoid border-b border-black/20 align-top">
                <td className="whitespace-nowrap py-1.5 pr-2 font-mono font-semibold">{line.code}</td>
                <td className="py-1.5 pr-2">
                  {line.what}
                  {line.finish ? `, ${line.finish}` : ''}
                </td>
                <td className="py-1.5 pr-2 tabular-nums">{quantity(line)}</td>
                <td className="py-1.5">{[...line.jobs].join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ordering.length === 0 && <p className="mt-3 text-quiet">Nothing to order: no checked shower on the jobs chosen.</p>}

        {unnumbered.length > 0 && (
          <section className="mt-5">
            <h2 className="text-[13px] font-bold uppercase">Not numbered yet</h2>
            <p className="text-[11px]">For the office to choose or sort out before ordering.</p>
            <table className="mt-1 w-full border-collapse text-left">
              <tbody>
                {unnumbered.map((need, i) => (
                  <tr key={i} className="break-inside-avoid border-b border-black/20 align-top">
                    <td className="py-1.5 pr-2">
                      {need.part.what}
                      {need.part.finish ? `, ${need.part.finish}` : ''}
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums">{quantity(need)}</td>
                    <td className="py-1.5 pr-2">
                      {need.job}
                      {need.shower ? ` ${need.shower}` : ''}
                    </td>
                    <td className="py-1.5 italic">{whyNot(need)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <p className="mt-4 text-[11px]">
          Seals, wipes and channel are counted in CRL&rsquo;s {metres(CRL_STOCK_LENGTH_MM)} lengths, as many pieces from each as fit. Prices are not shown: they come from your CRL trade account.
        </p>
      </Page>
    </div>
  );
}
