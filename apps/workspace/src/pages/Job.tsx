/**
 * One job: who it is for, what to make, what was measured, and what has
 * happened to it.
 *
 * Everything shown comes from the server's own worked-out sizes and the
 * design document the customer sent, never from anything a browser added up.
 * The drawings are the ones the customer agreed to on the last card.
 */

import { journeySummary, type ConfiguratorSpec, type ConfiguratorState, type PanelSpec } from '@setout/engine';
import { useState, type FormEvent } from 'react';
import { api, ApiError, fileUrl, signInAgain, SignedOut, STAGES, type JobDetail, type JobEvent, type JobFile, type Stage } from '../lib/api';
import { bytes, humanise, layoutName, STAGE_NAMES, when, whenExactly } from '../lib/format';
import { useLoad } from '../lib/load';
import { Link } from '../lib/router';
import { Problem, Section, StagePill } from './parts';

export function Job({ id }: { id: string }) {
  const job = useLoad<JobDetail>(id, (signal) => api.job(id, signal));
  const detail = job.data;

  if (job.error && !detail) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-4 sm:px-6">
        <BackToInbox />
        <Problem error={job.error} retry={job.reload} />
      </div>
    );
  }
  if (!detail) {
    return (
      <p className="mx-auto max-w-3xl px-4 pt-6 text-quiet sm:px-6" role="status">
        Loading the job
      </p>
    );
  }

  const received = detail.events.find((e) => e.type === 'received');
  const drawings = orderDrawings(detail.files.filter((f) => f.kind === 'drawing'));
  const photos = detail.files.filter((f) => f.kind === 'photo' || f.kind === 'measuring_photo');
  const others = detail.files.filter((f) => f.kind === 'pdf' || f.kind === 'other');

  return (
    <article className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
      <BackToInbox />

      <header className="mt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-bold">{detail.customer?.name ?? 'Customer'}</h1>
          <StagePill stage={detail.job.stage} />
        </div>
        <p className="mt-1 text-sm text-quiet">
          <span className="font-mono">{detail.job.reference}</span> · received {whenExactly(detail.job.created_at)}
        </p>
        <StageChanger jobId={detail.job.id} stage={detail.job.stage} onMoved={job.reload} />
      </header>

      <Section title="Customer">
        <dl className="divide-y divide-rule rounded-lg border border-rule bg-surface text-sm">
          {detail.customer?.email && (
            <Row label="Email">
              <a className="break-all text-accent underline underline-offset-2" href={`mailto:${detail.customer.email}?subject=${encodeURIComponent(`Your shower design ${detail.job.reference}`)}`}>
                {detail.customer.email}
              </a>
            </Row>
          )}
          {detail.customer?.phone && (
            <Row label="Phone">
              <a className="text-accent underline underline-offset-2" href={`tel:${detail.customer.phone.replace(/\s+/g, '')}`}>
                {detail.customer.phone}
              </a>
            </Row>
          )}
          {(detail.customer?.postcode || detail.job.site_postcode) && <Row label="Postcode">{detail.customer?.postcode ?? detail.job.site_postcode}</Row>}
          {typeof received?.data.notes === 'string' && received.data.notes.trim() && <Row label="Their notes">{received.data.notes}</Row>}
        </dl>
      </Section>

      {detail.designs.map((design, i) =>
        design.revision ? (
          <Shower
            key={design.id}
            title={detail.designs.length > 1 ? design.label || `Shower ${i + 1}` : null}
            layout={typeof received?.data.template === 'string' ? received.data.template : null}
            design={design.revision.document.design}
            spec={design.revision.computed}
            revision={design.revision.number}
            drawings={i === 0 ? drawings : []}
          />
        ) : null
      )}

      {photos.length > 0 && (
        <Section title={photos.length === 1 ? 'Photo' : `Photos (${photos.length})`}>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((photo) => (
              <li key={photo.id}>
                <a href={fileUrl(photo.id)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-rule bg-surface">
                  <img src={fileUrl(photo.id)} alt={photo.name} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                </a>
                <p className="mt-1 truncate text-xs text-quiet">{photo.name}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {others.length > 0 && (
        <Section title="Files">
          <ul className="divide-y divide-rule rounded-lg border border-rule bg-surface text-sm">
            {others.map((f) => (
              <li key={f.id} className="flex justify-between gap-3 px-3 py-2">
                <a href={fileUrl(f.id)} target="_blank" rel="noreferrer" className="truncate text-accent underline underline-offset-2">
                  {f.name}
                </a>
                <span className="shrink-0 text-quiet">{bytes(f.sizeBytes)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Timeline">
        <ol className="space-y-3 rounded-lg border border-rule bg-surface p-4 text-sm">
          {detail.events.map((event) => (
            <TimelineEntry key={event.id} event={event} />
          ))}
        </ol>
        <NoteForm jobId={detail.job.id} onAdded={job.reload} />
      </Section>
    </article>
  );
}

function BackToInbox() {
  return (
    <Link to="/jobs" className="text-sm font-medium text-accent">
      ← All jobs
    </Link>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-3 py-2">
      <dt className="w-28 shrink-0 text-quiet">{label}</dt>
      <dd className="min-w-0 flex-1 whitespace-pre-line">{children}</dd>
    </div>
  );
}

/** The drawing of what was measured first, then the plan, then the elevation, then any others. */
function orderDrawings(files: JobFile[]): JobFile[] {
  const rank = (f: JobFile) => (f.name.startsWith('measurements') ? 0 : f.name.startsWith('plan') ? 1 : f.name.startsWith('elevation') ? 2 : 3);
  return [...files].sort((a, b) => rank(a) - rank(b));
}

const DRAWING_NAMES: Record<string, string> = {
  measurements: 'What the customer measured',
  'plan-view': 'Plan',
  'elevation-view': 'Elevation',
};

function StageChanger({ jobId, stage, onMoved }: { jobId: string; stage: Stage; onMoved: () => void }) {
  // The stage chosen shows straight away, until the job reloads with it.
  const [moving, setMoving] = useState<{ to: Stage | null; error: string | null }>({ to: null, error: null });
  const [shown, setShown] = useState(stage);
  if (shown !== stage) {
    setShown(stage);
    setMoving({ to: null, error: null });
  }
  const move = async (to: Stage) => {
    setMoving({ to, error: null });
    try {
      await api.moveJob(jobId, to);
      onMoved();
    } catch (error) {
      if (error instanceof SignedOut) return signInAgain();
      setMoving({ to: null, error: error instanceof ApiError ? error.message : 'The job could not be moved.' });
    }
  };
  return (
    <div className="mt-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-quiet">Stage</span>
        <select
          value={moving.to ?? stage}
          disabled={moving.to !== null}
          onChange={(e) => move(e.target.value as Stage)}
          className="h-10 rounded-md border border-rule bg-surface px-2 font-medium disabled:opacity-60"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_NAMES[s]}
            </option>
          ))}
        </select>
      </label>
      {moving.error && (
        <p role="alert" className="mt-1 text-sm text-bad">
          {moving.error}
        </p>
      )}
    </div>
  );
}

function Shower({
  title,
  layout,
  design,
  spec,
  revision,
  drawings,
}: {
  title: string | null;
  layout: string | null;
  design: ConfiguratorState;
  spec: ConfiguratorSpec;
  revision: number;
  drawings: JobFile[];
}) {
  const readings = journeySummary(design).filter((row) => row.status !== 'optional' || row.value);
  return (
    <>
      <Section title={title ?? 'The shower'} aside={revision > 1 ? <span className="text-xs text-quiet">Revision {revision}</span> : undefined}>
        <p className="text-lg font-semibold">
          {layoutName(layout)}, {spec.totalRunWidthMm} × {spec.heightMm}mm
        </p>
        <p className="text-sm text-quiet">
          {spec.panels.length === 1 ? '1 panel' : `${spec.panels.length} panels`}
          {spec.cornerCount > 0 ? `, ${spec.cornerCount === 1 ? '1 corner' : `${spec.cornerCount} corners`}` : ''}, {spec.totalGlassWeightKg}kg of glass
          {spec.isFloorToCeiling ? ', floor to ceiling' : ''}
        </p>
        <Checks spec={spec} />
      </Section>

      {drawings.length > 0 && (
        <Section title="Drawings">
          <ul className="space-y-3">
            {drawings.map((d) => {
              const name = DRAWING_NAMES[d.name.replace(/\.[a-z]+$/, '')] ?? d.name;
              return (
                <li key={d.id} className="overflow-hidden rounded-lg border border-rule bg-white">
                  <a href={fileUrl(d.id)} target="_blank" rel="noreferrer" className="block">
                    <img src={fileUrl(d.id)} alt={name} loading="lazy" className="mx-auto max-h-[70vh] w-auto max-w-full" />
                  </a>
                  <p className="border-t border-rule bg-surface px-3 py-1.5 text-xs text-quiet">{name}</p>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Cut sizes" aside={<span className="text-xs text-quiet">mm, width × height</span>}>
        <ul className="divide-y divide-rule rounded-lg border border-rule bg-surface">
          {spec.panels.map((panel) => (
            <PanelRow key={panel.id} panel={panel} />
          ))}
        </ul>
      </Section>

      <Section title="Hardware and glass">
        <dl className="divide-y divide-rule rounded-lg border border-rule bg-surface text-sm">
          <Row label="Glass">
            {design.glassThicknessMm}mm toughened, {humanise(design.glassType).toLowerCase()}
            {design.glassCoating === 'easy-clean' ? ', easy-clean coating' : ''}
          </Row>
          <Row label="Fixing">{design.mounting === 'channel' ? 'U-channel' : 'Glass clamps'}</Row>
          <Row label="Finish">{humanise(design.finishId)}</Row>
          <Row label="Handle">{humanise(design.handleId)}</Row>
          {spec.panels
            .filter((p) => p.door)
            .map((p) => (
              <Row key={p.id} label={spec.panels.filter((x) => x.door).length > 1 ? `${p.label} hinges` : 'Hinges'}>
                {p.door?.hingeCount ? `${p.door.hingeCount} × ` : ''}
                {p.door?.hingeBrand}, {p.door?.hingeSide} hand, opens {p.door?.swing === 'both' ? 'both ways' : 'outwards'}
              </Row>
            ))}
          {design.aboveDoor && <Row label="Above the door">{design.aboveDoor === 'glass' ? 'Glass transom' : 'Left open'}{design.doorHeightMm ? `, door ${design.doorHeightMm}mm tall` : ''}</Row>}
        </dl>
      </Section>

      <Section title="What was measured">
        <dl className="divide-y divide-rule rounded-lg border border-rule bg-surface text-sm">
          {readings.map((row, i) => (
            <Row key={`${row.screenId}-${i}`} label={row.label}>
              <span className={row.status === 'missing' ? 'text-bad' : undefined}>{row.value || (row.status === 'missing' ? 'Missing' : 'Not given')}</span>
            </Row>
          ))}
        </dl>
      </Section>
    </>
  );
}

function Checks({ spec }: { spec: ConfiguratorSpec }) {
  if (!spec.blockingIssues.length && !spec.warnings.length && !spec.rakeNotes.length) return null;
  return (
    <div className="mt-3 space-y-2 text-sm">
      {spec.blockingIssues.length > 0 && (
        <div className="rounded-md border border-bad/40 bg-bad/10 p-3">
          <p className="font-semibold text-bad">Cannot be made as drawn</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {spec.blockingIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {spec.warnings.length > 0 && (
        <div className="rounded-md border border-warn/40 bg-warn/10 p-3">
          <p className="font-semibold text-warn">To check before cutting</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {spec.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {spec.rakeNotes.length > 0 && (
        <div className="rounded-md border border-rule bg-surface p-3">
          <p className="font-semibold">Measuring notes</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {spec.rakeNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PanelRow({ panel }: { panel: PanelSpec }) {
  const detail: string[] = [];
  for (const n of panel.notches) detail.push(`Notch ${n.corner} ${n.widthMm} × ${n.heightMm}mm`);
  if (panel.door?.hingeHeightsMm.length) detail.push(`Hinge centres ${panel.door.hingeHeightsMm.join(' / ')}mm from the bottom`);
  for (const c of panel.cutouts) detail.push(`${c.description}: ${c.heightMm}mm, ${c.edge}`);
  return (
    <li className="flex gap-4 px-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{panel.label}</p>
        {detail.map((d) => (
          <p key={d} className="mt-0.5 text-xs text-quiet">
            {d}
          </p>
        ))}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-lg font-semibold tabular-nums">
          {panel.cutWidthMm} × {panel.cutHeightMm}
        </p>
        <p className="text-xs tabular-nums text-quiet">
          measured {panel.tightWidthMm} × {panel.tightHeightMm}
        </p>
        <p className="text-xs tabular-nums text-quiet">{Math.round(panel.weightKg * 10) / 10}kg</p>
      </div>
    </li>
  );
}

const WHO: Record<string, string> = { company: 'the team', customer: 'the customer' };

/** A timeline entry in words. */
function describe(event: JobEvent): string {
  const d = event.data;
  const who = event.actor ? (event.actor.name ?? event.actor.email) : null;
  switch (event.type) {
    case 'received': {
      const said = ['Sent from the designer.'];
      if (d.sentQuickly === true) said.push('It came faster than a person usually fills it in.');
      if (d.botCheck === 'failed') said.push('The bot check failed.');
      return said.join(' ');
    }
    case 'email_sent':
      return `Emailed to ${WHO[String(d.to)] ?? String(d.to)}.`;
    case 'email_failed':
      return `The email to ${WHO[String(d.to)] ?? String(d.to)} failed: ${String(d.reason ?? 'no reason given')}`;
    case 'email_not_sent':
      return `Not emailed to ${WHO[String(d.to)] ?? String(d.to)}: ${String(d.reason ?? 'no reason given')}`;
    case 'stage_changed':
      return `${who ?? 'Someone'} moved it from ${STAGE_NAMES[d.from as Stage] ?? String(d.from)} to ${STAGE_NAMES[d.to as Stage] ?? String(d.to)}.`;
    case 'note':
      return String(d.text ?? '');
    default:
      return humanise(event.type);
  }
}

function TimelineEntry({ event }: { event: JobEvent }) {
  const note = event.type === 'note';
  const who = event.actor ? (event.actor.name ?? event.actor.email) : null;
  return (
    <li className="flex gap-3">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${note ? 'bg-accent' : event.type === 'email_failed' ? 'bg-bad' : 'bg-rule'}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {note && who && <p className="text-xs font-semibold text-quiet">{who}</p>}
        <p className={note ? 'whitespace-pre-line' : undefined}>{describe(event)}</p>
        <p className="text-xs text-quiet" title={whenExactly(event.createdAt)}>
          {when(event.createdAt)}
        </p>
      </div>
    </li>
  );
}

function NoteForm({ jobId, onAdded }: { jobId: string; onAdded: () => void }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    setState({ busy: true, error: null });
    try {
      await api.addNote(jobId, text);
      setText('');
      setState({ busy: false, error: null });
      onAdded();
    } catch (error) {
      if (error instanceof SignedOut) return signInAgain();
      setState({ busy: false, error: error instanceof ApiError ? error.message : 'The note could not be added.' });
    }
  };
  return (
    <form onSubmit={submit} className="mt-3">
      <label htmlFor="note" className="sr-only">
        Add a note
      </label>
      <textarea
        id="note"
        rows={3}
        maxLength={4000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a note for the team"
        className="w-full rounded-md border border-rule bg-surface p-3 text-sm"
      />
      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={state.busy || !text.trim()} className="mt-2 h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-50">
        {state.busy ? 'Adding' : 'Add note'}
      </button>
    </form>
  );
}
