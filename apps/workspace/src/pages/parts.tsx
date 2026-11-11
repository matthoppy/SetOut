/** Small pieces the workspace's screens share. */

import { ApiError, SignedOut, type Stage } from '../lib/api';
import { STAGE_NAMES } from '../lib/format';

const STAGE_TONE: Record<Stage, string> = {
  new: 'bg-accent text-accent-ink',
  reviewing: 'bg-warn/15 text-warn',
  quoted: 'bg-accent/15 text-accent',
  ordered: 'bg-good/15 text-good',
  done: 'bg-good/15 text-good',
  closed: 'bg-rule text-quiet',
};

export function StagePill({ stage }: { stage: Stage }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE_TONE[stage]}`}>{STAGE_NAMES[stage]}</span>;
}

/** Something that did not load, said plainly, with a way to try again. */
export function Problem({ error, retry }: { error: unknown; retry?: () => void }) {
  if (error instanceof SignedOut) throw error;
  const message = error instanceof ApiError ? error.message : 'Something went wrong.';
  return (
    <div role="alert" className="mt-4 rounded-lg border border-bad/40 bg-bad/10 p-4 text-sm">
      <p>{message}</p>
      {retry && (
        <button type="button" onClick={retry} className="mt-2 font-semibold underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-quiet">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** One printed A4 page, with the company's name and the page number at its foot. */
export function PrintedPage({ companyName, number, of, children }: { companyName: string; number: number; of: number; children: React.ReactNode }) {
  return (
    <section className="mt-4 flex min-h-[1020px] flex-col break-after-page rounded-lg border border-rule bg-white p-5 text-[12px] leading-snug text-black print:mt-0 print:min-h-[270mm] print:rounded-none print:border-0 print:p-0">
      <div className="flex-1">{children}</div>
      <footer className="mt-4 flex justify-between text-[12px]">
        <span>{companyName}</span>
        <span>
          Page {number} of {of}
        </span>
      </footer>
    </section>
  );
}
