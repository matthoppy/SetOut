/**
 * A quote on a job.
 *
 * A draft is changed here line by line: what each thing is, how many, and its
 * price before VAT. What it comes to is worked out as it is typed, and again
 * on the server, which is the figure that counts. Sending asks first, because
 * a sent quote can never be changed, only withdrawn. A sent quote is shown as
 * the customer reads it.
 */

import { useState } from 'react';
import {
  api,
  ApiError,
  signInAgain,
  SignedOut,
  type Quote,
  type QuoteDetail,
  type QuoteLine,
  type QuoteStatus,
  type QuoteUnit,
} from '../lib/api';
import { money, UNIT_NAMES, when, whenExactly } from '../lib/format';
import { useLoad } from '../lib/load';
import { go, Link } from '../lib/router';
import { Problem, Section } from './parts';

const STATUS: Record<QuoteStatus, { name: string; tone: string }> = {
  draft: { name: 'Draft', tone: 'bg-rule text-ink' },
  sent: { name: 'Sent', tone: 'bg-accent/15 text-accent' },
  accepted: { name: 'Accepted', tone: 'bg-good/15 text-good' },
  withdrawn: { name: 'Withdrawn', tone: 'bg-rule text-quiet' },
};

export function QuoteStatusPill({ status }: { status: QuoteStatus }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[status].tone}`}>{STATUS[status].name}</span>;
}

const failure = (error: unknown, otherwise: string) => {
  if (error instanceof SignedOut) {
    signInAgain();
    return '';
  }
  return error instanceof ApiError ? error.message : otherwise;
};

export function QuotePage({ jobId, quoteId }: { jobId: string; quoteId: string }) {
  const loaded = useLoad<QuoteDetail>(`${jobId}/${quoteId}`, (signal) => api.quote(jobId, quoteId, signal));
  const detail = loaded.data;
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-4 sm:px-6">
      <Link to={`/jobs/${jobId}`} className="text-sm font-medium text-accent">
        ← Back to the job
      </Link>
      {loaded.error && !detail ? <Problem error={loaded.error} retry={loaded.reload} /> : null}
      {!detail && !loaded.error && (
        <p className="pt-6 text-quiet" role="status">
          Loading the quote
        </p>
      )}
      {detail && (
        <>
          <header className="mt-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl font-bold">Quote {detail.quote.number}</h1>
              <QuoteStatusPill status={detail.quote.status} />
            </div>
            <p className="mt-1 text-sm text-quiet">
              {detail.job?.reference} · {detail.customer?.name}
              {detail.customer?.email ? ` · ${detail.customer.email}` : ''}
            </p>
          </header>
          {detail.quote.status === 'draft' ? (
            <DraftEditor key={detail.quote.id} detail={detail} jobId={jobId} onChanged={loaded.reload} />
          ) : (
            <SentQuote detail={detail} jobId={jobId} onChanged={loaded.reload} />
          )}
        </>
      )}
    </div>
  );
}

/** A line as it is being typed: the price is kept as words until it is saved. */
interface EditLine extends QuoteLine {
  price: string;
  qty: string;
}

const toEdit = (line: QuoteLine): EditLine => ({
  ...line,
  price: line.unitPricePence ? (line.unitPricePence / 100).toFixed(2) : '',
  qty: String(line.quantity),
});
const pence = (text: string) => {
  const value = Number.parseFloat(text.replace(/[£,\s]/g, ''));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : NaN;
};
const amount = (text: string) => {
  const value = Number.parseFloat(text.replace(/[,\s]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : NaN;
};
const fromEdit = (line: EditLine): QuoteLine => ({
  key: line.key,
  description: line.description,
  quantity: amount(line.qty),
  unit: line.unit,
  unitPricePence: pence(line.price || '0'),
});

function DraftEditor({ detail, jobId, onChanged }: { detail: QuoteDetail; jobId: string; onChanged: () => void }) {
  const { quote, customer, blocker } = detail;
  const [lines, setLines] = useState<EditLine[]>(() => quote.lines.map(toEdit));
  const [note, setNote] = useState(quote.note ?? '');
  const [vat, setVat] = useState(String(quote.vat_rate_bp / 100));
  const [days, setDays] = useState(String(quote.valid_days));
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<{ busy: string | null; error: string | null; confirming: boolean; sent: { link: string; emailed: boolean } | null }>({
    busy: null,
    error: null,
    confirming: false,
    sent: null,
  });

  const changed = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };
  const setLine = (i: number, patch: Partial<EditLine>) => changed(setLines)(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const parsed = lines.map(fromEdit);
  const bad = parsed.map((l) => !l.description.trim() || !Number.isFinite(l.quantity) || !Number.isFinite(l.unitPricePence));
  const vatBp = Math.round(Number.parseFloat(vat) * 100);
  const validDays = Number.parseInt(days, 10);
  const subtotal = parsed.reduce((sum, l, i) => sum + (bad[i] ? 0 : Math.round(l.quantity * l.unitPricePence)), 0);
  const vatPence = Number.isFinite(vatBp) ? Math.round((subtotal * vatBp) / 10_000) : 0;
  const unpriced = parsed.filter((l) => l.unitPricePence === 0).length;
  const valid = !bad.some(Boolean) && Number.isFinite(vatBp) && vatBp >= 0 && vatBp <= 10_000 && validDays >= 1 && validDays <= 365;

  const save = async () => {
    await api.saveQuote(jobId, quote.id, { lines: parsed, note: note.trim() || null, vatRateBp: vatBp, validDays });
    setDirty(false);
  };
  const run = async (busy: string, action: () => Promise<void>, otherwise: string) => {
    setState((s) => ({ ...s, busy, error: null }));
    try {
      await action();
      setState((s) => ({ ...s, busy: null }));
    } catch (error) {
      setState((s) => ({ ...s, busy: null, confirming: false, error: failure(error, otherwise) }));
    }
  };

  if (state.sent) {
    return (
      <Section title="Sent">
        <div className="rounded-lg border border-good/40 bg-good/10 p-4 text-sm">
          <p className="font-semibold">
            {state.sent.emailed
              ? `Quote ${quote.number} is on its way to ${customer?.email}.`
              : `Quote ${quote.number} is sent, but this place has no mail, so nothing was emailed.`}
          </p>
          <p className="mt-2">This is the customer’s own link to read and accept it. It is shown only now, so copy it if you want to send it another way.</p>
          <p className="mt-2 break-all rounded border border-rule bg-surface p-2 font-mono text-xs">{state.sent.link}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => navigator.clipboard?.writeText(state.sent?.link ?? '')} className="h-9 rounded-md border border-rule bg-surface px-3 font-medium">
              Copy the link
            </button>
            <button type="button" onClick={onChanged} className="h-9 rounded-md bg-accent px-3 font-semibold text-accent-ink">
              Done
            </button>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <>
      {blocker && (
        <p role="status" className="mt-4 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">
          {blocker.message}{' '}
          <Link to={`/jobs/${jobId}`} className="font-medium text-accent underline underline-offset-2">
            Go to the job
          </Link>
        </p>
      )}

      <Section title="Lines" aside={<span className="text-xs text-quiet">Prices before VAT</span>}>
        <ul className="space-y-2">
          {lines.map((line, i) => (
            <li key={i} className={`rounded-lg border bg-surface p-3 ${bad[i] ? 'border-bad/60' : 'border-rule'}`}>
              <label className="block text-sm">
                <span className="sr-only">Line {i + 1}</span>
                <textarea
                  rows={2}
                  maxLength={200}
                  value={line.description}
                  onChange={(e) => setLine(i, { description: e.target.value })}
                  className="w-full resize-y rounded-md border border-rule bg-ground p-2"
                />
              </label>
              <div className="mt-2 flex flex-wrap items-end gap-2 text-sm">
                <label className="w-24">
                  <span className="text-xs text-quiet">Quantity</span>
                  <input inputMode="decimal" value={line.qty} onChange={(e) => setLine(i, { qty: e.target.value })} className="mt-0.5 h-9 w-full rounded-md border border-rule bg-ground px-2 tabular-nums" />
                </label>
                <label className="w-24">
                  <span className="text-xs text-quiet">Unit</span>
                  <select value={line.unit} onChange={(e) => setLine(i, { unit: e.target.value as QuoteUnit })} className="mt-0.5 h-9 w-full rounded-md border border-rule bg-ground px-1">
                    {Object.entries(UNIT_NAMES).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-28">
                  <span className="text-xs text-quiet">Price per {UNIT_NAMES[line.unit]}</span>
                  <span className="mt-0.5 flex h-9 items-center rounded-md border border-rule bg-ground px-2">
                    <span className="text-quiet">£</span>
                    <input inputMode="decimal" value={line.price} placeholder="0.00" onChange={(e) => setLine(i, { price: e.target.value })} className="w-full bg-transparent pl-1 tabular-nums outline-none" />
                  </span>
                </label>
                <span className="ml-auto pb-2 text-right font-semibold tabular-nums">
                  {bad[i] ? '—' : money(Math.round(parsed[i].quantity * parsed[i].unitPricePence), quote.currency)}
                </span>
              </div>
              <button type="button" onClick={() => changed(setLines)(lines.filter((_, j) => j !== i))} className="mt-1 text-xs font-medium text-bad underline underline-offset-2">
                Remove this line
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            { label: 'Add a line', line: { key: null, description: '', quantity: 1, unit: 'each' as QuoteUnit, unitPricePence: 0 } },
            { label: 'Add fitting', line: { key: 'fitting', description: 'Survey and fitting', quantity: 1, unit: 'job' as QuoteUnit, unitPricePence: 0 } },
            { label: 'Add delivery', line: { key: 'delivery', description: 'Delivery', quantity: 1, unit: 'job' as QuoteUnit, unitPricePence: 0 } },
          ].map(({ label, line }) => (
            <button key={label} type="button" onClick={() => changed(setLines)([...lines, toEdit(line)])} className="h-9 rounded-md border border-rule bg-surface px-3 text-sm font-medium">
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="For the customer">
        <div className="space-y-3 rounded-lg border border-rule bg-surface p-3 text-sm">
          <label className="block">
            <span className="font-medium">A note with the quote</span> <span className="text-quiet">(if you like)</span>
            <textarea rows={3} maxLength={2000} value={note} onChange={(e) => changed(setNote)(e.target.value)} className="mt-1 w-full rounded-md border border-rule bg-ground p-2" />
          </label>
          <div className="flex flex-wrap gap-4">
            <label>
              <span className="font-medium">VAT</span>
              <span className="mt-1 flex h-9 w-24 items-center rounded-md border border-rule bg-ground px-2">
                <input inputMode="decimal" value={vat} onChange={(e) => changed(setVat)(e.target.value)} className="w-full bg-transparent tabular-nums outline-none" />
                <span className="text-quiet">%</span>
              </span>
            </label>
            <label>
              <span className="font-medium">Stands for</span>
              <span className="mt-1 flex h-9 w-32 items-center rounded-md border border-rule bg-ground px-2">
                <input inputMode="numeric" value={days} onChange={(e) => changed(setDays)(e.target.value)} className="w-full bg-transparent tabular-nums outline-none" />
                <span className="text-quiet">days</span>
              </span>
            </label>
          </div>
        </div>
      </Section>

      <Totals subtotal={subtotal} vat={vatPence} vatBp={Number.isFinite(vatBp) ? vatBp : 0} currency={quote.currency} />

      {unpriced > 0 && <p className="mt-2 text-sm text-warn">{unpriced === 1 ? '1 line has no price yet.' : `${unpriced} lines have no price yet.`}</p>}
      {state.error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {state.error}
        </p>
      )}

      {state.confirming ? (
        <div className="mt-4 rounded-lg border border-accent/40 bg-accent/10 p-4 text-sm">
          <p className="font-semibold">
            Send quote {quote.number} to {customer?.email} for {money(subtotal + vatPence, quote.currency)}?
          </p>
          <p className="mt-1">Once sent it cannot be changed, only withdrawn. The job moves to Quoted.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!!state.busy}
              onClick={() =>
                run(
                  'sending',
                  async () => {
                    if (dirty) await save();
                    const sent = await api.sendQuote(jobId, quote.id);
                    setState((s) => ({ ...s, confirming: false, sent: { link: sent.link, emailed: sent.emailed } }));
                  },
                  'The quote could not be sent.'
                )
              }
              className="h-10 rounded-md bg-accent px-4 font-semibold text-accent-ink disabled:opacity-60"
            >
              {state.busy === 'sending' ? 'Sending' : 'Send it'}
            </button>
            <button type="button" onClick={() => setState((s) => ({ ...s, confirming: false }))} className="h-10 rounded-md border border-rule bg-surface px-4 font-medium">
              Not yet
            </button>
          </div>
        </div>
      ) : (
        <div className="sticky bottom-0 -mx-4 mt-6 flex flex-wrap items-center gap-2 border-t border-rule bg-ground/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
          <button
            type="button"
            disabled={!dirty || !valid || !!state.busy}
            onClick={() => run('saving', save, 'The quote could not be saved.')}
            className="h-10 rounded-md border border-rule bg-surface px-4 font-semibold disabled:opacity-50"
          >
            {state.busy === 'saving' ? 'Saving' : dirty ? 'Save the draft' : 'Saved'}
          </button>
          <button
            type="button"
            disabled={!valid || !!blocker || subtotal <= 0 || !customer?.email || !!state.busy}
            onClick={() => setState((s) => ({ ...s, confirming: true, error: null }))}
            className="h-10 rounded-md bg-accent px-4 font-semibold text-accent-ink disabled:opacity-50"
          >
            Send to the customer
          </button>
          <button
            type="button"
            disabled={!!state.busy}
            onClick={() =>
              window.confirm('Throw this draft away?') &&
              run(
                'deleting',
                async () => {
                  await api.deleteQuote(jobId, quote.id);
                  go(`/jobs/${jobId}`);
                },
                'The draft could not be thrown away.'
              )
            }
            className="ml-auto text-sm font-medium text-bad underline underline-offset-2"
          >
            Throw away
          </button>
        </div>
      )}
    </>
  );
}

function Totals({ subtotal, vat, vatBp, currency }: { subtotal: number; vat: number; vatBp: number; currency: string }) {
  return (
    <dl className="mt-4 space-y-1 rounded-lg border border-rule bg-surface p-3 text-sm">
      <div className="flex justify-between">
        <dt className="text-quiet">Before VAT</dt>
        <dd className="tabular-nums">{money(subtotal, currency)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-quiet">VAT at {vatBp / 100}%</dt>
        <dd className="tabular-nums">{money(vat, currency)}</dd>
      </div>
      <div className="flex justify-between border-t border-rule pt-1 text-base font-bold">
        <dt>Total</dt>
        <dd className="tabular-nums">{money(subtotal + vat, currency)}</dd>
      </div>
    </dl>
  );
}

function SentQuote({ detail, jobId, onChanged }: { detail: QuoteDetail; jobId: string; onChanged: () => void }) {
  const quote: Quote = detail.quote;
  const [state, setState] = useState<{ busy: boolean; error: string | null; confirming: boolean }>({ busy: false, error: null, confirming: false });
  const withdraw = async () => {
    setState({ busy: true, error: null, confirming: true });
    try {
      await api.withdrawQuote(jobId, quote.id);
      onChanged();
    } catch (error) {
      setState({ busy: false, error: failure(error, 'The quote could not be withdrawn.'), confirming: false });
    }
  };
  return (
    <>
      <p className="mt-3 text-sm">
        {quote.sent_at && <>Sent {whenExactly(quote.sent_at)}. </>}
        {quote.status === 'sent' && quote.valid_until && <>Stands until {when(quote.valid_until)}. </>}
        {quote.status === 'accepted' && quote.accepted_at && (
          <span className="font-semibold text-good">
            Accepted by {quote.accepted_name}, {whenExactly(quote.accepted_at)}.
          </span>
        )}
        {quote.status === 'withdrawn' && <span className="font-semibold">Withdrawn. Its link says so.</span>}
      </p>
      <Section title="Lines">
        <ul className="divide-y divide-rule rounded-lg border border-rule bg-surface text-sm">
          {quote.lines.map((line, i) => (
            <li key={i} className="flex justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p>{line.description}</p>
                <p className="text-xs tabular-nums text-quiet">
                  {line.quantity} {UNIT_NAMES[line.unit]} at {money(line.unitPricePence, quote.currency)}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{money(line.totalPence ?? Math.round(line.quantity * line.unitPricePence), quote.currency)}</span>
            </li>
          ))}
        </ul>
      </Section>
      {quote.note && <p className="mt-4 whitespace-pre-line rounded-lg border border-rule bg-surface p-3 text-sm">{quote.note}</p>}
      <Totals subtotal={quote.subtotal_pence} vat={quote.vat_pence} vatBp={quote.vat_rate_bp} currency={quote.currency} />
      {state.error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {state.error}
        </p>
      )}
      {quote.status === 'sent' &&
        (state.confirming ? (
          <div className="mt-4 rounded-lg border border-bad/40 bg-bad/10 p-4 text-sm">
            <p>Withdraw quote {quote.number}? The customer can no longer accept it, and its link will say it was withdrawn.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={state.busy} onClick={withdraw} className="h-9 rounded-md bg-bad px-3 font-semibold text-white disabled:opacity-60">
                {state.busy ? 'Withdrawing' : 'Withdraw it'}
              </button>
              <button type="button" onClick={() => setState({ busy: false, error: null, confirming: false })} className="h-9 rounded-md border border-rule bg-surface px-3 font-medium">
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setState({ busy: false, error: null, confirming: true })} className="mt-4 text-sm font-medium text-bad underline underline-offset-2">
            Withdraw this quote
          </button>
        ))}
    </>
  );
}
