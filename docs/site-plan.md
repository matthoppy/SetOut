# The public site: plan

Matt, 12 November 2026: "set up the rest of the website", meaning SetOut's own site at `setoutglass.com`: what it does, pricing, and sign-up for shower companies.

This is the plan the site was built to. Where the site and this page disagree, one of them is wrong. The questions only Matt can answer are at the end.

## What it is for

A frameless shower company that has heard of SetOut lands here. In a minute they should know what SetOut is, see that it is real, and be able to ask to start. Nothing else.

It is not the workspace, not the designer and not a help centre. It links to the workspace's sign-in for companies already using SetOut.

## The pages

Five pages and a not-found page. Each is plain HTML, written once at build time.

| Page | Address | What it says |
| --- | --- | --- |
| Home | `/` | One sentence on what SetOut is. The three parts: the designer on the company's website, the workspace, and the paperwork. That every size comes from one design, worked out again on the server. One line on where it came from (Custom Showers, see the questions). A button to get started |
| How it works | `/how-it-works/` | The same story in order, from the customer's side then the company's. The designer: layouts, measuring cards with pictures, a laser or a tape, a dimensioned drawing, photos, carrying on on a phone. The workspace: the inbox, the job page, staff sign-off, editing as revisions, team and roles, settings for finishes, handles, glass and hinges. Quotes: written from the showers, priced, emailed, accepted online. The paperwork: making sheets, glass orders, installation sheets. What SetOut is not |
| Pricing | `/pricing/` | SetOut is a subscription. What a subscription includes. The amounts are a marked placeholder, because none is decided. A button to get started |
| Get started | `/get-started/` | Says honestly that companies are set up by hand for now. The form. What happens next |
| Privacy | `/privacy/` | What this site collects (only what the form is sent), where it is kept, who it is sent through, that there are no tracking cookies and no analytics. What SetOut holds for the companies that use it, and who is responsible for that. Marked placeholders for the legal name, contact address and how long an enquiry is kept |
| Not found | any other path | Says the page is not there and links home. Answers 404 |

Every page has the same header (SetOut, the four links, Sign in, Get started) and footer (the links again, Privacy).

## What it says, and what it does not

Plain British English, short sentences, concrete and true, as in `docs/architecture.md` and the workspace's own wording.

- Only things SetOut does today. Self-serve sign-up and card billing are not built, so the site never says "sign up" or "start a trial". It says "get started" and explains that we set each company up.
- No statistics, testimonials, customer logos or comparisons. None exist.
- No prices. See Pricing below.
- One company is named: Custom Showers, as the company SetOut was built in, with a link to its designer. That line needs Matt's OK (question 2). No other company is named anywhere on the site.
- CRL is named where it is a fact about the product: the hinge ranges, the cut-outs taken from CRL's drawings, the catalogue numbers on the installation sheet. SetOut does not claim any connection with CRL beyond using its published parts (question 8).

## Pictures

Real screenshots of SetOut, made by running it locally with a made-up company, "Demo Showers", and made-up customers. The design in them was sent through the designer as a customer would send it. Nothing is mocked up to look like a screenshot. The quote in two of them has made-up prices, which are a shower company's prices to its customer and not SetOut's, and the caption says so (question 12). Every picture and every placeholder is listed in `apps/site/README.md`.

## Pricing

No amount is decided, so none is shown or hinted at. The page says what a subscription includes:

- the designer on the company's own website, in its colours, with its finishes, handles, glass and hinges
- the workspace for the whole team, with owners and staff
- quotes written from the showers and accepted online
- making sheets, glass orders and installation sheets
- storage of drawings and photos, in the EU
- set-up by us

Where the price would be, there is a box that reads "Price to be confirmed". The architecture's roadmap says plans will be "counted in enquiries" with a 14-day trial; neither is built, so neither is promised. They are question 1.

## Get started

Self-serve sign-up is roadmap step 4. Until then a company asks, and we set it up with the seed script.

