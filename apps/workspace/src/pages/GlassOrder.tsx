/**
 * A glass order, for the toughener, laid out as Matt's own orders are.
 *
 * The first page lists every pane of the checked showers on the jobs chosen.
 * Then each pane has a page of its own: the order's header (work ID, date,
 * name, description, reference, marks, quantity, size and weight), the pane
 * drawn to scale with every edge dimensioned and marked FP, each cut-out on
 * its edge with its distance from the nearer end, and where the toughening
 * stamp goes. Last, a page of the cut-out templates used. Jobs that have
 * reached Ordered are offered, or a single job when opened from its page.
 *
 * Every size and position comes from the engine. Nothing is worked out here.
 */

import type { Pane, PaneFeature } from '@setout/engine';
import { useState } from 'react';
import { api, type Inbox, type JobDetail } from '../lib/api';
import { whenExactly } from '../lib/format';
import { useLoad } from '../lib/load';
import { describeFeature, panes as panesFor } from '../lib/panes';
import { Link } from '../lib/router';
import { Problem, PrintedPage as Page } from './parts';
import { lettersFor, PaneDrawing, TemplateDrawing } from './PaneDrawing';

const GLASS: Record<string, string> = { clear: 'Clear', 'low-iron': 'Low-iron', satin: 'Satin', bronze: 'Bronze tint', grey: 'Grey tint' };
const EDGEWORK = 'FP';

interface Sheet {
  key: string;
  job: string;
  customer: string;
  description: string;
  coated: boolean;
  reference: string;
  pane: Pane;
  marks: string;
}

/** Every pane of a job's checked showers, and the showers left out because they are not checked. */
function sheetsOf(detail: JobDetail): { sheets: Sheet[]; unchecked: string[] } {
  const sheets: Sheet[] = [];
  const unchecked: string[] = [];
  detail.designs.forEach((design, i) => {
    const name = detail.designs.length > 1 ? (design.label && design.label !== 'Shower' ? design.label : `Shower ${i + 1}`) : '';
    const revision = design.revision;
    if (!revision?.checked_at) {
      unchecked.push(`${detail.job.reference}${name ? ` ${name}` : ''}`);
      return;
    }
    const glass = revision.document.design;
    const coated = glass.glassCoating === 'easy-clean';
    const description = `${revision.computed.glassThicknessMm}mm ${GLASS[glass.glassType] ?? glass.glassType} Toughened${coated ? ', Easy-clean' : ''}`;
    for (const pane of panesFor(glass, revision.computed, detail.labels.hinges)) {
      sheets.push({
        key: `${design.id}:${pane.id}`,
        job: detail.job.reference,
        customer: detail.customer?.name ?? '',
        description,
        coated,
        reference: `Revision ${revision.number}, checked`,
        pane,
        marks: `${name ? `${name}, ` : ''}${pane.label}`,
      });
    }
  });
  return { sheets, unchecked };
}

const day = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));

