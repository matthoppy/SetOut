/**
 * The making sheets for a job: one printed page per shower, for the
 * workshop and the toughener.
 *
 * Only a checked shower gets one, because what is made must be what a member
 * of staff has looked over. Everything on it comes from the revision that was
 * checked, as the server worked it out: every pane's cut size beside what was
 * measured, its notches, holes and cut-outs, the hinge and handle positions,
 * the glass, the fixings, and the drawings of that revision.
 */

import type { ConfiguratorSpec, ConfiguratorState, Pane } from '@setout/engine';
import { api, fileUrl, type JobDetail, type JobFile, type Revision } from '../lib/api';
import { humanise, layoutName, whenExactly } from '../lib/format';
import { useLoad } from '../lib/load';
import { describeFeature, panes as panesFor } from '../lib/panes';
import { Link } from '../lib/router';
import { Problem } from './parts';

const GLASS: Record<string, string> = { clear: 'clear', 'low-iron': 'low-iron', satin: 'satin', bronze: 'bronze tinted', grey: 'grey tinted' };

export function MakingSheet({ id }: { id: string }) {
  const job = useLoad<JobDetail>(`making:${id}`, (signal) => api.job(id, signal));
  const detail = job.data;
  if (!detail) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-4 sm:px-6">
        {job.error ? <Problem error={job.error} retry={job.reload} /> : <p className="text-quiet" role="status">Loading the making sheets</p>}
      </div>
    );
  }
  const received = detail.events.find((e) => e.type === 'received');
  const layout = typeof received?.data.template === 'string' ? received.data.template : null;
  const count = detail.designs.length;
  const printedAt = new Date().toISOString();

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-4 sm:px-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={`/jobs/${detail.job.id}`} className="text-sm font-medium text-accent">
          ← Back to the job
        </Link>
        <button type="button" onClick={() => window.print()} className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink">
          Print
        </button>
      </div>

      {detail.designs.map((design, i) => {
        const title = count > 1 ? (design.label && design.label !== 'Shower' ? design.label : `Shower ${i + 1}`) : 'The shower';
        const revision = design.revision;
        if (!revision || !revision.checked_at) {
          return (
            <p key={design.id} className="mt-6 rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm print:hidden">
              {title} is not checked yet, so it has no making sheet. Check it on the job page first.
            </p>
          );
        }
        const drawings = detail.files.filter((f) => f.kind === 'drawing' && f.revisionId === revision.id);
        return (
          <Sheet
            key={design.id}
            title={title}
            reference={detail.job.reference}
            customer={detail.customer?.name ?? ''}
            postcode={detail.customer?.postcode ?? detail.job.site_postcode ?? ''}
            layout={layoutName(layout)}
            revision={revision}
            design={revision.document.design}
            spec={revision.computed}
            drawings={drawings}
            printedAt={printedAt}
          />
        );
      })}
    </div>
  );
}