The form asks for: company, your name, email, phone, website, roughly how many showers a month (a short list of bands, or "not sure"), and a message. Company, name and email are needed; the rest are optional.

It posts JSON to a new route, `POST /api/site/enquiries`, which:

1. Refuses anything not sent from the site's own page (the `Origin` header must be the address the request arrived on), as the workspace's routes do.
2. Checks every field for shape and size, in the style of `lib/enquiry.ts`, and answers 400 with a sentence a person can read.
3. Drops anything that filled the hidden field, answering as if it worked, as the designer's route does.
4. Checks the Turnstile token with the existing `checkBot`. A wrong token is refused. A missing one is accepted and marked, as for a design (question 6).
5. Limits how much can arrive, counted in the database as sign-in links are: three from one email address in a day, and a hundred from everyone in a day. Past either it answers 429 with a sentence.
6. Saves the enquiry to a new platform table, `site_enquiries` (migration `0007`). It belongs to no company, like `users`.
7. Answers the person, then emails the enquiry through Resend, from `EMAIL_FROM`, to the address in a new variable, `SITE_NOTIFY_EMAIL`, with the person's address as reply-to. What happened to the email is written on the row: sent, failed with the reason, or not set up.

Nothing is emailed to the person who filled the form in. A public form that emails whatever address is typed into it is a way to send junk through SetOut (question 7).

The form works with a keyboard and a screen reader: real labels, errors written beside the form and announced, the answer announced when it arrives. It needs JavaScript, and says so when there is none. The form finds the bot check's public key by asking `GET /api/site/config`, so the pages themselves stay the same in every environment.

## How it is built

A new workspace package, `apps/site`. It has no framework and no dependencies of its own: `build.mjs` is a short Node script that writes each page from a template into `dist/site/site/`, beside the workspace and the designer, with one stylesheet and one small script for the form. Their file names carry a hash of their contents, so they can be cached for good. The build lists every placeholder still on a page, and its tests fail if a page names a price, promises a trial, or links somewhere that is not there.

