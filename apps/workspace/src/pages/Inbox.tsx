/**
 * The inbox: every job, newest first, by stage or by search.
 *
 * Each row says who, what, when and anything worth a look, so the list can be
 * worked from a phone without opening each job.
 */

import { useEffect, useState } from 'react';
import { api, ApiError, signInAgain, SignedOut, STAGES, type Inbox as InboxData, type InboxJob, type Stage } from '../lib/api';
import { layoutName, STAGE_NAMES, when } from '../lib/format';
import { useLoad } from '../lib/load';
import { go, Link } from '../lib/router';
import { Problem, StagePill } from './parts';

export function Inbox({ query }: { query: URLSearchParams }) {
  const stage = (STAGES as readonly string[]).includes(query.get('stage') ?? '') ? (query.get('stage') as Stage) : '';
  const q = query.get('q') ?? '';
  const [typed, setTyped] = useState(q);
  const [more, setMore] = useState<{ key: string; jobs: InboxJob[]; next: string | null } | null>(null);
  const [moreState, setMoreState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  // Search as they type, once they pause.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (typed.trim() !== q) go(address(stage, typed.trim()), { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [typed, q, stage]);

  const key = `${stage}|${q}`;
  const inbox = useLoad<InboxData>(key, (signal) => api.inbox({ stage, q }, signal));
  const extra = more?.key === key ? more : null;
  const jobs = [...(inbox.data?.jobs ?? []), ...(extra?.jobs ?? [])];
  const next = extra ? extra.next : (inbox.data?.next ?? null);
  const total = inbox.data ? Object.values(inbox.data.counts).reduce((a, b) => a + b, 0) : 0;

  const loadMore = async () => {
    if (!next || moreState.busy) return;
    setMoreState({ busy: true, error: null });
    try {
      const page = await api.inbox({ stage, q, after: next });
      setMore({ key, jobs: [...(extra?.jobs ?? []), ...page.jobs], next: page.next });
      setMoreState({ busy: false, error: null });
    } catch (error) {
      if (error instanceof SignedOut) return signInAgain();
      setMoreState({ busy: false, error: error instanceof ApiError ? error.message : 'Older jobs could not be loaded.' });
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Jobs</h1>
        {inbox.loading && <span className="text-sm text-quiet" role="status">Loading</span>}
      </div>

      <input
        type="search"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Search by name, reference, postcode, phone or email"
        aria-label="Search jobs"
        className="mt-3 h-11 w-full rounded-md border border-rule bg-surface px-3"
      />

      <nav aria-label="Stages" className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <StageTab label="All" count={inbox.data ? total : null} active={stage === ''} to={address('', q)} />
        {STAGES.map((s) => (
          <StageTab key={s} label={STAGE_NAMES[s]} count={inbox.data?.counts[s] ?? null} active={stage === s} to={address(s, q)} />
        ))}
      </nav>

      {inbox.error ? <Problem error={inbox.error} retry={inbox.reload} /> : null}

      {inbox.data && jobs.length === 0 && (
        <p className="mt-10 text-center text-quiet">
          {q ? `No job matches “${q}”.` : stage ? `No jobs are ${STAGE_NAMES[stage].toLowerCase()}.` : 'No jobs yet. Designs sent from your designer arrive here.'}
        </p>
      )}

      {jobs.length > 0 && (
        <ul className="mt-3 divide-y divide-rule overflow-hidden rounded-lg border border-rule bg-surface">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </ul>
      )}

      {next && (
        <button type="button" onClick={loadMore} disabled={moreState.busy} className="mt-4 h-11 w-full rounded-md border border-rule bg-surface font-medium disabled:opacity-60">
          {moreState.busy ? 'Loading older jobs' : 'Show older jobs'}
        </button>
      )}
      {moreState.error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {moreState.error}
        </p>
      )}
    </div>
  );
}

function address(stage: Stage | '', q: string) {
  const search = new URLSearchParams();
  if (stage) search.set('stage', stage);
  if (q) search.set('q', q);
  const query = search.toString();
  return `/jobs${query ? `?${query}` : ''}`;
}

function StageTab({ label, count, active, to }: { label: string; count: number | null; active: boolean; to: string }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${active ? 'border-accent bg-accent font-semibold text-accent-ink' : 'border-rule bg-surface'}`}
    >
      {label}
      {count !== null && (
        <>
          {' '}
          <span className={`tabular-nums ${active ? '' : 'text-quiet'}`}>{count}</span>
        </>
      )}
    </Link>
  );
}

function JobRow({ job }: { job: InboxJob }) {
  const size = job.widthMm && job.heightMm ? `${job.widthMm} × ${job.heightMm}mm` : '';
  const showers = job.designs > 1 ? `${job.designs} showers` : layoutName(job.layout);
  return (
    <li>
      <Link to={`/jobs/${job.id}`} className="block px-4 py-3 hover:bg-ground/60">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate font-semibold">{job.customer.name}</span>
          <span className="shrink-0 text-sm tabular-nums text-quiet">{when(job.createdAt)}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate text-quiet">
            {[showers, size, job.customer.postcode].filter(Boolean).join(' · ')}
          </span>
          <StagePill stage={job.stage} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-quiet">
          <span className="font-mono">{job.reference}</span>
          {job.blockingIssues > 0 && <span className="font-semibold text-bad">Cannot be made as drawn</span>}
          {job.warnings > 0 && <span className="text-warn">{job.warnings === 1 ? '1 thing to check' : `${job.warnings} things to check`}</span>}
          {job.photos > 0 && <span>{job.photos === 1 ? '1 photo' : `${job.photos} photos`}</span>}
          {job.sentQuickly && <span className="text-warn">Sent very quickly</span>}
        </div>
      </Link>
    </li>
  );
}