export function GlassOrder({ query, companyName }: { query: URLSearchParams; companyName: string }) {
  const asked = (query.get('jobs') ?? '').split(',').filter(Boolean);
  // Opened from a job: that job. Otherwise, the jobs that have been ordered.
  const ordered = useLoad<Inbox | null>(`glass:${asked.join(',')}`, (signal) =>
    asked.length ? Promise.resolve(null) : api.inbox({ stage: 'ordered' }, signal)
  );
  const ids = asked.length ? asked : (ordered.data?.jobs.map((j) => j.id) ?? []);
  const details = useLoad<JobDetail[]>(`glass-jobs:${ids.join(',')}`, (signal) => Promise.all(ids.map((id) => api.job(id, signal))));
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
        Loading the glass order
      </p>
    );
  }

  const jobs = details.data.map((d) => ({ detail: d, ...sheetsOf(d) }));
  const chosen = jobs.filter((j) => !left.has(j.detail.job.id));
  const sheets = chosen.flatMap((j) => j.sheets);
  const unchecked = chosen.flatMap((j) => j.unchecked);
  const area = sheets.reduce((sum, s) => sum + (s.pane.widthMm * s.pane.heightMm) / 1_000_000, 0);
  const weight = sheets.reduce((sum, s) => sum + s.pane.weightKg, 0);
  // A letter for each template, in the order they first appear, and one
  // example of each for the last page.
  const letters = lettersFor(sheets.map((s) => s.pane));
  const templates = new Map<string, Exclude<PaneFeature, { kind: 'corner' }>>();
  for (const s of sheets) for (const f of s.pane.features) if (f.kind !== 'corner' && !templates.has(f.template)) templates.set(f.template, f);
  const pages = 1 + sheets.length + (templates.size > 0 ? 1 : 0);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-4 sm:px-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={asked.length === 1 ? `/jobs/${asked[0]}` : '/jobs'} className="text-sm font-medium text-accent">
          ← {asked.length === 1 ? 'Back to the job' : 'All jobs'}
        </Link>
        <button type="button" disabled={sheets.length === 0} onClick={() => window.print()} className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-50">
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
              {jobs.map(({ detail, sheets: s }) => (
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
                      {detail.job.reference} · {detail.customer?.name} · {s.length === 1 ? '1 pane' : `${s.length} panes`}
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

      {/* Page 1: every pane on the order. */}
      <Page companyName={companyName} number={1} of={pages}>
        <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider">Glass order</p>
            <h1 className="text-xl font-bold">{sheets.length === 1 ? '1 pane' : `${sheets.length} panes`}, all toughened</h1>
            <p>{[...new Set(sheets.map((s) => s.job))].join(', ')}</p>
          </div>
          <p className="text-right text-xs">{whenExactly(printedAt)}</p>
        </header>
        <table className="mt-2 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-black/50 text-[11px]">
              <th className="py-1 pr-2 font-semibold">Page</th>
              <th className="py-1 pr-2 font-semibold">Work ID and marks</th>
              <th className="py-1 pr-2 text-right font-semibold">Size mm</th>
              <th className="py-1 pr-2 font-semibold">Description</th>
              <th className="py-1 pr-2 font-semibold">Cut-outs, as seen from outside</th>
              <th className="py-1 text-right font-semibold">Weight</th>
            </tr>
          </thead>
          <tbody>
            {sheets.map((s, i) => (
              <tr key={s.key} className="break-inside-avoid border-b border-black/20 align-top">
                <td className="py-1.5 pr-2 tabular-nums">{i + 2}</td>
                <td className="py-1.5 pr-2">
                  <span className="font-semibold">{s.job}</span>
                  <br />
                  {s.marks}
                </td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right text-sm font-bold tabular-nums">
                  {s.pane.widthMm} × {s.pane.heightMm}
                </td>
                <td className="py-1.5 pr-2">
                  {s.description}, {EDGEWORK}
                </td>
                <td className="py-1.5 pr-2">
                  {s.pane.features.length ? (
                    <ul>
                      {s.pane.features.map((f, j) => (
                        <li key={j}>{describeFeature(f, s.pane, letters)}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-black/50">None</span>
                  )}
                </td>
                <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{Math.round(s.pane.weightKg * 10) / 10}kg</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-right text-sm font-semibold">
          {sheets.length === 1 ? '1 pane' : `${sheets.length} panes`}, {area.toFixed(2)}m², {Math.round(weight)}kg
        </p>
      </Page>

      {/* A page for each pane. */}
      {sheets.map((s, i) => {
        const holes = s.pane.features.filter((f): f is Extract<PaneFeature, { kind: 'hole' }> => f.kind === 'hole');
        return (
          <Page key={s.key} companyName={companyName} number={i + 2} of={pages}>
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 gap-y-0.5 text-[13px]">
              <span className="text-right">Work ID:</span>
              <span className="font-bold">{s.job}</span>
              <span className="text-right">Reference:</span>
              <span className="font-bold">{s.reference}</span>
              <span className="text-right">Name:</span>
              <span className="font-bold">{s.customer}</span>
              <span className="text-right">Marks:</span>
              <span className="font-bold">{s.marks}</span>
              <span className="text-right">Description:</span>
              <span className="font-bold">{s.description}</span>
              <span className="text-right">Quantity:</span>
              <span className="font-bold">1</span>
              <span className="text-right">Date:</span>
              <span className="font-bold">{day(printedAt)}</span>
              <span className="text-right">Size:</span>
              <span className="font-bold tabular-nums">
                {s.pane.widthMm} x {s.pane.heightMm} ({Math.round(s.pane.weightKg * 10) / 10}kg)
              </span>
            </div>
            <div className="mt-2">
              <PaneDrawing pane={s.pane} letters={letters} edgework={EDGEWORK} />
            </div>
            <div className="mt-1 space-y-0.5 text-center text-xs">
              {holes.length > 0 && holes.every((h) => h.diameterMm === holes[0].diameterMm) && <p>All holes have {holes[0].diameterMm}mm diameter.</p>}
              <p>
                Drawn as seen from outside the shower. {EDGEWORK} on every edge.
                {s.coated ? ' Easy-clean coating on the inside face.' : ''}
              </p>
            </div>
          </Page>
        );
      })}

      {/* The templates for the cut-outs used. */}
      {templates.size > 0 && (
        <Page companyName={companyName} number={pages} of={pages}>
          <h2 className="text-base font-bold">Templates for glass cut-outs</h2>
          <div className="mt-3 grid gap-6 sm:grid-cols-2 print:grid-cols-2">
            {[...templates.entries()].map(([template, feature]) => (
              <TemplateDrawing key={template} letter={letters.get(template) ?? '?'} feature={feature} />
            ))}
          </div>
        </Page>
      )}
    </div>
  );
}