- **Look.** The stylesheet uses the workspace's own colour tokens (`--ground`, `--surface`, `--ink`, `--quiet`, `--rule`, `--accent` and the rest), light and dark from the device, and the same system type. The build reads the tokens from `apps/workspace/src/index.css`, so the two cannot drift.
- **Links are relative.** Every link and file reference in a page is relative to that page, so the same files work under `/site/` and at the root of `setoutglass.com`.
- **Mobile first, accessible.** One column on a phone. A skip link, landmarks, one `h1` a page, visible focus, text that meets contrast in both themes, pictures with their size set so nothing jumps, and nothing that moves.
- **No tracking.** No cookies, no analytics, no fonts or scripts from anywhere else. The one outside script is Cloudflare's bot check, loaded on the get-started page only.
- **Search engines.** Each page has its own title, description and canonical address on `setoutglass.com`, with `robots.txt` and `sitemap.xml`. Anywhere that is not the real address (staging, a developer's machine) every page is sent with `X-Robots-Tag: noindex`.

The root `npm run build` builds the workspace, then the designer, then the site. The site's build only ever empties its own folder.

## How it is served

The same Worker. `apps/api/src/site.ts` learns a third kind of address beside the designer's and the workspace's.

| Where | The site is at | Set by |
| --- | --- | --- |
| A developer's machine, and staging's workers.dev name | `/site/` | Nothing. Any address that serves both apps by path also serves the site under `/site/` |
| `setoutglass.com` | `/` | `SITE_HOST`, a new variable, already set to `setoutglass.com` for production. It does nothing until the address is routed to the Worker |
| `www.setoutglass.com` | Redirects to `setoutglass.com`, same path | The same variable |

So switching the real address on is a change to `routes` in `wrangler.jsonc` and nothing else. The exact change is in `docs/deploying.md`. It has not been made.

On the site's address the Worker serves only the site and `/api/site/*`. The designer's address and the workspace's address never serve the site or its route. Pages are sent so that nobody can frame them, with a content security policy that allows the site's own files and Cloudflare's bot check and nothing else.

A page the site does not have gets the not-found page with a 404, never the workspace.

### New settings

| Name | Kind | What it is | Without it |
| --- | --- | --- | --- |
| `SITE_HOST` | Variable | The site's address, without `www` | The site is only at `/site/` |
| `SITE_NOTIFY_EMAIL` | Variable | Where a get-started enquiry is emailed | Enquiries are saved and nobody is emailed |
| `SITE_TURNSTILE_SITE_KEY` | Variable | The bot check widget's public key, shown on the form | The form has no bot check, and enquiries are marked as unchecked |

No new secret. The route uses the two the Worker already has, `TURNSTILE_SECRET_KEY` and `RESEND_API_KEY`.

## What was not done, on purpose

- No route, custom domain or DNS change. `setoutglass.com` is not attached.
- Nothing deployed. No Resend, Turnstile or Stripe setting touched. No real email sent.
- No sign-up, trial or billing. That is step 4.
- No list of enquiries in the workspace. They are emailed and kept in the database, and read there until the platform admin exists.

## Questions for Matt

Answered by Matt on 12 November 2026:

- **Prices** (1): "dont worry about price for now until it goes live". The placeholder stays until then.
- **Naming Custom Showers** (2): "yeah thats fine". The home page's line stands, with no placeholder.
- **Where enquiries go** (3): sales@customshowers.uk, set as `SITE_NOTIFY_EMAIL` for production. It is also the address on the privacy page.
- **Who runs SetOut** (4): "Custom Showers can be the company behind set out as thats a company". It is a limited company, number 16892739, registered in England and Wales. The privacy page says so. Its name exactly as registered, its registered office and its ICO registration are still a placeholder: Matt has moved back to New Zealand and is sorting a UK address for the registered office.
- **Naming CRL** (8): "yes".

The rest are still open:

1. **Prices.** What does SetOut cost, and how is it counted: a flat monthly price, or by enquiries as the roadmap says? Is there a free trial, and is set-up charged? The pricing page has a marked placeholder until this is settled.
2. **Naming Custom Showers.** The home page says SetOut was built inside Custom Showers and runs on `customshowers.uk/design-shower`, with a link. Is that line all right, and is the wording right?
3. **Where enquiries go.** Which inbox should `SITE_NOTIFY_EMAIL` be for production? It is empty there now. Staging is set to Resend's test inbox, `delivered@resend.dev`, as its designer already is.
4. **Who runs SetOut, legally.** The privacy page needs the name of the company or person responsible for SetOut, an address to write to about personal data, and whether SetOut is registered with the ICO. All three are marked placeholders.
5. **How long an enquiry is kept.** The privacy page has a placeholder. Suggested: two years after the last contact, then deleted.
6. **The bot check.** Should the site use the existing "SetOut designer" Turnstile widget (it already covers `setoutglass.com`), or a widget of its own? Either way its public key goes in `SITE_TURNSTILE_SITE_KEY`. And should an enquiry with no bot check token be refused, where a design is only marked?
7. **An acknowledgement email.** Should the person who fills the form in get an email to say we have it? It is left out for now so the form cannot be used to send mail to strangers.
8. **Naming CRL.** The site says SetOut knows CRL's hinges, cut-outs and catalogue numbers. Is that all right to say publicly?
9. **A contact address on the site.** There is none, only the form. Should `hello@setoutglass.com` be shown, and does it reach an inbox?
10. **Staging's address.** Should staging have a name of its own for the site, such as `site-staging.setoutglass.com`, or is `/site/` on its workers.dev name enough?
11. **Going live.** When the copy, prices and legal details are settled, the route change in `docs/deploying.md` puts the site on `setoutglass.com`. Does anything else already use that name or `www`?
12. **The screenshots.** They show a made-up company, "Demo Showers", made-up customers, and a quote with made-up prices for glass and hinges. Are those all right to publish, or should the quote's prices be Custom Showers' real ones, or the quote pictures be left out?
