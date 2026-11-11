/**
 * A customer's quote, opened from the link in their email at /q/<link>.
 *
 * It shows what the company is offering, line by line, with what it comes to
 * and until when, and lets the customer accept it by typing their name and
 * ticking a box. The link is theirs alone: it opens this one quote and
 * nothing else, and this page never passes it on.
 */

import './index.css';
import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { applyBrand } from './lib/brand';

const token = window.location.pathname.split('/')[2] ?? '';
const base = `/api/quote/${encodeURIComponent(token)}`;

interface CustomerQuote {
  company: { name: string; primary: string; primaryForeground: string; logoUrl?: string };
  reference: string;
  number: number;
  status: 'sent' | 'accepted' | 'withdrawn';
  expired: boolean;
  customerName: string | null;
  lines: { description: string; quantity: number; unit: string; unitPricePence: number; totalPence: number }[];
  subtotalPence: number;
  vatPence: number;
  vatRateBp: number;
  totalPence: number;
  currency: string;
  note: string | null;
  sentAt: string | null;
  validUntil: string | null;
  acceptedAt: string | null;
  acceptedName: string | null;
}

const UNITS: Record<string, string> = { each: 'each', m2: 'm²', m: 'm', set: 'set', job: 'job' };
const day = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));

type Loaded = { state: 'loading' } | { state: 'ready'; quote: CustomerQuote } | { state: 'failed'; reason: string };

function App() {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  useEffect(() => {
    fetch(base, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as CustomerQuote & { message?: string };
        if (!response.ok) throw new Error(body.message ?? 'This quote could not be found. Check the link in your email.');
        applyBrand({ name: body.company.name, primary: body.company.primary, primaryForeground: body.company.primaryForeground });
        document.title = `Your quote from ${body.company.name}`;
        setLoaded({ state: 'ready', quote: body });
      })
      .catch((error: unknown) =>
        setLoaded({ state: 'failed', reason: error instanceof Error ? error.message : 'This quote could not be opened. Please try again.' })
      );
  }, []);

  if (loaded.state === 'loading') {
    return (
      <p className="p-10 text-center text-sm text-muted-foreground" role="status">
        Opening your quote
      </p>
    );
  }
  if (loaded.state === 'failed') {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center" role="alert">
        <h1 className="text-xl font-bold">We could not open this quote</h1>
        <p className="mt-2 text-muted-foreground">{loaded.reason}</p>
      </main>
    );
  }
  return <QuoteView quote={loaded.quote} onAccepted={(acceptedAt, acceptedName) => setLoaded({ state: 'ready', quote: { ...loaded.quote, status: 'accepted', acceptedAt, acceptedName } })} />;
}

function QuoteView({ quote, onAccepted }: { quote: CustomerQuote; onAccepted: (at: string, name: string) => void }) {
  const money = (pence: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: quote.currency }).format(pence / 100);
  const open = quote.status === 'sent' && !quote.expired;
  return (
    <div className="min-h-[100dvh] bg-muted/30">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-2xl px-5 py-5">
          {quote.company.logoUrl ? <img src={quote.company.logoUrl} alt={quote.company.name} className="h-10 w-auto" /> : <p className="text-lg font-bold">{quote.company.name}</p>}
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 pb-16 pt-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Your quote</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quote {quote.number} for your shower, {quote.reference}
          {quote.customerName ? `, for ${quote.customerName}` : ''}
          {quote.sentAt ? `. Sent ${day(quote.sentAt)}` : ''}.
        </p>

        {quote.status === 'accepted' && quote.acceptedAt && (
          <p className="mt-5 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-900" role="status">
            Accepted by {quote.acceptedName} on {day(quote.acceptedAt)}. Thank you: {quote.company.name} will be in touch to arrange what happens next.
          </p>
        )}
        {quote.status === 'withdrawn' && (
          <p className="mt-5 rounded-lg border bg-background p-4" role="status">
            {quote.company.name} has withdrawn this quote, so it can no longer be accepted. If you were expecting it, please get in touch with them.
          </p>
        )}
        {quote.status === 'sent' && quote.expired && quote.validUntil && (
          <p className="mt-5 rounded-lg border bg-background p-4" role="status">
            This quote ran out on {day(quote.validUntil)}. Please ask {quote.company.name} for a new one.
          </p>
        )}

        {quote.note && <p className="mt-5 whitespace-pre-line rounded-lg border bg-background p-4">{quote.note}</p>}

        <section className="mt-5 rounded-lg border bg-background" aria-label="What is included">
          <ul className="divide-y">
            {quote.lines.map((line, i) => (
              <li key={i} className="flex justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p>{line.description}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {line.quantity} {UNITS[line.unit] ?? line.unit} at {money(line.unitPricePence)}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{money(line.totalPence)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1 border-t px-4 py-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Before VAT</dt>
              <dd className="tabular-nums">{money(quote.subtotalPence)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">VAT at {quote.vatRateBp / 100}%</dt>
              <dd className="tabular-nums">{money(quote.vatPence)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-lg font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{money(quote.totalPence)}</dd>
            </div>
          </dl>
        </section>
        {open && quote.validUntil && <p className="mt-2 text-sm text-muted-foreground">This quote stands until {day(quote.validUntil)}.</p>}

        {open && <Accept defaultName={quote.customerName ?? ''} onAccepted={onAccepted} total={money(quote.totalPence)} company={quote.company.name} />}
      </main>
    </div>
  );
}

function Accept({ defaultName, onAccepted, total, company }: { defaultName: string; onAccepted: (at: string, name: string) => void; total: string; company: string }) {
  const [name, setName] = useState(defaultName);
  const [agreed, setAgreed] = useState(false);
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setState({ busy: true, error: null });
    try {
      const response = await fetch(`${base}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name, agreed }),
      });
      const body = (await response.json().catch(() => ({}))) as { acceptedAt?: string; message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Your acceptance could not be sent. Please try again.');
      onAccepted(body.acceptedAt ?? new Date().toISOString(), name.trim());
    } catch (error) {
      setState({ busy: false, error: error instanceof Error ? error.message : 'Your acceptance could not be sent. Please try again.' });
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 rounded-lg border bg-background p-4">
      <h2 className="text-lg font-bold">Accept this quote</h2>
      <label className="mt-3 block text-sm">
        <span className="font-medium">Your name</span>
        <input
          required
          minLength={2}
          maxLength={100}
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 h-11 w-full rounded-md border bg-background px-3 text-base"
        />
      </label>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4" />
        <span>
          I accept this quote from {company} for {total} including VAT.
        </span>
      </label>
      {state.error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={!agreed || name.trim().length < 2 || state.busy} className="mt-4 h-11 w-full rounded-md bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50 sm:w-auto">
        {state.busy ? 'Sending' : 'Accept the quote'}
      </button>
    </form>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
