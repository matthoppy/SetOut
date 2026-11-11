# Architecture and decisions

This is the record of how SetOut is built and why, as agreed on 10 November 2026. Where code and this page disagree, one of them is wrong and should be fixed.

## What SetOut is

Subscription software for frameless shower companies. Their customer designs and measures a shower once, and the company prices, quotes and makes it from that same design.

| Surface | Who uses it | What they do there |
| --- | --- | --- |
| Designer | The company's customers, on the company's own website | Pick a layout, choose glass and hardware, follow the measuring cards, see the shower drawn from their own numbers, then send it |
| Workspace | The company's staff | Receive each design as a job, check and edit it, see drawings and cut sizes, price it, quote it, turn it into an order, and print what the toughener and the fitter need |
| Platform admin | SetOut | Manage companies, plans, usage and support |

Custom Showers is company one and the test bed. Brennan Glass is company two, on a free account, and adding it must need no new code.

SetOut is not a website builder, general CAD, an accounting system or a toughener's production system. It hands off to those.

## The pieces

Everything runs on Cloudflare as one deployable, with one shared database in which every row belongs to a company.

| Piece | What it does | Where it runs |
| --- | --- | --- |
| Engine | The design document, measuring cards, checks, deductions and cut sizes, hardware selection, drawing geometry and pricing | Inside the designer, the workspace and the API. Same package, same version |
| Designer | The customer's app | A frame served by SetOut, shown on the company's website by one small script |
| Workspace | The trade dashboard | A web app at SetOut's own address, behind sign-in |
| API | Designer routes, workspace routes, platform routes and webhooks | One Cloudflare Worker, deployed together with both apps |
| Database | Everything except files | Cloudflare D1, one database, a company on every row, stored in the EU |
| Files | Photos, drawings and PDFs | Cloudflare R2, one folder per company, opened only through short-lived links |
| Background work | Emails, outbound webhooks and PDF rendering | Cloudflare Queues |
| Outside services | Billing, email delivery and bot checks | Stripe, Resend and Turnstile |

Three rules hold it together:

1. **The design document is the only source of truth.** Drawings, cut sizes, hardware lists and prices are always worked out from it by the engine. Nothing is typed in twice.
2. **The server never trusts a number worked out in a browser.** When a design is sent or saved, the API runs the engine again with that company's rules and stores its own result.
3. **The server decides which company a request belongs to.** A designer is identified by its site key and a member of staff by their sign-in. No request names its own company.

## How the two apps talk

The designer and the workspace never talk to each other. Both talk to the API, and the design document is what travels between them.

1. The company's page loads one script with its site key. The script opens the designer in a frame served by SetOut, and the designer fetches that company's configuration.
2. As the customer works, the design is saved in their browser. If they ask to carry on on another device, it is also kept on the server as a draft, which a link opens there.
3. The customer sends the design: the document, their contact details and a bot check.
4. The API runs the engine on the document with that company's rules, then stores the customer, the job, revision 1 of the design and the files. Whatever the browser calculated is discarded.
5. The company and the customer are emailed. The company's own systems are told by webhook if it has one.
6. Staff open the job in the workspace. The same engine draws the same design.
7. Any edit is saved as a new revision, with who changed it and why. The customer's original is never overwritten.
8. A quote prices one specific revision, and an accepted quote becomes an order. Both keep a frozen copy of the sizes and prices they were made from.

Revisions are the versioning. Each one records the document format, the engine version and the company's ruleset version that produced it.

## The designer's routes

Public, called from the designer's own frame. A request is tied to a company by its site key and by nothing else it says.

| Route | What it does |
| --- | --- |
| `GET /api/designer/config?key=` | What a designer needs to know about its company: name, colour, finishes, handles, wording and its changes to the making rules. Nothing private |
| `POST /api/designer/enquiries` | A customer sends a design. The document is checked, the engine is run again with the company's rules, and the customer, job, design, first revision and timeline entry are saved together. Then drawings and photos are stored |
| `POST /api/designer/drafts` | Start a draft from the design as it stands, tied to a company by the site key. Answers with the resume token that opens it |
| `GET /api/designer/drafts/:token?key=` | Open a draft on another device. It opens only in the designer it was made in |
| `PUT /api/designer/drafts/:token` | Save a draft as it now stands, and keep it for another thirty days |

