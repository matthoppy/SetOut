/**
 * One job: who it is for, what to make, what was measured, and what has
 * happened to it.
 *
 * Everything shown comes from the server's own worked-out sizes and the
 * design document the customer sent, never from anything a browser added up.
 * The drawings are the ones the customer agreed to on the last card.
 */

import { journeySummary, type ConfiguratorSpec, type ConfiguratorState, type HingeStyles, type Pane, type PanelSpec } from '@setout/engine';
import { useState, type FormEvent } from 'react';
import { api, ApiError, fileUrl, signInAgain, SignedOut, STAGES, type CutOverride, type JobDetail, type JobEvent, type JobPayment, type JobFile, type Revision, type Stage } from '../lib/api';
import { bytes, humanise, layoutName, money, STAGE_NAMES, when, whenExactly } from '../lib/format';
import { useLoad } from '../lib/load';
import { describeFeature, hingeStyle, panes as panesFor } from '../lib/panes';
import { go, Link } from '../lib/router';
import { lettersFor } from './PaneDrawing';
import { QuoteStatusPill } from './QuotePage';
import { Problem, Section, StagePill } from './parts';
import { SlidingNotice } from './Sliding';

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
  // The customer's latest confirmation: where to deliver, and the extras they chose.
  const confirmed = [...detail.events].filter((e) => e.type === 'order_confirmed').sort((a, b) => a.createdAt.localeCompare(b.createdAt)).pop() ?? null;
  const confirmedAddress = confirmed ? deliveryAddressOf(confirmed.data) : null;
  // Each shower shows the drawings of the revision it stands at. Those of
  // earlier revisions are kept, further down, for reference.
  const drawingsFor = (revision: Revision | null, i: number) =>
    orderDrawings(
      detail.files.filter(
        (f) => f.kind === 'drawing' && revision && (f.revisionId === revision.id || (f.revisionId === null && revision.number === 1 && i === 0))
      )
    );
  const shown = new Set(detail.designs.flatMap((d, i) => drawingsFor(d.revision, i).map((f) => f.id)));
  const earlier = detail.files.filter((f) => f.kind === 'drawing' && !shown.has(f.id));
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
          {confirmedAddress && (
            <Row label="Confirmed delivery address">
              <span className="whitespace-pre-line">{confirmedAddress.join('\n')}</span>
            </Row>
          )}
          {confirmed && typeof confirmed.data.preferred_delivery_date === 'string' && (
            <Row label="Preferred delivery date">{`${prettyDay(confirmed.data.preferred_delivery_date)} (to be confirmed)`}</Row>
          )}
          {confirmed && <Row label="Silicone tubes">{siliconeWords(confirmed.data)}</Row>}
          {confirmed && <Row label="Finishing tool">{confirmed.data.silicone_tool === 'yes' ? 'Yes' : 'No'}</Row>}
          {confirmed && (
            <Row label="Terms of sale">
              {confirmed.data.terms_accepted === true
                ? `Accepted ${typeof confirmed.data.terms_accepted_at === 'string' ? whenExactly(confirmed.data.terms_accepted_at) : ''}, version ${String(confirmed.data.terms_version ?? 'unknown')}`
                : 'Not recorded (confirmed before terms were added)'}
            </Row>
          )}
        </dl>
      </Section>

      {detail.designs.map((design, i) =>
        design.revision ? (
          <Shower
            key={design.id}
            title={detail.designs.length > 1 ? (named(design.label) ?? `Shower ${i + 1}`) : null}
            layout={typeof received?.data.template === 'string' ? received.data.template : null}
            design={design.revision.document.design}
            spec={design.revision.computed}
            hinges={detail.labels.hinges}
            revision={design.revision.number}
            drawings={drawingsFor(design.revision, i)}
            editHref={`/edit/${encodeURIComponent(detail.job.id)}/${encodeURIComponent(design.id)}`}
            changed={design.revision.author_kind === 'staff' ? { by: design.revision.changedBy, reason: design.revision.reason, at: design.revision.created_at } : null}
            signOff={<SignOff jobId={detail.job.id} designId={design.id} revision={design.revision} canBeMade={design.revision.computed.blockingIssues.length === 0} onChanged={job.reload} />}
            overrides={{ jobId: detail.job.id, designId: design.id, list: design.revision.cutOverrides ?? [], onChanged: job.reload }}
          />
        ) : null
      )}

      <Section title="Quotes">
        {detail.quotes.length > 0 && (
          <ul className="mb-3 divide-y divide-rule rounded-lg border border-rule bg-surface text-sm">
            {detail.quotes.map((q) => (
              <li key={q.id}>
                <Link to={`/jobs/${detail.job.id}/quotes/${q.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-ground/60">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">Quote {q.number}</span>
                    <QuoteStatusPill status={q.status} />
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{money(q.totalPence, q.currency)}</span>
                    <span className="block text-xs text-quiet">
                      {q.acceptedAt ? `Accepted ${when(q.acceptedAt)}` : q.sentAt ? `Sent ${when(q.sentAt)}` : `Written ${when(q.createdAt)}`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <WriteQuote jobId={detail.job.id} />
      </Section>

      {detail.payment && <PaymentSection jobId={detail.job.id} payment={detail.payment} onChanged={job.reload} />}

      {earlier.length > 0 && (
        <Section title="Earlier drawings">
          <details className="rounded-lg border border-rule bg-surface p-3 text-sm">
            <summary className="cursor-pointer text-quiet">
              {earlier.length === 1 ? '1 drawing' : `${earlier.length} drawings`} of a revision since changed
            </summary>
            <ul className="mt-3 space-y-3">
              {earlier.map((d) => (
                <li key={d.id} className="overflow-hidden rounded-md border border-rule bg-white">
                  <a href={fileUrl(d.id)} target="_blank" rel="noreferrer" className="block">
                    <img src={fileUrl(d.id)} alt={`Earlier ${d.name}`} loading="lazy" className="mx-auto max-h-[50vh] w-auto max-w-full" />
                  </a>
                  <p className="border-t border-rule bg-surface px-3 py-1.5 text-xs text-quiet">
                    {DRAWING_NAMES[d.name.replace(/\.[a-z]+$/, '')] ?? d.name}, {whenExactly(d.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        </Section>
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

const PAYMENT_STATE: Record<string, { label: string; tone: string }> = {
  unpaid: { label: 'Not paid', tone: 'bg-rule text-quiet' },
  checkout_open: { label: 'Customer is paying', tone: 'bg-warn/15 text-warn' },
  payment_failed: { label: 'Payment failed', tone: 'bg-bad/15 text-bad' },
  invoice_sent: { label: 'Invoice sent', tone: 'bg-accent/15 text-accent' },
  paid: { label: 'Paid', tone: 'bg-good/15 text-good' },
  partially_refunded: { label: 'Partly refunded', tone: 'bg-warn/15 text-warn' },
  refunded: { label: 'Refunded', tone: 'bg-rule text-quiet' },
};

const PRICE_MISSING: Record<string, string> = {
  no_quote: 'No sent or accepted quote yet, so there is nothing to pay. The customer’s pay button stays off.',
  quote_expired: 'The quote has run out. Send a new one before the customer can pay.',
  quote_empty: 'The quote has no total.',
  not_gbp: 'Only quotes in pounds can be paid.',
  quote_has_vat: 'The quote has VAT on it, and VAT is not charged (Stripe Tax is off). Write a quote with 0% VAT before the customer can pay.',
};

const PAYMENTS_OFF: Record<string, string> = {
  no_key: 'Payments are switched on for this company but the Stripe key is not set.',
  live_key_refused: 'A live Stripe key is set but live payments are not allowed. Nobody can pay.',
  bad_key: 'The Stripe key is not a Stripe secret key. Nobody can pay.',
  off: 'Payments are off.',
};

/** Where the customer's payment stands, from Stripe's messages, and a trade invoice to raise. */
function PaymentSection({ jobId, payment, onChanged }: { jobId: string; payment: JobPayment; onChanged: () => void }) {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const standing = PAYMENT_STATE[payment.standing.state] ?? PAYMENT_STATE.unpaid;
  const invoice = async () => {
    setState({ busy: true, error: null });
    try {
      await api.invoiceJob(jobId, true);
      setState({ busy: false, error: null });
      onChanged();
    } catch (error) {
      if (error instanceof SignedOut) return signInAgain();
      setState({ busy: false, error: error instanceof ApiError ? error.message : 'The invoice could not be raised.' });
    }
  };
  const tax = payment.stripeTax ? `Stripe Tax on, prices ${payment.taxMode ?? 'undecided'} of VAT` : 'No VAT charged (Stripe Tax off)';
  return (
    <Section title="Payment">
      <div className="space-y-3 rounded-lg border border-rule bg-surface p-4 text-sm" data-testid="payment">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${standing.tone}`}>{standing.label}</span>
          <span className="text-xs text-quiet">
            {payment.live ? 'Live' : 'Test mode'} · {tax}
          </span>
        </div>
        {!payment.enabled && payment.off && <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2">{PAYMENTS_OFF[payment.off] ?? payment.off}</p>}
        {payment.undecided.length > 0 && <p className="text-quiet">Still to be set: {payment.undecided.join(', ')}.</p>}
        {payment.price &&
          ('missing' in payment.price ? (
            <p className="text-quiet">{PRICE_MISSING[payment.price.missing] ?? payment.price.missing}</p>
          ) : (
            <p>
              Price from quote {payment.price.quoteNumber}: <strong className="tabular-nums">{money(payment.price.amountPence, 'GBP')}</strong>, paid in full up front.
            </p>
          ))}
        {payment.standing.paidTotalPence > 0 && (
          <p>
            Paid <strong className="tabular-nums">{money(payment.standing.paidTotalPence, 'GBP')}</strong>
            {payment.standing.taxPence > 0 && <> including {money(payment.standing.taxPence, 'GBP')} VAT</>}
            {payment.standing.refundedPence > 0 && <>, {money(payment.standing.refundedPence, 'GBP')} refunded</>}.
          </p>
        )}
        {payment.standing.paidCount > 1 && <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2">The customer paid more than once. Refund the extra payment in Stripe.</p>}
        {payment.standing.hostedInvoiceUrl && (
          <p>
            <a href={payment.standing.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
              Open the invoice
            </a>
          </p>
        )}
        {payment.payments.length > 0 && (
          <ul className="divide-y divide-rule border-t border-rule">
            {payment.payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-2">
                <span>
                  {p.method === 'checkout' ? 'Card payment (Checkout)' : 'Trade invoice'} · <span className="text-quiet">{humanise(p.status)}</span>
                </span>
                <span className="text-right tabular-nums">
                  {money(p.amountTotalPence ?? p.amountPence, 'GBP')}
                  <span className="block text-xs text-quiet">{when(p.paidAt ?? p.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {payment.canInvoice && (
          <div>
            <button type="button" onClick={invoice} disabled={state.busy} className="rounded-md border border-rule bg-surface px-3 py-1.5 font-medium hover:bg-ground disabled:opacity-60">
              {state.busy ? 'Raising invoice…' : `Invoice trade customer for ${money(payment.canInvoice.amountPence, 'GBP')}`}
            </button>
            <p className="mt-1 text-xs text-quiet">
              Due in {payment.invoiceDays} days{payment.bankTransfer ? ', card or bank transfer' : ''}. Stripe emails the customer the invoice.
            </p>
          </div>
        )}
        {state.error && <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2">{state.error}</p>}
      </div>
    </Section>
  );
}

/** Start a new quote, filled in from the showers as they stand, and open it. */
function WriteQuote({ jobId }: { jobId: string }) {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const write = async () => {
    setState({ busy: true, error: null });
    try {
      const made = await api.writeQuote(jobId);
      go(`/jobs/${jobId}/quotes/${made.id}`);
    } catch (error) {
      if (error instanceof SignedOut) return signInAgain();
      setState({ busy: false, error: error instanceof ApiError ? error.message : 'The quote could not be started.' });
    }
  };
  return (
    <div>
      <button type="button" onClick={write} disabled={state.busy} className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-60">
        {state.busy ? 'Writing the quote' : 'Write a quote'}
      </button>
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {state.error}
        </p>
      )}
    </div>
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
  measurements: 'What was measured',
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
  hinges,
  revision,
  drawings,
  signOff,
  editHref,
  changed,
  overrides,
}: {
  title: string | null;
  layout: string | null;
  design: ConfiguratorState;
  spec: ConfiguratorSpec;
  /** The company's standard hinges, for a shower without its own. */
  hinges: HingeStyles;
  revision: number;
  drawings: JobFile[];
  signOff: React.ReactNode;
  /** Where staff change this shower. */
  editHref: string;
  /** For a revision staff saved: who, why and when. */
  changed: { by: { name: string | null; email: string } | null; reason: string | null; at: string } | null;
  /** The panes cut to an override, and how to set or clear one. */
  overrides: { jobId: string; designId: string; list: CutOverride[]; onChanged: () => void };
}) {
  const readings = journeySummary(design).filter((row) => row.status !== 'optional' || row.value);
  const drawn = panesFor(design, spec, hinges);
  const letters = lettersFor(drawn);
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
        {changed && (
          <p className="mt-2 rounded-md bg-ground px-3 py-2 text-sm">
            <span className="font-semibold">Changed by {changed.by ? (changed.by.name ?? changed.by.email) : 'the team'}</span>, {whenExactly(changed.at)}
            {changed.reason ? `: ${changed.reason}` : ''}
          </p>
        )}
        <a
          href={editHref}
          className="mt-3 inline-flex h-10 items-center rounded-md border border-rule bg-surface px-4 text-sm font-semibold"
        >
          Change this shower
        </a>
        <SlidingNotice spec={spec} detail className="mt-3 rounded-md" />
        <Checks spec={spec} />
        {signOff}
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
          {spec.panels.map((panel, i) => (
            <PanelRow
              key={panel.id}
              panel={panel}
              pane={drawn[i]}
              letters={letters}
              override={overrides.list.find((o) => o.paneId === panel.id) ?? null}
              revision={revision}
              canOverride={!spec.sliding}
              onSave={(o) => api.setCutOverride(overrides.jobId, overrides.designId, panel.id, o)}
              onClear={() => api.clearCutOverride(overrides.jobId, overrides.designId, panel.id)}
              onChanged={overrides.onChanged}
            />
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
          <Row label="Handle">{spec.sliding ? 'Through-glass pull, in the Serenity kit' : humanise(design.handleId)}</Row>
          {spec.sliding && (
            <Row label="Sliding door">
              CRL Serenity kit {spec.sliding.kit}
              {spec.sliding.returnKit ? ` with the ${spec.sliding.returnKit} return kit` : ''}, header bar {spec.sliding.header.lengthMm}mm
            </Row>
          )}
          {spec.panels.map((p, i) => {
            if (!p.door) return null;
            const style = hingeStyle(design, spec, i, hinges);
            return (
              <Row key={p.id} label={spec.panels.filter((x) => x.door).length > 1 ? `${p.label} hinges` : 'Hinges'}>
                {p.door.hingeCount ? `${p.door.hingeCount} × ` : ''}
                {p.door.hingeBrand}
                {style ? `, ${style}` : ''}, {p.door.hingeSide} hand, opens {p.door.swing === 'both' ? 'both ways' : 'outwards'}
              </Row>
            );
          })}
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

/**
 * Whether a member of staff has looked over this shower and is happy for it
 * to be made. Only a checked design can become a making sheet or an order.
 */
function SignOff({
  jobId,
  designId,
  revision,
  canBeMade,
  onChanged,
}: {
  jobId: string;
  designId: string;
  revision: Revision;
  canBeMade: boolean;
  onChanged: () => void;
}) {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const act = async (change: () => Promise<unknown>, otherwise: string) => {
    setState({ busy: true, error: null });
    try {
      await change();
      setState({ busy: false, error: null });
      onChanged();
    } catch (error) {
      if (error instanceof SignedOut) return signInAgain();
      setState({ busy: false, error: error instanceof ApiError ? error.message : otherwise });
    }
  };

  if (revision.checked_at) {
    const who = revision.checkedBy ? (revision.checkedBy.name ?? revision.checkedBy.email) : 'someone no longer on the team';
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-good/40 bg-good/10 px-3 py-2 text-sm">
        <p>
          <span className="font-semibold text-good">✓ Checked</span> by {who}, {whenExactly(revision.checked_at)}
        </p>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link to={`/jobs/${jobId}/making`} className="text-sm font-semibold text-accent underline underline-offset-2">
            Making sheet
          </Link>
          <Link to={`/glass?jobs=${encodeURIComponent(jobId)}`} className="text-sm font-semibold text-accent underline underline-offset-2">
            Glass order
          </Link>
          <Link to={`/crl?jobs=${encodeURIComponent(jobId)}`} className="text-sm font-semibold text-accent underline underline-offset-2">
            CRL order
          </Link>
          <Link to={`/jobs/${jobId}/installation`} className="text-sm font-semibold text-accent underline underline-offset-2">
            Installation sheet
          </Link>
          <button
            type="button"
            disabled={state.busy}
            onClick={() => act(() => api.uncheck(jobId, designId), 'The check could not be taken back.')}
            className="text-sm font-medium text-quiet underline underline-offset-2 disabled:opacity-60"
          >
            Take back
          </button>
        </span>
        {state.error && (
          <p role="alert" className="w-full text-bad">
            {state.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-rule bg-surface p-3 text-sm">
      <p className="font-semibold">Not checked yet</p>
      <p className="mt-1 text-quiet">
        {canBeMade
          ? 'Look over the drawings, cut sizes and readings below, then mark it as checked. Only a checked design can be made.'
          : 'It cannot be made as drawn, so it cannot be checked until it is changed.'}
      </p>
      {canBeMade && (
        <button
          type="button"
          disabled={state.busy}
          onClick={() => act(() => api.check(jobId, designId, revision.number), 'It could not be marked as checked.')}
          className="mt-2 h-10 rounded-md bg-accent px-4 font-semibold text-accent-ink disabled:opacity-60"
        >
          {state.busy ? 'Marking as checked' : 'Mark as checked'}
        </button>
      )}
      {state.error && (
        <p role="alert" className="mt-2 text-bad">
          {state.error}
        </p>
      )}
    </div>
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

function PanelRow({
  panel,
  pane,
  letters,
  override,
  revision,
  canOverride,
  onSave,
  onClear,
  onChanged,
}: {
  panel: PanelSpec;
  pane: Pane;
  letters: Map<string, string>;
  override: CutOverride | null;
  revision: number;
  canOverride: boolean;
  onSave: (o: { widthDeductionMm: number; heightDeductionMm: number; reason: string }) => Promise<unknown>;
  onClear: () => Promise<unknown>;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="px-3 py-3">
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{panel.label}</p>
          {pane.shaped && <p className="mt-0.5 text-xs font-semibold text-warn">Cut to shape: see the glass order for its corners</p>}
          {pane.features.map((f, i) => (
            <p key={i} className="mt-0.5 text-xs text-quiet">
              {describeFeature(f, pane, letters)}
            </p>
          ))}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold tabular-nums">
            {pane.widthMm} × {pane.heightMm}
          </p>
          {override && <p className="text-xs font-semibold text-warn">From an override</p>}
          <p className="text-xs tabular-nums text-quiet">
            measured {panel.tightWidthMm} × {panel.tightHeightMm}
          </p>
          <p className="text-xs tabular-nums text-quiet">
            off {panel.deductions.horizontal.total} × {panel.deductions.vertical.total}
          </p>
          <p className="text-xs tabular-nums text-quiet">{Math.round(pane.weightKg * 10) / 10}kg</p>
        </div>
      </div>
      {override && !editing && <OverrideNotice override={override} revision={revision} />}
      {canOverride && !editing && (
        <button type="button" onClick={() => setEditing(true)} className="mt-2 text-xs font-semibold text-accent underline underline-offset-2">
          {override ? 'Change or clear the override' : 'Override the deductions for this job'}
        </button>
      )}
      {editing && (
        <OverrideForm
          override={override}
          onSave={onSave}
          onClear={onClear}
          onDone={(changed) => {
            setEditing(false);
            if (changed) onChanged();
          }}
        />
      )}
    </li>
  );
}

/** What the override takes off, instead of what, why, and who set it. */
function OverrideNotice({ override: o, revision }: { override: CutOverride; revision: number }) {
  const who = o.setBy ? (o.setBy.name ?? o.setBy.email) : 'someone no longer on the team';
  const standard =
    o.defaultWidthDeductionMm !== null && o.defaultHeightDeductionMm !== null
      ? ` instead of the standard ${o.defaultWidthDeductionMm}mm and ${o.defaultHeightDeductionMm}mm`
      : '';
  return (
    <div role="note" className="mt-2 rounded-md border border-warn/50 bg-warn/10 px-3 py-2 text-sm">
      <p>
        <span className="font-semibold">Cut size override for this job:</span> {o.widthDeductionMm}mm off the width and {o.heightDeductionMm}mm off the
        height{standard}. The standard rule is not used for this pane.
      </p>
      <p className="mt-0.5">
        <span className="font-semibold">Reason:</span> {o.reason}
      </p>
      <p className="mt-0.5 text-xs text-quiet">
        Set by {who}, {whenExactly(o.setAt)}
        {o.revisionNumber !== revision ? `, on revision ${o.revisionNumber}. The shower has changed since: check it still applies.` : '.'}
      </p>
    </div>
  );
}

function OverrideForm({
  override,
  onSave,
  onClear,
  onDone,
}: {
  override: CutOverride | null;
  onSave: (o: { widthDeductionMm: number; heightDeductionMm: number; reason: string }) => Promise<unknown>;
  onClear: () => Promise<unknown>;
  onDone: (changed: boolean) => void;
}) {
  const [width, setWidth] = useState(String(override?.widthDeductionMm ?? ''));
  const [height, setHeight] = useState(String(override?.heightDeductionMm ?? ''));
  const [reason, setReason] = useState(override?.reason ?? '');
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const act = async (change: () => Promise<unknown>) => {
    setState({ busy: true, error: null });
    try {
      await change();
      onDone(true);
    } catch (error) {
      if (error instanceof SignedOut) return signInAgain();
      setState({ busy: false, error: error instanceof ApiError ? error.message : 'That could not be saved. Try again.' });
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void act(() => onSave({ widthDeductionMm: Number(width), heightDeductionMm: Number(height), reason }));
  };
  const field = 'mt-1 h-10 w-full rounded-md border border-rule bg-white px-3 text-sm';
  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded-md border border-rule bg-white p-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="font-semibold">Off the width (mm)</span>
          <input type="number" min={0} max={200} step={1} required value={width} onChange={(e) => setWidth(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="font-semibold">Off the height (mm)</span>
          <input type="number" min={0} max={200} step={1} required value={height} onChange={(e) => setHeight(e.target.value)} className={field} />
        </label>
      </div>
      <label className="block">
        <span className="font-semibold">Reason</span>
        <input type="text" required minLength={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
      </label>
      {state.error && <p className="text-bad">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={state.busy} className="h-10 rounded-md bg-accent px-4 font-semibold text-white disabled:opacity-60">
          Save override
        </button>
        {override && (
          <button type="button" disabled={state.busy} onClick={() => void act(onClear)} className="h-10 rounded-md border border-rule px-4 font-semibold">
            Clear, use the standard rule
          </button>
        )}
        <button type="button" disabled={state.busy} onClick={() => onDone(false)} className="h-10 px-2 text-quiet">
          Cancel
        </button>
      </div>
    </form>
  );
}

const WHO: Record<string, string> = { company: 'the team', customer: 'the customer' };

/** A shower's own name, if it was given one: every shower is called "Shower" until then. */
function named(label: unknown): string | null {
  return typeof label === 'string' && label.trim() && label !== 'Shower' ? label : null;
}

/** "a", "a and b", "a, b and c". */
function listed(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

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
      if (d.what === 'quote') return `Quote ${String(d.number)} emailed to the customer.`;
      if (d.what === 'quote_accepted') return `The team was emailed that quote ${String(d.number)} was accepted.`;
      return `Emailed to ${WHO[String(d.to)] ?? String(d.to)}.`;
    case 'email_failed':
      return `The email to ${WHO[String(d.to)] ?? String(d.to)} failed: ${String(d.reason ?? 'no reason given')}`;
    case 'email_not_sent':
      return `Not emailed to ${WHO[String(d.to)] ?? String(d.to)}: ${String(d.reason ?? 'no reason given')}`;
    case 'stage_changed':
      return `${who ?? 'Someone'} moved it from ${STAGE_NAMES[d.from as Stage] ?? String(d.from)} to ${STAGE_NAMES[d.to as Stage] ?? String(d.to)}.`;
    case 'note':
      return String(d.text ?? '');
    case 'quote_sent':
      return `${who ?? 'Someone'} sent quote ${String(d.number)} for ${money(Number(d.totalPence ?? 0), String(d.currency ?? 'GBP'))}.${
        typeof d.to === 'string' && d.to ? ` The job moved to ${STAGE_NAMES[d.to as Stage] ?? d.to}.` : ''
      }`;
    case 'quote_accepted':
      return `${String(d.name ?? 'The customer')} accepted quote ${String(d.number)} for ${money(Number(d.totalPence ?? 0), String(d.currency ?? 'GBP'))}.${
        typeof d.to === 'string' && d.to ? ` The job moved to ${STAGE_NAMES[d.to as Stage] ?? d.to}.` : ''
      }`;
    case 'quote_withdrawn':
      return `${who ?? 'Someone'} withdrew quote ${String(d.number)}.`;
    case 'revision_saved':
      return `${who ?? 'Someone'} saved revision ${String(d.revision)} of ${named(d.label) ?? 'the shower'}${typeof d.reason === 'string' && d.reason ? `: ${d.reason}` : '.'}`;
    case 'revision_checked':
      return `${who ?? 'Someone'} checked ${named(d.label) ?? 'the shower'} and is happy for it to be made.`;
    case 'revision_unchecked':
      return `${who ?? 'Someone'} took back the check on ${named(d.label) ?? 'the shower'}.`;
    case 'cut_override_set':
      return `${who ?? 'Someone'} set ${String(d.pane ?? 'a pane')} to be cut ${String(d.cut ?? '')}: ${String(d.widthDeductionMm)}mm off the width and ${String(
        d.heightDeductionMm
      )}mm off the height, instead of the standard ${String(d.standardWidthDeductionMm)}mm and ${String(d.standardHeightDeductionMm)}mm. Reason: ${String(d.reason ?? '')}`;
    case 'cut_override_cleared':
      return `${who ?? 'Someone'} cleared the override on ${String(d.pane ?? 'a pane')}. It is cut to the standard rule again, ${String(d.cut ?? '')}.`;
    case 'confirmation_link_made':
      return `${who ?? 'Someone'} made a link for the customer to confirm their order.`;
    case 'order_confirmed': {
      const address = deliveryAddressOf(d);
      return `${String(d.signed_name ?? 'The customer')} confirmed the order${d.terms_accepted === true ? ' and accepted the terms of sale' : ''}.${address ? ` Deliver to: ${address.join(', ')}.` : ''}${
        typeof d.preferred_delivery_date === 'string' ? ` Preferred delivery date: ${prettyDay(d.preferred_delivery_date)}.` : ''
      } Help unloading: ${
        d.can_unload === 'yes' ? 'yes' : 'no'
      }. Silicone: ${siliconeWords(d)}. Silicone tool: ${d.silicone_tool === 'yes' ? 'yes' : 'no'}.${
        typeof d.unload_note === 'string' && d.unload_note ? ` Delivery: ${d.unload_note}` : ''
      }${typeof d.comments === 'string' && d.comments ? ` Comments: ${d.comments}` : ''}`;
    }
    case 'checkout_started':
      return `The customer opened Stripe Checkout to pay ${money(Number(d.amountPence ?? 0), 'GBP')}.`;
    case 'payment_processing':
      return 'The customer paid by a method that takes time to clear. Waiting for Stripe.';
    case 'payment_received':
      return `Stripe says ${money(Number(d.amountTotalPence ?? d.amountPence ?? 0), 'GBP')} was paid${d.via === 'invoice' ? ' on the invoice' : ' by Checkout'}${
        Number(d.taxPence ?? 0) > 0 ? `, including ${money(Number(d.taxPence), 'GBP')} VAT` : ''
      }.`;
    case 'payment_duplicate':
      return 'This job was already paid. Refund the extra payment in Stripe.';
    case 'payment_failed':
      return `A payment failed${d.via === 'invoice' ? ' on the invoice; it stays open for the customer to try again' : '; the customer can try again from their link'}.`;
    case 'checkout_expired':
      return 'The customer left Stripe Checkout without paying. They can pay again from their link.';
    case 'invoice_created':
      return `${who ?? 'Someone'} raised a Stripe invoice for ${money(Number(d.amountPence ?? 0), 'GBP')}, due in ${String(d.days)} days${d.sent ? ', emailed by Stripe' : ''}.`;
    case 'invoice_sent':
      return 'Stripe finalised the invoice.';
    case 'invoice_voided':
      return 'The invoice was voided in Stripe.';
    case 'payment_refunded':
      return `${money(Number(d.refundedPence ?? 0), 'GBP')} refunded in Stripe${d.whole ? ', the whole payment' : ''}.`;
    case 'credit_note':
      return `A credit note for ${money(Number(d.creditPence ?? 0), 'GBP')} was issued in Stripe.`;
    case 'bank_transfer_received':
      return `A bank transfer of ${money(Number(d.amountPence ?? 0), 'GBP')} arrived on the customer's Stripe balance. Not paid until Stripe applies it to the invoice.`;
    case 'installation_changed': {
      const names: Record<string, string> = { address: 'installation address', postcode: 'site postcode', notes: 'installation comments' };
      const changed = Array.isArray(d.changed) ? d.changed.map((c) => names[String(c)] ?? String(c)) : [];
      return `${who ?? 'Someone'} changed the ${changed.length ? listed(changed) : 'installation details'}.`;
    }
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

/** A confirmation's delivery address, line by line, or null if it has none. */
function deliveryAddressOf(d: Record<string, unknown>): string[] | null {
  const a = d.delivery_address as Record<string, unknown> | undefined;
  if (!a || typeof a !== 'object') return null;
  const lines = [a.line1, a.line2, a.town, a.postcode].filter((l): l is string => typeof l === 'string' && l.trim().length > 0);
  return lines.length ? lines : null;
}

/** "2 clear, 1 white", "none", or for an older confirmation its one colour. */
function siliconeWords(d: Record<string, unknown>): string {
  const tubes = d.silicone_tubes as Record<string, unknown> | undefined;
  if (tubes && typeof tubes === 'object') {
    const parts = ['clear', 'translucent', 'white'].filter((c) => Number(tubes[c]) > 0).map((c) => `${Number(tubes[c])} ${c}`);
    return parts.length ? parts.join(', ') : 'none';
  }
  return d.silicone === 'yes' ? String(d.silicone_colour) : 'no';
}

/** "Mon 30 Nov 2026" for a YYYY-MM-DD date, read as the date it is wherever the browser is. */
function prettyDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
