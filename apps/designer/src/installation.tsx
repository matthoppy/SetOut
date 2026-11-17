/**
 * A customer's installation sheets, opened from the link in their email at
 * /i/<link>, for whoever fits their shower.
 *
 * For each shower, the sheet as staff approved it, drawn with the same parts
 * as the workspace's: the shower seen from outside, how far out of square the
 * opening is, each pane as cut with the gaps to set it out by, and the
 * installation comments. Then the step-by-step fitting guide. It prints on
 * A4, a page each. The link is theirs alone: it opens these sheets and
 * nothing else, and this page never passes it on.
 */

import './index.css';
import {
  DEFAULT_RULESET,
  fittingGuideOf,
  fittingsOf,
  panesOf,
  setOutOf,
  type ConfiguratorSpec,
  type ConfiguratorState,
  type HingeStyles,
} from '@setout/engine';
import { Elevation, FittingGuide, OutOfSquare, SetOutBand } from '@setout/ui';
import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyBrand } from './lib/brand';

const token = window.location.pathname.split('/')[2] ?? '';

interface CustomerSheets {
  company: { name: string; primary: string; primaryForeground: string };
  reference: string;
  customerName: string | null;
  address: string | null;
  postcode: string | null;
  notes: string | null;
  approvedAt: string;
  sentAt: string | null;
  hinges: HingeStyles;
  showers: { title: string; revision: number; design: ConfiguratorState; spec: ConfiguratorSpec }[];
}

const GLASS: Record<string, string> = { clear: 'Clear', 'low-iron': 'Low-iron', satin: 'Satin', bronze: 'Bronze tint', grey: 'Grey tint' };
const day = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));

type Loaded = { state: 'loading' } | { state: 'ready'; sheets: CustomerSheets } | { state: 'failed'; reason: string };

function App() {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  useEffect(() => {
    fetch(`/api/installation/${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as CustomerSheets & { message?: string };
        if (!response.ok) throw new Error(body.message ?? 'This installation sheet could not be found. Check the link in your email.');
        applyBrand({ name: body.company.name, primary: body.company.primary, primaryForeground: body.company.primaryForeground });
        document.title = `Your installation sheet from ${body.company.name}`;
        setLoaded({ state: 'ready', sheets: body });
      })
      .catch((error: unknown) =>
        setLoaded({ state: 'failed', reason: error instanceof Error ? error.message : 'This installation sheet could not be opened. Please try again.' })
      );
  }, []);

  if (loaded.state === 'loading') {
    return (
      <p className="p-10 text-center text-sm text-muted-foreground" role="status">
        Opening your installation sheet
      </p>
    );
  }
  if (loaded.state === 'failed') {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center" role="alert">
        <h1 className="text-xl font-bold">We could not open this installation sheet</h1>
        <p className="mt-2 text-muted-foreground">{loaded.reason}</p>
      </main>
    );
  }
  return <Sheets sheets={loaded.sheets} />;
}

function Sheets({ sheets }: { sheets: CustomerSheets }) {
  const pages = sheets.showers.length * 2;
  const address = [sheets.address, sheets.postcode].filter(Boolean).join('\n');
  return (
    <div className="min-h-[100dvh] bg-muted/30 print:bg-white">
      <header className="bg-primary text-primary-foreground print:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-5">
          <p className="text-lg font-bold">{sheets.company.name}</p>
          <button type="button" onClick={() => window.print()} className="h-10 rounded-md bg-primary-foreground px-4 text-sm font-semibold text-primary">
            Print
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 pb-16 pt-6 print:max-w-none print:p-0">
        <div className="print:hidden">
          <h1 className="text-2xl font-bold sm:text-3xl">Your installation sheet</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            For your shower, {sheets.reference}
            {sheets.customerName ? `, for ${sheets.customerName}` : ''}
            {sheets.sentAt ? `. Sent ${day(sheets.sentAt)}` : ''}.
          </p>
          <p className="mt-4 rounded-lg border bg-background p-4">
            Please pass this to whoever is fitting your shower, and ask them to read it all before they start. It prints on A4. Any questions, reply to the email
            it came with and {sheets.company.name} will help.
          </p>
        </div>
        {sheets.showers.map((shower, i) => {
          const panes = panesOf(shower.design, shower.spec, DEFAULT_RULESET.fixed, sheets.hinges);
          const setOut = setOutOf(shower.design, shower.spec, DEFAULT_RULESET.fixed);
          const steps = fittingGuideOf(shower.spec, fittingsOf(shower.design, shower.spec, DEFAULT_RULESET.fixed));
          const glass = `${shower.spec.glassThicknessMm}mm ${GLASS[shower.design.glassType] ?? shower.design.glassType}`;
          return (
            <div key={i}>
              <Page company={sheets.company.name} number={i * 2 + 1} of={pages}>
                <div className="border border-black">
                  <header className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3 border-b border-black px-2 py-1.5">
                    <h2 className="text-[17px] font-bold uppercase">Installation sheet</h2>
                    <p className="text-center text-[17px] font-bold">{shower.title}</p>
                    <p className="text-right text-[17px] font-bold">{sheets.reference}</p>
                  </header>
                  <div className="grid border-b border-black sm:grid-cols-[1.12fr_1fr] print:grid-cols-[1.12fr_1fr]">
                    <div className="border-black p-1 sm:border-r print:border-r">
                      <Elevation setOut={setOut} panes={panes} spec={shower.spec} />
                      <p className="px-1 text-[11px]">Seen from outside</p>
                    </div>
                    <div className="flex flex-col">
                      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 border-b border-black p-2 text-[12px]">
                        <dt className="text-right">Customer:</dt>
                        <dd className="font-bold">{sheets.customerName ?? ''}</dd>
                        <dt className="text-right">Installation address:</dt>
                        <dd className="whitespace-pre-line font-bold">{address || 'Not given'}</dd>
                        <dt className="text-right">Glass:</dt>
                        <dd>{glass}, toughened</dd>
                        <dt className="text-right">Reference:</dt>
                        <dd>
                          Revision {shower.revision}, approved {day(sheets.approvedAt)}
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
                  <section className="min-h-[70px] px-2 py-1.5">
                    <h2 className="text-[13px] font-bold uppercase">Installation comments</h2>
                    <p className="mt-0.5 whitespace-pre-line text-[12px]">{sheets.notes ?? ''}</p>
                  </section>
                </div>
              </Page>
              <Page company={sheets.company.name} number={i * 2 + 2} of={pages}>
                <FittingGuide title={shower.title} reference={sheets.reference} steps={steps} />
              </Page>
            </div>
          );
        })}
      </main>
    </div>
  );
}

/** One printed A4 page, with the company's name and the page number at its foot. */
function Page({ company, number, of, children }: { company: string; number: number; of: number; children: ReactNode }) {
  return (
    <section className="mt-4 flex min-h-[1020px] flex-col break-after-page overflow-x-auto rounded-lg border bg-white p-5 text-[12px] leading-snug text-black print:mt-0 print:min-h-[270mm] print:overflow-visible print:rounded-none print:border-0 print:p-0">
      <div className="min-w-[640px] flex-1 print:min-w-0">{children}</div>
      <footer className="mt-4 flex justify-between text-[12px]">
        <span>{company}</span>
        <span>
          Page {number} of {of}
        </span>
      </footer>
    </section>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
