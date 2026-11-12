# Sign-up, set-up, platform admin and billing: the plan

Step 4 of the roadmap, as Matt asked for it on 12 November 2026: "self-serve sign-up and billing". Written before any of it was built. Where the code and this page disagree once it is built, `docs/architecture.md` is the record and this page is the history.

Today a company exists only when someone at SetOut runs `scripts/seed-company.mjs` and `scripts/add-member.mjs`. After this step a shower company can make its own account, be walked through its settings, and paste the designer into its website without speaking to anyone. SetOut's own staff can see every company and switch one off. Billing is written and tested but switched off, because the prices, the trial and the Stripe account are Matt's to decide.

Nothing here changes how an existing company, sign-in or the designer behaves.

## What is built, in one table

| Part | Where | Switch |
| --- | --- | --- |
| Sign-up and its emailed confirmation | Workspace page `/sign-up`, routes under `/api/workspace/sign-up` | `SIGNUPS`: `open` or `closed`. Open locally and on staging, closed in production until Matt says |
| Making a company | One function in the API, `openCompany`, used by sign-up and by the platform admin | None |
| Set-up wizard | Workspace page `/set-up` | None. Owners only |
| Platform admin | Workspace page `/platform`, routes under `/api/platform` | `PLATFORM_ADMINS`, a secret. Empty means nobody |
| Billing | Workspace page `/billing`, routes under `/api/workspace/billing`, Stripe's webhook at `/api/stripe/webhook` | `BILLING`: `on` or `off`. Off everywhere |

Sign-up lives in the workspace app and the API, on the workspace's address. The public website, which another branch is building, only needs to link to `https://app.setoutglass.com/sign-up`.

## Sign-up

### Who can sign up

Anyone with an email address they can open, when `SIGNUPS` is `open`. They give three things: the company's name, their own name and their email address. A person who already has an account can sign up again to make a second company: a person is one user whatever companies they belong to, and that is already how SetOut works.

With `SIGNUPS` closed, the page says sign-ups are not open yet and the route refuses.

### The flow

1. The person fills in the form at `/sign-up` and passes the bot check.
2. `POST /api/workspace/sign-up` checks everything, counts the request against the limits below, and keeps a pending sign-up: the three things typed, the hash of a long random token, and when it runs out. No company and no user are made yet.
3. They are emailed a link, `/sign-up?token=st_…`. The answer on the page is the same whoever the address belongs to, so it never says who has an account.
4. The link opens the page with a button. Pressing it, not opening the link, is what uses it, because mail scanners open links. This is how sign-in already works.
5. `POST /api/workspace/sign-up/verify` uses the link once and makes everything in one go (below). The browser is signed in as the new owner and sent to the set-up wizard.

A link works once, for 24 hours. Only its hash is stored.

### Checks