After the customer has had their answer, the company is emailed the whole job, built from the server's own sizes, with the drawings and photos attached, and the customer is sent a copy. What happens to each email is written on the job's timeline.

### Carrying on on another device

Choosing a layout is comfortable at a computer. Measuring is done standing in a bathroom with a phone. So the designer offers a link, and a code to point a phone's camera at, that open the design where it now stands on another device. From then on each device saves to the draft as it changes and, when it is come back to, picks up whatever the other one did. A device that was out of signal keeps its own copy and wins if it is the newer.

A draft holds the design and where the customer had got to. It never holds their name, their contact details or their photos. The token in the link is a long random secret. Only its hash is stored, so the database cannot be used to open anyone's draft. A draft is kept for thirty days after it was last saved, and ones that have run out are cleared when the company's next draft is started. One company may hold 5,000 at a time, which stops a script filling the database through a public route.

A photo failing to store never loses the measurements: the job is saved first. A script that fills the hidden field is told it worked and nothing is kept. A missing bot check token is marked, not refused, because the widget can fail to load in a frame and a real customer's measuring is worth more than a flagged enquiry.

On a company's page the designer is added with one element and one script:

```html
<div data-setout-designer="pk_live_..."></div>
<script src="https://designer.setoutglass.com/embed.js" async></script>
```

`data-mode="button"` shows a button that opens the designer over the page. The page is told when a design is sent, as a `setout:sent` event on the element, and never sees the customer's details.

That script address is permanent. Companies paste it once, so it must keep working and keep meaning the same thing.

## Measuring

Measuring is a deck of cards, one task to a card: a short instruction to read, or one number to type. A card has one heading, one picture, one box and one button, and it never scrolls on a phone.

The deck is dealt by the engine, in `packages/engine/src/cards.ts`, from the shape of the shower and the tool in the customer's hand. The designer only shows what it is dealt. Each number is written into the design document as it is typed, through the same functions the checks read, so a locked phone loses nothing and there is one set of rules.

The last card is the opening drawn from the numbers, with every reading on it under the same circled number it had on its card, and one button to say the numbers are right. It is laid out as a dimensioned drawing: only the door and the laser cross inside the opening, each reading on its own line just outside the surface it was taken from, and the sizes they add up to beyond that. Leans, falls and slopes are drawn eight times bigger than they are, and the drawing says so. Nothing on it is drawn from a guess: with a reading missing there is no drawing.

There are two kinds of deck. A single door between two walls is measured to a laser cross in the middle of the opening: eight readings from one place. Every other layout is measured a run at a time, in the steps agreed for it: how wide the run is, in two halves to the laser where there is a door in it; the floor under it as two readings up to the level line; floor to ceiling at each end where the glass reaches it; and each wall the glass ends on as two readings to the laser's upright line, stood 50mm off it. The cards come in the order the customer meets them walking along the glass, so the laser is moved as little as possible.

For those layouts the last card draws each run face on from outside the shower, under a plan from above when the glass turns a corner.

What the customer agreed on that card is sent with the design as one picture, `measurements.png`, beside the plan and elevation of the finished shower. The company sees every reading that was taken, and not only the sizes worked out from them.

Every layout has its deck when it is measured with a laser. Measuring with a tape and a level still uses the older screens until its decks are written.

## The workspace

Staff sign in with a link emailed to them. There are no passwords to leak, guess or reset. Nobody signs up: a person is added to a company first, and only then can they ask for a link. A link works once, for fifteen minutes, on any device, and an address is sent no more than five an hour. Asking for one gets the same answer whether or not the address has an account, so the answer never says who has one.

Using the link signs that browser in for thirty days, with a cookie that only the workspace's address is sent, that no script on the page can read, and that another website cannot make the browser send with a change. Every change must also come from the workspace's own pages. Neither the link nor the session is ever stored, only its SHA-256 hash, so a copy of the database signs nobody in.

A person is one user, whatever companies they belong to. A membership says which companies those are, as owner or staff. The session says which of them the person is working in, and that is checked against their memberships on every request, so taking someone off a team, or switching a company off, signs them out of it at once.

