/**
 * Billing: where the company stands, what it has used this month, the plans
 * it can choose, and the way to Stripe's own pages to pay and to manage what
 * is paid. SetOut never sees a card.
 *
 * Only shown where billing is switched on.
 */

import { useState } from 'react';
import { api, ApiError, signInAgain, SignedOut, type Billing as BillingData, type Me, type PlanOffer, type Standing } from '../lib/api';
import { money } from '../lib/format';
import { useLoad } from '../lib/load';
import { Problem, Section } from './parts';

const CARD = 'rounded-lg border border-rule bg-surface p-4';
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const day = (iso: string | null) => (iso ? DATE.format(new Date(iso)) : '');
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** Where the company stands, in a sentence. */
export function standingWords(standing: Standing): string {
  switch (standing.state) {
    case 'free':
      return 'This is a free account.';
    case 'none':
      return 'No plan has been chosen yet.';
    case 'trial':
      return standing.trialDaysLeft ? `Your free trial has ${days(standing.trialDaysLeft)} left.` : 'Your free trial ends today.';
    case 'active':
      return 'Your plan is paid up.';
    case 'past_due':
      return 'Your last payment did not go through. It will be tried again over the next few days.';
    case 'trial_ended':
      return 'Your free trial has ended.';
    case 'ended':
      return 'Your plan has ended.';
  }
}

const includes = (plan: PlanOffer) => (plan.enquiriesPerMonth === null ? 'Any number of designs a month' : `Up to ${plan.enquiriesPerMonth} designs a month`);

export function Billing({ me }: { me: Me }) {
  const billing = useLoad<BillingData>('billing', (signal) => api.billing(signal));
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const data = billing.data;
  const paid = new URLSearchParams(window.location.search).has('paid');

  /** Ask for one of Stripe's pages and go to it. */
  const leaveFor = async (what: string, ask: () => Promise<{ url: string }>) => {
    setBusy(what);
    setProblem(null);
    try {
      const { url } = await ask();
      window.location.assign(url);
    } catch (error) {
      if (error instanceof SignedOut) return signInAgain();
      setProblem(error instanceof ApiError ? error.message : 'That page could not be opened. Please try again.');
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
      <h1 className="text-2xl font-bold">Billing</h1>
      <p className="mt-1 text-quiet">{me.company?.name}’s plan and payments. Cards are taken and kept by Stripe, never by SetOut.</p>

      {billing.error && !data ? <Problem error={billing.error} retry={billing.reload} /> : null}
      {!data && !billing.error && (
        <p className="pt-6 text-quiet" role="status">
          Loading billing
        </p>
      )}

      {data && (
        <>
          {paid && (
            <p role="status" className="mt-4 rounded-lg border border-good/40 bg-good/10 p-4 text-sm">
              Thank you. Your card has been taken by Stripe. Your plan shows here as soon as Stripe confirms it, usually within a minute.{' '}
              <button type="button" onClick={billing.reload} className="font-semibold underline underline-offset-2">
                Check again
              </button>
            </p>
          )}

          <Section title="Where you stand">
            <div className={`${CARD} ${data.standing.locked || data.standing.state === 'past_due' ? 'border-warn/50' : ''}`}>
              <p className="font-semibold">{standingWords(data.standing)}</p>
              {data.standing.locked && (
                <p className="mt-1 text-sm text-quiet">
                  Your jobs and settings are kept, and designs your customers send still arrive. Choose a plan to open them again.
                </p>
              )}
              {data.plan && (
                <p className="mt-2 text-sm">
                  Plan: <span className="font-medium">{data.plan.name}</span>
                  {data.plan.monthlyPricePence > 0 && `, ${money(data.plan.monthlyPricePence, data.currency)} a month plus VAT`}. {includes(data.plan)}.
                </p>
              )}
              {data.subscription?.trialEndsAt && data.standing.state === 'trial' && <p className="mt-1 text-sm text-quiet">The trial ends on {day(data.subscription.trialEndsAt)}.</p>}
              {data.subscription?.currentPeriodEndsAt && data.standing.state === 'active' && (
                <p className="mt-1 text-sm text-quiet">
                  {data.subscription.cancelAtPeriodEnd ? 'It has been cancelled and ends on' : 'The next payment is on'} {day(data.subscription.currentPeriodEndsAt)}.
                </p>
              )}
              <p className="mt-2 text-sm text-quiet">
                This month: {data.usage.enquiries} {data.usage.enquiries === 1 ? 'design' : 'designs'} received
                {data.plan?.enquiriesPerMonth != null && ` of ${data.plan.enquiriesPerMonth}`}, {data.usage.quotesSent} {data.usage.quotesSent === 1 ? 'quote' : 'quotes'} sent.
              </p>
              {data.subscription?.withStripe && data.canChange && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => leaveFor('portal', api.billingPortal)}
                  className="mt-4 h-10 rounded-md border border-rule bg-surface px-4 font-medium disabled:opacity-50"
                >
                  {busy === 'portal' ? 'Opening Stripe' : 'Manage billing'}
                </button>
              )}
              {data.subscription?.withStripe && data.canChange && <p className="mt-2 text-xs text-quiet">Change the card or the plan, see invoices, or cancel, on Stripe’s own page.</p>}
            </div>
          </Section>

          {problem && (
            <p role="alert" className="mt-4 text-sm text-bad">
              {problem}
            </p>
          )}

          {data.standing.state !== 'free' && data.standing.state !== 'active' && data.standing.state !== 'past_due' && (
            <Section title="Choose a plan">
              {data.plans.length === 0 ? (
                <p className={`${CARD} text-sm text-quiet`}>There are no plans to choose yet. SetOut will be in touch before your trial ends.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {data.plans.map((plan) => (
                    <li key={plan.id} className={CARD}>
                      <h3 className="font-bold">{plan.name}</h3>
                      <p className="mt-1 text-2xl font-bold">
                        {money(plan.monthlyPricePence, data.currency)}
                        <span className="text-sm font-normal text-quiet"> a month plus VAT</span>
                      </p>
                      <p className="mt-1 text-sm text-quiet">{includes(plan)}</p>
                      {data.canChange ? (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => leaveFor(plan.id, () => api.checkout(plan.id))}
                          className="mt-4 h-10 w-full rounded-md bg-accent px-4 font-semibold text-accent-ink disabled:opacity-50"
                        >
                          {busy === plan.id ? 'Opening Stripe' : `Choose ${plan.name}`}
                        </button>
                      ) : (
                        <p className="mt-3 text-sm text-quiet">Only an owner can choose a plan.</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {data.standing.state === 'trial' && data.plans.length > 0 && (
                <p className="mt-3 text-sm text-quiet">Choosing a plan now does not cut your trial short. The first payment is taken when the trial ends, or straight away if it ends within two days.</p>
              )}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
