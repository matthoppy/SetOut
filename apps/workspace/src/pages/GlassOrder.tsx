/**
 * A glass order, for the toughener.
 *
 * Only the glass: every pane of the checked showers on the jobs chosen, with
 * its cut size, thickness, type and coating, its notches, holes and cut-outs
 * with their heights and edges, and its weight, then the totals. Jobs that
 * have reached Ordered are offered, or a single job when opened from its page.
 *
 * Positions are given as the engine states them, in words. Nothing here works
 * out where a hole goes or draws it from a guess, because a hole drawn on the
 * wrong side is a pane of toughened glass in the skip.
 */

import { useState } from 'react';
import { api, type Inbox, type JobDetail } from '../lib/api';
import { whenExactly } from '../lib/format';
import { useLoad } from '../lib/load';
import { Link } from '../lib/router';
import { Problem } from './parts';

const GLASS: Record<string, string> = { clear: 'Clear', 'low-iron': 'Low-iron', satin: 'Satin', bronze: 'Bronze tint', grey: 'Grey tint' };

interface Pane {
  key: string;
  job: string;
  pane: string;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  glass: string;
  coating: string;
  workings: string[];
  weightKg: number;
}

/** Every pane of a job's checked showers, and the showers left out because they are not checked. */
function panesOf(detail: JobDetail): { panes: Pane[]; unchecked: string[] } {
  const panes: Pane[] = [];
  const unchecked: string[] = [];
  detail.designs.forEach((design, i) => {
    const name = detail.designs.length > 1 ? (design.label && design.label !== 'Shower' ? design.label : `Shower ${i + 1}`) : '';
    const revision = design.revision;
    if (!revision?.checked_at) {
      unchecked.push(`${detail.job.reference}${name ? ` ${name}` : ''}`);
      return;
    }
    const { computed: spec, document } = revision;
    for (const panel of spec.panels) {
      panes.push({
        key: `${design.id}:${panel.id}`,
        job: detail.job.reference,
        pane: `${name ? `${name}, ` : ''}${panel.label}`,
        widthMm: panel.cutWidthMm,
        heightMm: panel.cutHeightMm,
        thicknessMm: spec.glassThicknessMm,
        glass: GLASS[document.design.glassType] ?? document.design.glassType,
        coating: document.design.glassCoating === 'easy-clean' ? 'Easy-clean' : '',
        workings: [
          ...panel.notches.map((n) => `Notch, ${n.corner}: ${n.widthMm} × ${n.heightMm}mm`),
          ...panel.cutouts.map((c) => `${c.description}: ${c.heightMm}mm up, ${c.edge}`),
        ],
        weightKg: panel.weightKg,
      });
    }
  });
  return { panes, unchecked };
}

export function GlassOrder({ query }: { query: URLSearchParams }) {
  const asked = (query.get('jobs') ?? '').split(',').filter(Boolean);
  // Opened from a job: that job. Otherwise, the jobs that have been ordered.
  const ordered = useLoad<Inbox | null>(`glass:${asked.join(',')}`, (signal) =>
    asked.length ? Promise.resolve(null) : api.inbox({ stage: 'ordered' }, signal)
  );
  const ids = asked.length ? asked : (ordered.data?.jobs.map((j) => j.id) ?? []);
  const details = useLoad<JobDetail[]>(`glass-jobs:${ids.join(',')}`, (signal) => Promise.all(ids.map((id) => api.job(id, signal))));
  const [left, setLeft] = useState<Set<string>>(new Set());
  const printedAt = new Date().toISOString();

  if (ordered.error || details.error) return <div className="mx-auto max-w-4xl px-4 pt-4"><Problem error={ordered.error ?? details.error} retry={() => { ordered.reload(); details.reload(); }} /></div>;
  if ((!asked.length && !ordered.data) || !details.data) {
    return <p className="mx-auto max-w-4xl px-4 pt-6 text-quiet" role="status">Loading the glass order</p>;
  }

  const jobs = details.data.map((d) => ({ detail: d, ...panesOf(d) }));
  const chosen = jobs.filter((j) => !left.has(j.detail.job.id));
  const panes = chosen.flatMap((j) => j.panes);
  const unchecked = chosen.flatMap((j) => j.unchecked);
  const area = panes.reduce((sum, p) => sum + (p.widthMm * p.heightMm) / 1_000_000, 0);
  const weight = panes.reduce((sum, p) => sum + p.weightKg, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-4 sm:px-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={asked.length === 1 ? `/jobs/${asked[0]}` : '/jobs'} className="text-sm font-medium text-accent">
          ← {asked.length === 1 ? 'Back to the job' : 'All jobs'}
        </Link>
        <button type="button" disabled={panes.length === 0} onClick={() => window.print()} className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-50">
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
              {jobs.map(({ detail, panes: p }) => (
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
                      {detail.job.reference} · {detail.customer?.name} · {p.length === 1 ? '1 pane' : `${p.length} panes`}
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

      <section className="mt-4 rounded-lg border border-rule bg-white p-5 text-[12px] leading-snug text-black print:mt-0 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider">Glass order</p>
            <h1 className="text-xl font-bold">{panes.length === 1 ? '1 pane' : `${panes.length} panes`}, all toughened</h1>
            <p>{[...new Set(panes.map((p) => p.job))].join(', ')}</p>
          </div>
          <p className="text-right text-xs">Printed {whenExactly(printedAt)}</p>
        </header>
        <table className="mt-2 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-black/50 text-[11px]">
              <th className="py-1 pr-2 font-semibold">#</th>
              <th className="py-1 pr-2 font-semibold">Job and pane</th>
              <th className="py-1 pr-2 text-right font-semibold">Width × height mm</th>
              <th className="py-1 pr-2 font-semibold">Glass</th>
              <th className="py-1 pr-2 font-semibold">Notches, holes and cut-outs</th>
              <th className="py-1 text-right font-semibold">Weight</th>
            </tr>
          </thead>
          <tbody>
            {panes.map((p, i) => (
              <tr key={p.key} className="break-inside-avoid border-b border-black/20 align-top">
                <td className="py-1.5 pr-2 tabular-nums">{i + 1}</td>
                <td className="py-1.5 pr-2">
                  <span className="font-semibold">{p.job}</span>
                  <br />
                  {p.pane}
                </td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right text-sm font-bold tabular-nums">
                  {p.widthMm} × {p.heightMm}
                </td>
                <td className="py-1.5 pr-2">
                  {p.thicknessMm}mm {p.glass}
                  {p.coating ? `, ${p.coating}` : ''}, toughened
                </td>
                <td className="py-1.5 pr-2">
                  {p.workings.length ? (
                    <ul>
                      {p.workings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-black/50">None</span>
                  )}
                </td>
                <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{Math.round(p.weightKg * 10) / 10}kg</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-right text-sm font-semibold">
          {panes.length === 1 ? '1 pane' : `${panes.length} panes`}, {area.toFixed(2)}m², {Math.round(weight)}kg
        </p>
        <p className="mt-2 text-[10px] text-black/60">
          Heights are to the centre of each hole or notch, measured up from the bottom edge of the pane. Hinge side and handle side are as on the job’s making sheet.
        </p>
      </section>
    </div>
  );
}