| Route | What it does |
| --- | --- |
| `POST /api/workspace/sign-in` | Ask for a link by email |
| `POST /api/workspace/sign-in/verify` | Use a link. The browser that does is signed in |
| `GET /api/workspace/me` | Who is signed in, the company they are working in, and their others |
| `POST /api/workspace/company` | Work in another of one's companies |
| `POST /api/workspace/sign-out` | End the session |
| `GET /api/workspace/jobs` | The inbox: the company's jobs, newest first, by stage or by search, with how many are at each stage |
| `GET /api/workspace/jobs/:id` | Everything about a job: the customer, each shower as it now stands, its files and its timeline |
| `PATCH /api/workspace/jobs/:id` | Move a job to another stage. The timeline says who moved it |
| `POST /api/workspace/jobs/:id/notes` | Add a note to a job's timeline |
| `GET /api/workspace/files/:id` | A job's drawing or photo, to its company's signed-in staff alone |

These answer on the workspace's address only. Nothing running in the public designer can reach them.

## The two addresses

One Worker answers on two addresses, agreed on 11 November 2026.

| Address | Serves | Framing |
| --- | --- | --- |
| `designer.setoutglass.com` | The designer, its embed script at `/embed.js`, and the designer's routes | Only by the websites listed for that designer |
| `app.setoutglass.com` | The workspace and, from step 2, its routes | Never, by anyone |

They are separate so that nothing running in the public designer can reach a signed-in workspace. The workspace's address has no designer, no embed script and no designer routes, and the designer's address never serves the workspace.

Each designer has a list of websites allowed to show it. The designer's page is sent with that list as its framing rule, read from the database on every load, so a change takes effect at once. A browser refuses to show the designer on any other website. A test key may also be framed from a developer's own machine. With no key, or an unknown one, nobody may frame it.

Staging has the same pair, `designer-staging.setoutglass.com` and `app-staging.setoutglass.com`, and keeps its workers.dev name, which serves both apps by path: the designer under `/designer/` and the workspace everywhere else. A developer's machine works the same way.

## The database

One database holds every company. The job is the spine: it links the customer, the designs, the quotes, the order and the fitting.

Conventions, kept by every migration and checked by `apps/api/test/schema.test.ts`:

- Every company table's primary key, and every index, starts with `company_id`. The only exceptions are the two keys that say which company a request belongs to: a designer's site key and a draft's resume token.
- A row that points at another row points at `(company_id, id)`, never at `id` alone. The database itself then refuses a link from one company to another.
- Company data is reached only through `companyDb(env, companyId)` in `apps/api/src/db`. It adds the company to every statement. A lint rule stops any other file touching the database.
- Ids are unguessable text with a prefix, such as `job_01KA…`. Each company also has its own readable references, such as `CS-1042`.
- Sizes are whole millimetres. Money is whole pence, with the currency on the company. Times are UTC.
- The design document and frozen snapshots are JSON. Anything filtered or sorted by is a real column.

Tables in place:

| Table | Holds |
| --- | --- |
| `companies` | Each shower company: name, status, plan, branding, settings, feature switches |
| `usage_monthly` | What each company used each month |
| `designers` | Each embedded designer: site key, allowed websites, configuration |
| `rulesets` | A company's versioned changes to the default making rules |
| `customers` | The company's customers |
| `jobs` | The spine: one enquiry through to a fitted shower |
| `designs` | One shower within a job. A job can hold several |
| `design_revisions` | Every saved version of a design, never edited in place |
| `drafts` | Unfinished designs from the designer |
| `files` | Photos, measuring photos, drawings and PDFs |
| `job_events` | The job's timeline |
| `memberships` | Who works for the company, as owner or staff |

Three tables belong to the platform rather than to a company: `users`, one row per person whatever companies they belong to, `login_tokens` for sign-in links, and `sessions` for signed-in browsers.

Still to come, with the step that uses them: `invites` and `audit_log` in step 2. `catalog_items`, `finishes`, `price_books`, `quotes`, `quote_lines` and `orders` in step 3. `suppliers`, `purchase_orders`, `appointments` and `webhook_endpoints` in step 5.

## The roadmap

Each step ends at something that can be checked on a live address.

