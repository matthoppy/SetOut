/**
 * The platform admin: SetOut's own staff looking after every company.
 *
 * Who may open this is a setting on the server. To anyone else the routes
 * behind it answer "not found", and so does this page. It shows each
 * company's account: who owns it, its designers, what it has used, its plan.
 * Nothing of its customers, jobs or designs.
 */

import { useState, type FormEvent } from 'react';
import { api, ApiError, signInAgain, SignedOut, type Platform as PlatformData, type PlatformCompany, type PlatformPlan } from '../lib/api';
import { money, when, whenExactly } from '../lib/format';
import { useLoad } from '../lib/load';
import { Problem, Section } from './parts';

const CARD = 'rounded-lg border border-rule bg-surface p-4';
const FIELD = 'h-10 w-full rounded-md border border-rule bg-ground px-3 text-base';
const BUTTON = 'h-9 rounded-md border border-rule bg-surface px-3 text-sm font-medium disabled:opacity-50';
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short' });
const monthName = (month: string) => MONTH.format(new Date(`${month}-01T00:00:00Z`));
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function failure(error: unknown, otherwise: string): string {
  if (error instanceof SignedOut) {
    signInAgain();
    return '';
  }
  return error instanceof ApiError ? error.message : otherwise;
}

const OPENED: Record<PlatformCompany['openedVia'], string> = { sign_up: 'Signed up', setout: 'Added by SetOut', seed: 'Added by script' };

/** A company's subscription in a few words. */
function subscriptionWords(company: PlatformCompany, billing: boolean): string {
  const s = company.subscription;
  if (!s) return company.plan === 'trial' ? (billing ? 'No trial started' : 'No trial running: billing is off') : '';
  const end = (iso: string | null) => (iso ? DATE.format(new Date(iso)) : 'no date');
  switch (s.status) {
    case 'trialing':
      return s.trialEndsAt && Date.parse(s.trialEndsAt) < Date.now() && !s.withStripe ? `Trial ended ${end(s.trialEndsAt)}` : `Trial to ${end(s.trialEndsAt)}${s.withStripe ? ', card taken' : ''}`;
    case 'active':
      return s.cancelAtPeriodEnd ? `Paying, cancelled from ${end(s.currentPeriodEndsAt)}` : `Paying, next ${end(s.currentPeriodEndsAt)}`;
    case 'past_due':
      return `Payment failed${s.paymentFailedAt ? ` ${end(s.paymentFailedAt)}` : ''}, Stripe is retrying`;
    case 'canceled':
      return 'Cancelled';
    case 'unpaid':
      return 'Unpaid: Stripe gave up';
    default:
      return s.status;
  }
}

export function Platform() {
  const platform = useLoad<PlatformData>('platform', (signal) => api.platform(signal));
  const [search, setSearch] = useState('');
  const data = platform.data;

  if (platform.error instanceof ApiError && platform.error.status === 404) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
        <h1 className="text-2xl font-bold">There is nothing here</h1>
        <p className="mt-2 text-quiet">This page could not be found.</p>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const companies = (data?.companies ?? []).filter(
    (c) => !q || [c.name, c.referencePrefix, c.plan, c.status, ...c.owners.map((o) => o.email), ...c.designers.flatMap((d) => d.websites)].some((text) => text.toLowerCase().includes(q))
  );

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-quiet">SetOut staff only</p>
      <h1 className="mt-1 text-2xl font-bold">Platform admin</h1>
      <p className="mt-1 text-quiet">Every company on SetOut. What you do to a company here is written in that company’s own record of changes.</p>

      {platform.error && !data ? <Problem error={platform.error} retry={platform.reload} /> : null}
      {!data && !platform.error && (
        <p className="pt-6 text-quiet" role="status">
          Loading every company
        </p>
      )}

      {data && (
        <>
          <Switches switches={data.switches} />

          <Section
            title={`Companies (${data.companies.length})`}
            aside={
              <label className="w-44">
                <span className="sr-only">Find a company</span>
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a company" className="h-9 w-full rounded-md border border-rule bg-surface px-3 text-sm" />
              </label>
            }
          >
            {companies.length === 0 ? (
              <p className={`${CARD} text-sm text-quiet`}>{q ? 'No company matches that.' : 'There are no companies yet.'}</p>
            ) : (
              <ul className="space-y-3">
                {companies.map((company) => (
                  <CompanyCard key={company.id} company={company} plans={data.plans} billing={data.switches.billing} onChanged={platform.reload} />
                ))}
              </ul>
            )}
          </Section>

          <AddCompany plans={data.plans} onAdded={platform.reload} />
          <Plans plans={data.plans} onSaved={platform.reload} />
        </>
      )}
    </div>
  );
}