- The company's name: one line, up to 100 characters, the same rule as the settings page.
- The person's name: one line, up to 100 characters.
- The email address: the same rule as sign-in.
- A hidden field no person fills. A script that fills it is told it worked and nothing is kept, as the designer does.
- The bot check, Cloudflare Turnstile, the same widget the designer uses. Sign-up is stricter than the designer: where the check is set up, a missing or failed token is refused, because nobody loses ten minutes of measuring by being asked to try again. Where it is not set up (a developer's machine), sign-up works without it.
- The request must come from the workspace's own page, as every change in the workspace must.

### Limits

Sign-up sends email to an address a stranger typed, so it is limited three ways, counted from the pending sign-ups themselves:

| Limit | How many |
| --- | --- |
| Links to one address | 3 an hour |
| Sign-ups from one network address | 10 an hour. Only a hash of the address is kept |
| Sign-ups in all | 200 a day |

Pending sign-ups a day past their time are deleted when the next one is made.

## What is made

When the link is used, one function, `openCompany` in `apps/api/src/db/onboarding.ts`, makes all of this in a single database batch, so a company is never left half made:

| Thing | What it is |
| --- | --- |
| The company | Its name, a reference prefix worked out from the name (Brennan Glass gives `BG`; a prefix already taken gets a number, `BG2`), plan `trial` |
| Its owner | The person's user, made if they have none, and a membership as owner |
| Its first designer | Named "Website", with a new site key: `pk_live_…` in production, `pk_test_…` anywhere else. No websites may show it until the owner adds one in the wizard |
| The designer's settings | SetOut's own defaults: four finishes, two handles, 10mm glass, the standard hinges. The owner's address as the one emailed. The bot check's site key, so its enquiries are checked from the first day |
| The making rules | SetOut's defaults. A company has no changes of its own until the making rules join the settings page |
| The audit log | "Company opened", with who and how (sign-up, or SetOut) |
| A trial | Only when billing is on: a subscription record, trialing, ending after `TRIAL_DAYS` |

This is what the two seed scripts do between them. The platform admin's "Add a company" calls the same function, which is how Brennan Glass or any free account is added from now on. The scripts stay for one job only: putting the first company into an empty database, before anyone can sign in.

## The set-up wizard

At `/set-up`, for owners, straight after sign-up and from the settings page at any time. It is the settings page taken one part at a time, with the same forms and the same server checks, so there is one set of rules. Each step saves on its own and can be skipped.

1. **Your company.** Its name.
2. **Colours and logo.** The colours of the designer and of quotes, and a link to a logo.
3. **Finishes.** What customers choose from, with SetOut's four to start from.
4. **Handles.**
5. **Glass.** Which thicknesses customers may choose.
6. **Hinges.** Which hinge styles are offered.
7. **Who is emailed.** One to five addresses for new designs.
8. **Your website.** The websites the designer may appear on. New: until now only SetOut could set these. An owner may list up to ten, each an `https://` address with no path. A browser refuses to show the designer anywhere else. Every change goes in the audit log.
9. **Add it to your website.** The two lines of embed code with the company's own site key, a button to copy them, where to paste them (WordPress, Wix, Squarespace, or plain HTML), and a link that opens the designer as customers will see it.

The wizard remembers that it has been finished. Until then an owner who signs in is taken to it once, and the inbox shows one line offering to carry on. Companies that existed before this step are never sent to it.

## The platform admin

For SetOut's own staff, at `/platform` on the workspace's address.

**Who they are.** A list of email addresses in `PLATFORM_ADMINS`, a secret on the Worker. It is read on every request. It is not in the database, so no company, owner or bug in a company's routes can add to it. A platform admin signs in the way everyone does, by emailed link, so they must also be on some company's team: Matt is, on Custom Showers.

**What they see.** Every company: its name, when it was opened and how, its status, its plan, its owners' addresses, its designers and whether each has a website listed, how many designs it received and quotes it sent this month and last, and, when billing is on, its subscription. Nothing about a company's customers, jobs or designs.

**What they can do.**

- Add a company with its first owner, on any plan, such as `free`.
- Switch a company off, and back on. Switched off, its designer stops loading, its staff are signed out and cannot sign in, and its quote links stop opening. That is how SetOut already treats a company whose status is not `active`. Nothing is deleted.
- Change a company's plan.
- Start a company's trial, for one that signed up while billing was off.
- Add and change plans: name, monthly price, designs included, and the Stripe price it is charged as.

Everything a platform admin does to a company is written to that company's audit log, with who did it.

## Billing

Written against Stripe's API with no library, tested with stand-ins for Stripe, and off in every environment. With `BILLING` off there are no billing pages, the billing routes answer "not found", the webhook answers "not found", and nothing ever calls Stripe.

### Records

- **Plans** are rows SetOut keeps, not code: an id, a name, a monthly price in pence, how many designs a month it includes, and Stripe's price id. `free` exists from the start: no charge, by arrangement, set by SetOut. Matt adds the paid ones in the platform admin once he has decided them.
- **A subscription** is one row per company: the plan, its status, Stripe's customer and subscription ids, when the trial ends, when the paid period ends, whether it is set to stop, and when a payment last failed.
- **Stripe's events** are remembered by id, so one delivered twice is handled once.

Usage has been counted from the first day: designs received and quotes sent, per company per month.

### The trial

A company that signs up gets a trial of `TRIAL_DAYS` days, 14 unless set. No card is asked for at sign-up. The billing page and a line at the top of the workspace say how many days are left.

### Paying

The owner chooses a plan on the billing page. SetOut asks Stripe for a Checkout session for that plan's price and sends the browser to Stripe, which takes the card. Any trial days left are carried over, so nobody pays early for adding a card early. SetOut never sees a card number.

Afterwards the owner manages everything on Stripe's own billing portal, opened from the billing page: change the card, change plan, see invoices, cancel.

### Webhooks

Stripe tells SetOut what happened at `/api/stripe/webhook`. Each message's signature is checked against `STRIPE_WEBHOOK_SECRET`, with Stripe's five-minute limit on its age, before a word of it is read. One that does not verify is refused.

| Stripe says | SetOut does |
| --- | --- |
| `checkout.session.completed` | Ties the company to its Stripe customer and subscription |
| `customer.subscription.created`, `.updated` | Records the status, plan, trial end, period end and whether it is set to stop |
| `customer.subscription.deleted` | Records that it has ended |
| `invoice.payment_failed` | Records when, and emails the owners |
| `invoice.paid` | Clears the failed payment |

Which company a message is about is worked out from the Stripe customer SetOut recorded, never from anything else in it.

### When a payment fails, and when a trial ends

Proposed, for Matt to confirm:

- **A payment fails.** Stripe tries the card again over the following days, on the schedule set in Stripe. Meanwhile nothing is locked. The owners are emailed and the workspace shows a line asking them to update the card.
- **Stripe gives up, the subscription is cancelled, or a trial ends with no plan chosen.** The workspace locks: staff can sign in and reach the billing page, and nothing else, until a plan is paid for. **The designer keeps working** and designs keep arriving and being emailed, because the person hurt by switching it off is a homeowner who has just measured their bathroom. Nothing is deleted.
- **Switching a company off altogether**, designer included, stays a decision a person at SetOut makes, in the platform admin.

Companies on `free` are never locked.

### Turning billing on

In order: Matt answers the questions below; products and prices are made in Stripe; the plans are added in the platform admin with their Stripe price ids; `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set as secrets, on staging first with Stripe's test mode; the webhook address is added in Stripe; `BILLING` is set to `on` for staging; it is tried end to end with a test card; then the same for production. `docs/deploying.md` has the steps.

## New settings and secrets

| Name | Kind | What it is |
| --- | --- | --- |
| `SIGNUPS` | Setting in `wrangler.jsonc` | `open` or `closed` |
| `BILLING` | Setting in `wrangler.jsonc` | `on` or `off` |
| `TRIAL_DAYS` | Setting in `wrangler.jsonc` | How long a trial lasts. 14 |
| `PLATFORM_ADMINS` | Secret | The email addresses of SetOut's own staff, separated by commas |
| `TURNSTILE_SITE_KEY` | Secret | The bot check widget's public key, for the sign-up form and for each new company's designer. Not secret, but kept out of the repository with the others |
| `STRIPE_SECRET_KEY` | Secret | Stripe's API key. Only needed with billing on |
| `STRIPE_WEBHOOK_SECRET` | Secret | Checks that a webhook came from Stripe. Only needed with billing on |

## The database

One migration, `0007_signup_billing.sql`. Another branch is adding the public website's enquiry form with a migration of its own, so this number may need to change when the two are merged. It only adds tables, so the code before it keeps working.

| Table | Belongs to | Holds |
| --- | --- | --- |
| `signups` | The platform | Pending sign-ups: what was typed, the token's hash, when it runs out |
| `plans` | The platform | The plans SetOut offers |
| `subscriptions` | A company | Its plan, status and Stripe ids |
| `stripe_events` | The platform | The ids of Stripe's messages already handled |

`subscriptions` is a company table like any other: keyed by the company first, reached through the company-scoped data layer, and covered by the tests that try to read one company's rows from another. One index does not start with the company, the Stripe customer id, because that is how a webhook comes to belong to a company, as a site key is for the designer.

## Keeping companies apart

Sign-up adds a third way for a request to come to belong to a company, after the site key and the sign-in: a sign-up link, which belongs to the company it makes and no other. Tests cover:

- A company made by sign-up cannot see, change or delete another company's jobs, customers, settings, team or files, through the workspace's routes or the data layer.
- Nor can an older company reach the new one's.
- Someone who is not a platform admin gets nothing from the platform's routes, owner or not, and no request can make them one.
- A webhook with a wrong, missing or old signature changes nothing, and one about a customer SetOut does not know changes nothing.
- With billing off, no route calls Stripe.

## Before it goes live

1. Merge with the public website's branch and renumber the migration if needed.
2. Set `PLATFORM_ADMINS` and `TURNSTILE_SITE_KEY` on staging and production.
3. Try sign-up on staging with a real inbox.
4. Decide when to set `SIGNUPS` to `open` in production. Until billing is on, anyone who signs up there uses SetOut for nothing.
5. Billing: the list under "Turning billing on".

## Questions only Matt can answer

1. **Prices.** What does SetOut cost a month? One plan or several?
2. **What a plan includes.** The roadmap says plans are counted in designs received. How many a month on each plan, and what happens when a company goes over: nothing, a charge for each extra one, or a nudge to move up a plan?
3. **The trial.** Is 14 days right? Should a card be asked for at the start, or only when the trial ends, which is what is built?
4. **When a trial ends unpaid, or a payment keeps failing.** Is locking the workspace but leaving the designer running the right call? How many days of failed payments before locking?
5. **Free accounts.** Custom Showers and Brennan Glass are free. Is anyone else, and can a company choose a free plan itself or only be given one?
6. **Stripe.** Which Stripe account does SetOut take payment through: a new one for SetOut, or Custom Showers'? It needs to be in the name of whoever is selling the software. Is SetOut registered for VAT, and should Stripe add VAT to invoices?
7. **Who can sign up.** Should production sign-ups open as soon as this is deployed, or wait for billing? And is SetOut for UK companies only for now? Prices are in pounds and VAT starts at 20%.
8. **Terms.** Sign-up needs terms of service and a privacy notice to link to, and a data processing agreement, since SetOut holds homeowners' details on each company's behalf. Who is writing them?
9. **SetOut's staff.** Whose email addresses go in the platform admin list besides Matt's?
10. **The address emails come from.** Sign-up emails are sent from `hello@setoutglass.com` as "SetOut". Is that the right address for people to reply to?