function Sheet({
  title,
  reference,
  customer,
  postcode,
  layout,
  revision,
  design,
  spec,
  drawings,
  printedAt,
}: {
  title: string;
  reference: string;
  customer: string;
  postcode: string;
  layout: string;
  revision: Revision;
  design: ConfiguratorState;
  spec: ConfiguratorSpec;
  drawings: JobFile[];
  printedAt: string;
}) {
  const doors = spec.panels.filter((p) => p.door);
  const drawn = panesFor(design, spec);
  const checker = revision.checkedBy ? (revision.checkedBy.name ?? revision.checkedBy.email) : 'a former member of the team';
  const glass = `${spec.glassThicknessMm}mm toughened ${GLASS[design.glassType] ?? design.glassType}${design.glassCoating === 'easy-clean' ? ', easy-clean coated' : ''}`;
  const finish = humanise(design.finishId);
  const elevation = drawings.find((d) => d.name.startsWith('elevation'));
  const plan = drawings.find((d) => d.name.startsWith('plan'));

  return (
    <section className="mt-6 break-after-page rounded-lg border border-rule bg-white p-5 text-[13px] leading-snug text-black print:mt-0 print:rounded-none print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider">Making sheet</p>
          <h1 className="text-xl font-bold">
            {reference} · {title}
          </h1>
          <p>
            {customer}
            {postcode ? `, ${postcode}` : ''} · {layout}
          </p>
        </div>
        <div className="text-right text-xs">
          <p className="font-semibold">Revision {revision.number}</p>
          <p>
            Checked by {checker}, {whenExactly(revision.checked_at ?? '')}
          </p>
          <p>Printed {whenExactly(printedAt)}</p>
        </div>
      </header>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 print:grid-cols-2">
        <Fact label="Glass">{glass}</Fact>
        <Fact label="Panes">
          {spec.panels.length}, {spec.totalGlassWeightKg}kg in all
        </Fact>
        <Fact label="Fixing">
          {spec.mounting === 'channel' ? `U-channel, ${finish}, ${(spec.totalChannelLengthMm / 1000).toFixed(2)}m in all` : `Glass clamps, ${finish}`}
        </Fact>
        <Fact label="Height">
          {spec.heightMm}mm{spec.isFloorToCeiling ? ', floor to ceiling' : ''}
        </Fact>
        <Fact label="Finish">{finish}</Fact>
        <Fact label="Handle">{humanise(design.handleId)}</Fact>
      </dl>

      <h2 className="mt-4 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">Cut list</h2>
      <table className="mt-1 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-black/40 text-xs">
            <th className="py-1 pr-2 font-semibold">Pane</th>
            <th className="py-1 pr-2 text-right font-semibold">Cut W × H mm</th>
            <th className="py-1 pr-2 text-right font-semibold">Measured</th>
            <th className="py-1 pr-2 text-right font-semibold">Weight</th>
            <th className="py-1 font-semibold">Notches, holes and cut-outs, as seen from outside</th>
          </tr>
        </thead>
        <tbody>
          {spec.panels.map((panel, i) => (
            <tr key={panel.id} className="border-b border-black/20 align-top">
              <td className="py-1.5 pr-2 font-semibold">{panel.label}</td>
              <td className="whitespace-nowrap py-1.5 pr-2 text-right text-base font-bold tabular-nums">
                {panel.cutWidthMm} × {panel.cutHeightMm}
              </td>
              <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums">
                {panel.tightWidthMm} × {panel.tightHeightMm}
              </td>
              <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums">{Math.round(panel.weightKg * 10) / 10}kg</td>
              <td className="py-1.5 text-xs">
                <Workings pane={drawn[i]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {doors.length > 0 && (
        <>
          <h2 className="mt-4 border-b border-black pb-0.5 text-sm font-bold uppercase tracking-wide">{doors.length === 1 ? 'Door' : 'Doors'}</h2>
          <table className="mt-1 w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-black/40 text-xs">
                <th className="py-1 pr-2 font-semibold">Door</th>
                <th className="py-1 pr-2 font-semibold">Hinges</th>
                <th className="py-1 pr-2 font-semibold">Hinge centres from the bottom</th>
                <th className="py-1 pr-2 font-semibold">Handle holes from the bottom</th>
                <th className="py-1 font-semibold">Opens</th>
              </tr>
            </thead>
            <tbody>
              {doors.map((panel) => (
                <tr key={panel.id} className="border-b border-black/20 align-top">
                  <td className="py-1.5 pr-2 font-semibold">{panel.label}</td>
                  <td className="py-1.5 pr-2">
                    {panel.door?.hingeCount} × {panel.door?.hingeBrand}, {panel.door?.hingeSide} hand, {finish}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">{panel.door?.hingeHeightsMm.join(' / ')}mm</td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {panel.door?.handleHoleHeightsMm.lowerMm} / {panel.door?.handleHoleHeightsMm.upperMm}mm
                  </td>
                  <td className="py-1.5">
                    {panel.door?.swing === 'both' ? 'Both ways' : 'Outwards'}
                    {panel.door?.sealType ? `, ${sealName(panel.door.sealType)}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {(spec.support.supportBarRequired || spec.support.supportPanelRequired) && (
        <p className="mt-3 border-l-4 border-black pl-2 font-semibold">
          {spec.support.supportBarRequired ? `Support bar needed. ${spec.support.supportBarReason ?? ''}` : ''}
          {spec.support.supportPanelRequired ? ` Support panel needed. ${spec.support.supportPanelReason ?? ''}` : ''}
        </p>
      )}

      {(spec.rakeNotes.length > 0 || spec.warnings.length > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
          {spec.rakeNotes.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wide">From the measuring</h2>
              <ul className="mt-1 list-disc pl-4 text-xs">
                {spec.rakeNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {spec.warnings.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wide">To check before cutting</h2>
              <ul className="mt-1 list-disc pl-4 text-xs">
                {spec.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {(elevation || plan) && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[elevation, plan].map(
            (d) =>
              d && (
                <figure key={d.id} className="border border-black/30 p-1">
                  <img src={fileUrl(d.id)} alt={d.name} className="mx-auto max-h-[90mm] w-auto max-w-full" />
                  <figcaption className="text-center text-[10px] uppercase tracking-wider">{d.name.startsWith('plan') ? 'Plan' : 'Elevation'}</figcaption>
                </figure>
              )
          )}
        </div>
      )}
      <p className="mt-3 text-[10px] text-black/60">Drawings are to scale but indicative. Cut from the sizes above.</p>
    </section>
  );
}

/** A seal as the workshop calls it: "90° stopper seal", never "seal seal". */
function sealName(seal: string): string {
  const name = humanise(seal).toLowerCase();
  return /\bseals?$/.test(name) ? name : `${name} seal`;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 font-semibold">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Workings({ pane }: { pane: Pane }) {
  if (pane.features.length === 0) return <span className="text-black/50">None</span>;
  return (
    <ul className="space-y-0.5">
      {pane.features.map((f, i) => (
        <li key={i}>{describeFeature(f)}</li>
      ))}
    </ul>
  );
}