function Switches({ switches }: { switches: PlatformData['switches'] }) {
  const items: [string, string, boolean][] = [
    ['Sign-ups', switches.signUps ? 'Open' : 'Closed', switches.signUps],
    ['Billing', switches.billing ? 'On' : 'Off', switches.billing],
    ['Stripe key', switches.stripeKey ? 'Set' : 'Not set', switches.stripeKey],
    ['Stripe webhook secret', switches.stripeWebhookSecret ? 'Set' : 'Not set', switches.stripeWebhookSecret],
    ['Bot check', switches.botCheck ? 'Set up' : 'Not set up', switches.botCheck],
    ['Mail', switches.mail ? 'Set up' : 'Not set up', switches.mail],
  ];
  return (
    <Section title={`How ${switches.environment} is switched`}>
      <dl className={`${CARD} grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3`}>
        {items.map(([name, value, on]) => (
          <div key={name}>
            <dt className="text-xs text-quiet">{name}</dt>
            <dd className={`font-semibold ${on ? 'text-good' : 'text-quiet'}`}>{value}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs text-quiet">Trial</dt>
          <dd className="font-semibold">{switches.trialDays} days</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-quiet">These are set on the server, in wrangler.jsonc and as secrets. docs/deploying.md says how.</p>
    </Section>
  );
}

function CompanyCard({ company, plans, billing, onChanged }: { company: PlatformCompany; plans: PlatformPlan[]; billing: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const off = company.status !== 'active';
  const subscription = subscriptionWords(company, billing);

  const act = async (send: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      await send();
      setAsking(false);
      setReason('');
      onChanged();
    } catch (error) {
      setProblem(failure(error, 'That could not be done. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`${CARD} ${off ? 'border-bad/40' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="min-w-0 font-bold">
          {company.name} <span className="font-normal text-quiet">{company.referencePrefix}</span>
        </h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${off ? 'bg-bad/15 text-bad' : 'bg-good/15 text-good'}`}>{off ? 'Switched off' : 'Active'}</span>
      </div>
      <p className="mt-0.5 text-xs text-quiet" title={whenExactly(company.createdAt)}>
        {OPENED[company.openedVia]} {when(company.createdAt)}
        {company.setUpDone === false && ' · set-up not finished'}
      </p>

      <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-quiet">Owners, of {company.people} {company.people === 1 ? 'person' : 'people'}</dt>
          <dd>
            {company.owners.length === 0
              ? 'No owner'
              : company.owners.map((owner) => (
                  <span key={owner.email} className="block">
                    <span className="break-all">{owner.email}</span>{' '}
                    <span className="whitespace-nowrap text-xs text-quiet">{owner.lastSignedInAt ? `signed in ${when(owner.lastSignedInAt)}` : "never signed in"}</span>
                  </span>
                ))}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-quiet">Designs received · quotes sent</dt>
          <dd>
            {company.usage.map((u) => (
              <span key={u.month} className="mr-3 inline-block">
                {monthName(u.month)}: <span className="font-semibold">{u.enquiries}</span> · {u.quotesSent}
              </span>
            ))}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-quiet">Designers</dt>
          <dd>
            {company.designers.length === 0
              ? 'None'
              : company.designers.map((d) => (
                  <span key={d.id} className="block break-all">
                    <span className="font-mono text-[13px]">{d.siteKey}</span>
                    <span className="text-quiet"> on {d.websites.length ? d.websites.join(', ') : 'no website yet'}</span>
                    {d.status !== 'active' && <span className="text-bad"> (off)</span>}
                  </span>
                ))}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-quiet">Plan</span>
          <select
            value={company.plan}
            disabled={busy}
            onChange={(e) => void act(() => api.changeCompany(company.id, { plan: e.target.value }))}
            className="h-9 rounded-md border border-rule bg-ground px-2 text-sm"
          >
            {!plans.some((p) => p.id === company.plan) && company.plan !== 'trial' && <option value={company.plan}>{company.plan}</option>}
            <option value="trial">Trial</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        {subscription && <span className="text-sm text-quiet">{subscription}</span>}
        <span className="flex-1" />
        {billing && !company.subscription?.withStripe && company.plan !== 'free' && (
          <button type="button" disabled={busy} onClick={() => void act(() => api.startTrial(company.id))} className={BUTTON}>
            Start its trial today
          </button>
        )}
        {off ? (
          <button type="button" disabled={busy} onClick={() => void act(() => api.changeCompany(company.id, { status: 'active' }))} className={BUTTON}>
            Switch back on
          </button>
        ) : (
          !asking && (
            <button type="button" disabled={busy} onClick={() => setAsking(true)} className={`${BUTTON} text-bad`}>
              Switch off
            </button>
          )
        )}
      </div>

      {asking && !off && (
        <form
          className="mt-3 rounded-md border border-bad/40 bg-bad/10 p-3 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void act(() => api.changeCompany(company.id, { status: 'suspended', reason }));
          }}
        >
          <p className="font-semibold">Switch {company.name} off?</p>
          <p className="mt-1">Its designer stops showing on its website, its staff are signed out and cannot sign in, and its customers’ quote links stop opening. Nothing is deleted.</p>
          <label className="mt-2 block">
            <span className="text-xs text-quiet">Why, for the record</span>
            <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className={`${FIELD} mt-1`} />
          </label>
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={busy} className="h-9 rounded-md bg-bad px-3 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? 'Switching off' : 'Switch it off'}
            </button>
            <button type="button" disabled={busy} onClick={() => setAsking(false)} className={BUTTON}>
              Leave it on
            </button>
          </div>
        </form>
      )}
      {problem && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {problem}
        </p>
      )}
    </li>
  );
}

function AddCompany({ plans, onAdded }: { plans: PlatformPlan[]; onAdded: () => void }) {
  const [form, setForm] = useState({ name: '', ownerEmail: '', ownerName: '', plan: 'free' });
  const [state, setState] = useState<{ busy: boolean; error: string | null; added: string | null }>({ busy: false, error: null, added: null });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setState({ busy: true, error: null, added: null });
    try {
      const answer = await api.addCompany(form);
      setState({
        busy: false,
        error: null,
        added: `${form.name} is open. ${answer.emailed ? `${form.ownerEmail} has been emailed.` : `Tell ${form.ownerEmail} to ask for a link on the sign-in page: no email was sent.`}`,
      });
      setForm({ name: '', ownerEmail: '', ownerName: '', plan: 'free' });
      onAdded();
    } catch (error) {
      setState({ busy: false, error: failure(error, 'The company could not be added. Please try again.'), added: null });
    }
  };

  return (
    <Section title="Add a company">
      <form onSubmit={submit} className={CARD}>
        <p className="mb-3 text-sm text-quiet">Opens a company with its first designer and its owner, as signing up does. The owner signs in by emailed link and is taken through setting up.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Company’s name
            <input required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${FIELD} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium">
            Plan
            <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className={`${FIELD} mt-1 font-normal`}>
              <option value="trial">Trial</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Owner’s email address
            <input required type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} className={`${FIELD} mt-1 font-normal`} />
          </label>
          <label className="text-sm font-medium">
            Owner’s name
            <input maxLength={100} value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} className={`${FIELD} mt-1 font-normal`} />
          </label>
        </div>
        {state.error && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {state.error}
          </p>
        )}
        {state.added && (
          <p role="status" className="mt-3 text-sm text-good">
            {state.added}
          </p>
        )}
        <button type="submit" disabled={state.busy} className="mt-4 h-10 rounded-md bg-accent px-4 font-semibold text-accent-ink disabled:opacity-50">
          {state.busy ? 'Adding' : 'Add the company'}
        </button>
      </form>
    </Section>
  );
}

interface PlanForm {
  id: string;
  name: string;
  price: string;
  enquiries: string;
  stripePriceId: string;
  offered: boolean;
}

const formOf = (plan: PlatformPlan): PlanForm => ({
  id: plan.id,
  name: plan.name,
  price: (plan.monthlyPricePence / 100).toFixed(2),
  enquiries: plan.enquiriesPerMonth === null ? '' : String(plan.enquiriesPerMonth),
  stripePriceId: plan.stripePriceId ?? '',
  offered: plan.offered,
});
const NEW_PLAN: PlanForm = { id: '', name: '', price: '', enquiries: '', stripePriceId: '', offered: false };

function Plans({ plans, onSaved }: { plans: PlatformPlan[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<PlanForm | null>(null);
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  // Whether the plan being edited is a new one, whose id can still be typed.
  const [adding, setAdding] = useState(false);
  const existing = editing && !adding ? plans.find((p) => p.id === editing.id) : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const pence = Math.round(Number(editing.price) * 100);
    if (!Number.isFinite(pence) || pence < 0) return setState({ busy: false, error: 'The price must be an amount in pounds, such as 49 or 49.50.' });
    const enquiries = editing.enquiries.trim() === '' ? null : Number(editing.enquiries);
    if (enquiries !== null && (!Number.isInteger(enquiries) || enquiries < 0)) return setState({ busy: false, error: 'Designs a month must be a whole number, or empty for no limit.' });
    setState({ busy: true, error: null });
    try {
      await api.savePlan({
        id: editing.id.trim(),
        name: editing.name,
        monthlyPricePence: pence,
        enquiriesPerMonth: enquiries,
        stripePriceId: editing.stripePriceId.trim() || null,
        offered: editing.offered,
        position: existing?.position ?? plans.length,
      });
      setState({ busy: false, error: null });
      setEditing(null);
      onSaved();
    } catch (error) {
      setState({ busy: false, error: failure(error, 'The plan could not be saved. Please try again.') });
    }
  };

  return (
    <Section title="Plans">
      <div className={CARD}>
        <p className="mb-3 text-sm text-quiet">
          What SetOut charges. A plan is charged as a price made in Stripe, whose id starts <span className="font-mono text-[13px]">price_</span>. Owners can choose a plan only once it
          has one and is offered.
        </p>
        <ul className="divide-y divide-rule text-sm">
          {plans.map((plan) => (
            <li key={plan.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="font-semibold">{plan.name}</span> <span className="font-mono text-[13px] text-quiet">{plan.id}</span>
                <span className="block text-quiet">
                  {plan.monthlyPricePence ? `${money(plan.monthlyPricePence)} a month` : 'No charge'} ·{' '}
                  {plan.enquiriesPerMonth === null ? 'any number of designs' : `${plan.enquiriesPerMonth} designs a month`} ·{' '}
                  {plan.offered ? 'offered to owners' : plan.stripePriceId ? 'not offered' : 'given by SetOut only'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setEditing(formOf(plan));
                }}
                className={BUTTON}
              >
                Change
              </button>
            </li>
          ))}
        </ul>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditing({ ...NEW_PLAN });
            }}
            className={`${BUTTON} mt-3`}
          >
            Add a plan
          </button>
        )}

        {editing && (
          <form onSubmit={submit} className="mt-4 border-t border-rule pt-4">
            <h3 className="font-semibold">{existing ? `Change ${existing.name}` : 'A new plan'}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Id
                <input
                  required
                  disabled={!adding}
                  pattern="[a-z][a-z0-9\-]{1,30}"
                  placeholder="standard"
                  value={editing.id}
                  onChange={(e) => setEditing({ ...editing, id: e.target.value })}
                  className={`${FIELD} mt-1 font-mono font-normal disabled:opacity-60`}
                />
                <span className="mt-1 block text-xs font-normal text-quiet">Lower-case, never changed once a company is on it.</span>
              </label>
              <label className="text-sm font-medium">
                Name
                <input required maxLength={60} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={`${FIELD} mt-1 font-normal`} />
              </label>
              <label className="text-sm font-medium">
                Price a month, in pounds, before VAT
                <input required inputMode="decimal" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} className={`${FIELD} mt-1 font-normal`} />
                <span className="mt-1 block text-xs font-normal text-quiet">Shown to owners. What is charged is the Stripe price.</span>
              </label>
              <label className="text-sm font-medium">
                Designs a month
                <input inputMode="numeric" placeholder="No limit" value={editing.enquiries} onChange={(e) => setEditing({ ...editing, enquiries: e.target.value })} className={`${FIELD} mt-1 font-normal`} />
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Stripe price id
                <input
                  placeholder="price_…"
                  value={editing.stripePriceId}
                  onChange={(e) => setEditing({ ...editing, stripePriceId: e.target.value })}
                  className={`${FIELD} mt-1 font-mono font-normal`}
                />
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={editing.offered} onChange={(e) => setEditing({ ...editing, offered: e.target.checked })} className="h-4 w-4" />
                Offer it to owners on the billing page
              </label>
            </div>
            {state.error && (
              <p role="alert" className="mt-3 text-sm text-bad">
                {state.error}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={state.busy} className="h-10 rounded-md bg-accent px-4 font-semibold text-accent-ink disabled:opacity-50">
                {state.busy ? 'Saving' : 'Save the plan'}
              </button>
              <button
                type="button"
                disabled={state.busy}
                onClick={() => {
                  setEditing(null);
                  setState({ busy: false, error: null });
                }}
                className="h-10 rounded-md border border-rule bg-surface px-4 font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </Section>
  );
}