| Step | What is in it | Done when |
| --- | --- | --- |
| 0. Foundations | Repository, tests, automatic deploys. The engine moved across with rules passed in, a versioned design document, and known designs checked against known cut lists | The engine's tests pass in SetOut and a push deploys to staging |
| 1. Designer and measuring | Card decks for every layout and for tape measuring. The final dimensioned drawing. The embed script with a site key. Designer routes, with the engine re-run on the server | Custom Showers' own site is running on the SetOut designer |
| 2. Workspace | Email sign-in, team and roles. Job inbox and job page. Editing with revisions. Measurement sign-off. Making sheet and fitting sheet. Company settings | Brennan Glass is live as company two with no new code |
| 3. Pricing and quotes | Catalogue and price book. Pricing in the engine. Optional estimate in the designer. Quote builder, online quote with accept, and quote to order with frozen copies | A real quote is sent and accepted |
| 4. Onboarding and billing | Self-serve sign-up with a card and a 14-day trial. Set-up wizard. Stripe plans counted in enquiries. Free accounts. Platform admin | A company we have never spoken to signs up and embeds the designer |
| 5. Operations and integrations | Order board, supplier purchase orders and cut-list exports, a fitting diary, webhooks and API keys, CRM and accounts connectors | Ongoing |

## Decisions

Agreed on 10 November 2026. Each was cheap to settle then and is expensive to change once companies depend on SetOut.

| | Decision | What was agreed | Why it is hard to change later |
| --- | --- | --- | --- |
| A | The product's web address | Choose and register it now | The script address a company pastes into its website is permanent |
| B | Can one job hold several showers? | Yes. A main bathroom and an en suite are one job, two designs and one quote | Quotes and orders point at designs |
| C | Staff sign-off before making | Yes. An order or making sheet can only come from a revision a member of staff has marked as checked | It decides where responsibility for the dimensions sits |
| D | What a company may change | Clearances, deductions, default heights, and which layouts and hardware are offered, within safe limits. Hinge capacities and glass limits stay fixed by SetOut | The engine has to take rules as inputs from the first day |
| E | Does the homeowner see a price? | A setting per company, off by default: nothing, a range, or a figure | Prices must be worked out on the server only, so margins never reach the browser |
| F | The CRM portal | Replace it with the workspace, once what it holds has been looked at | Two systems holding the same customers drift apart |
| G | Cloudflare plan | File storage switched on, the paid Workers plan, and SetOut's own database and storage, separate from Custom Showers' | Files stored the temporary way would need migrating |
| H | Photo reading by AI | Left out of the first release, then offered as a switch per company | It makes an AI provider a sub-processor of every company's customer photos |

Technical defaults:

- One repository, one deployable. The engine, designer, workspace and API ship together.
- Rules and catalogue are inputs to the engine, never constants inside it.
- Three versions on every revision: the document format, the engine and the company's rule set. Old designs are upgraded when read, never rewritten in place.
- One shared database with a company on every row, reached only through one data layer, with tests that try to read across companies. A database per company, and Postgres with row-level security, were both considered. Both add running weight that is not needed yet, and the SQL is kept portable so a later move stays a contained job.
- The designer runs in a frame on SetOut's address, identified by a site key that is safe to publish. It never relies on cookies and is never injected into the host page.
- Staff sign in by emailed link. Users are separate from companies and joined by a role, so one person can belong to two companies.
- Every change of state writes an event. The job timeline, outbound webhooks and later CRM connections all read the same events.
- Plan limits and feature switches are data on the company, and usage is counted from the first day.
- Staging and production from the start, deployed from GitHub.
- SetOut is the processor of homeowners' data, and each company is the controller. Data is stored in the EU, retention is set per company, export and delete are built in, and support access is logged.

## Decided while building step 0

- **Rule limits are provisional.** `ADJUSTABLE` in `packages/engine/src/ruleset.ts` lists every rule a company may change and how far. The mechanism is settled. The bounds are a cautious first guess, to be agreed with a glazier before the company settings screen ships in step 2. Until then no company has overrides.
- **Lists that will grow are checked in code, not by the database.** Job stages, file kinds and event types are validated by the data layer, so adding a stage is a code change and not a table rebuild.
- **Review notes name the company.** The engine's notes to a customer say who will check something by hand. The company's name is passed in with its rules, so Brennan Glass's customers are never told that Custom Showers will check their door.

## Risks to keep in view

- **Other companies make showers differently.** The default rules are Custom Showers' own. Brennan Glass is the first test of how much must be adjustable.
- **A wrong number is toughened glass in a skip.** Sign-off, frozen copies, and known designs checked against known cut lists on every change are the defences.
- **Layout coverage sets the market.** Sliding doors, bi-folds and quadrants are engine work, and each one widens who can use SetOut. Today the model is a chain of flat panels joined straight or at 90 degrees.
