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
| `GET /api/workspace/jobs` | The inbox: the company's jobs, newest first, fifty at a time, by stage or by search, with how many of them are at each stage. Each page gives the mark the next one starts `after` |
| `GET /api/workspace/jobs/:id` | Everything about a job: the customer, each shower as it now stands, its files and its timeline |
| `PATCH /api/workspace/jobs/:id` | Move a job to another stage. The timeline says who moved it |
| `POST /api/workspace/jobs/:id/notes` | Add a note to a job's timeline |
| `POST /api/workspace/jobs/:id/designs/:designId/check` | Mark the revision a shower stands at as checked. The request names the revision that was looked over |
| `DELETE /api/workspace/jobs/:id/designs/:designId/check` | Take a check back |
| `GET /api/workspace/jobs/:id/designs/:designId/editor` | What the editor needs to open a shower: the designer its job came from, with the company's options and rules, and the revision it stands at |
| `POST /api/workspace/jobs/:id/designs/:designId/revisions` | Save a changed shower as its next revision, with a reason and its new drawings. The request names the revision the change was made from |
| `GET /api/workspace/files/:id` | A job's drawing or photo, to its company's signed-in staff alone |
| `POST /api/workspace/jobs/:id/quotes` | Write a new quote, filled in from the job's showers as they stand, with the prices last sent for the same things |
| `GET /api/workspace/jobs/:id/quotes/:quoteId` | A quote, and what stands in the way of sending it |
| `PATCH /api/workspace/jobs/:id/quotes/:quoteId` | Change a draft: its lines, note, VAT and how long it stands. Totals are worked out on the server |
| `DELETE /api/workspace/jobs/:id/quotes/:quoteId` | Throw a draft away |
| `POST /api/workspace/jobs/:id/quotes/:quoteId/send` | Send a draft to the customer, with their own link. It is frozen from then on |
| `POST /api/workspace/jobs/:id/quotes/:quoteId/withdraw` | Take back a sent quote |
| `GET /api/workspace/team` | Everyone on the team. Owners also get the latest changes to it |
| `POST /api/workspace/team` | An owner puts someone on the team. They are emailed to say so |
| `PATCH /api/workspace/team/:id` | An owner makes someone an owner, or staff |
| `DELETE /api/workspace/team/:id` | An owner takes someone off the team. They are signed out of it at once |
| `GET /api/workspace/settings` | The company's settings: its name, colours and logo, how a new quote starts, and each designer's finishes, handles and who it emails, with how many showers use each option. Owners also get the latest changes to them |
| `PATCH /api/workspace/settings/company` | An owner changes the company's name, its colours and logo, or the VAT and how many days a new quote stands for |
| `PATCH /api/workspace/settings/designers/:id` | An owner changes the finishes and handles a designer offers, or who it emails when a design arrives |

These answer on the workspace's address only. Nothing running in the public designer can reach them.

A shower is made only from a design a member of staff has checked. On the job page, staff look over the drawings, cut sizes and readings and mark the shower as checked. The request names the revision they looked at, so a design that changed meanwhile is never checked unseen, and a design that cannot be made as drawn cannot be checked at all. Checking, and taking a check back, both go on the job's timeline with who did it. The database lets nothing about a revision change afterwards except its check.

Staff change a shower in the same screens its customer used: its measurements, its layout and its hardware, with the drawings and cut sizes following as they go. The editor is the designer's own code, served at `/edit/<job>/<shower>` on the workspace's address, because it works with a staff session, and never on the designer's. A change is saved as the shower's next revision, with a reason that goes on the timeline, and is checked and worked out again on the server with the company's rules, as a customer's design is. Whatever the browser worked out is not even read. The request names the revision the change was made from, so a change made from an older copy is refused rather than saved over someone else's, and the database keeps revision numbers unique for two saves at the same moment. A design with no change, or no reason, is refused. A new revision starts unchecked. Its drawings are stored with it, and the job page shows each shower's drawings for the revision it stands at, with earlier ones kept below.

A quote prices a job's showers as they stood when it was written. A new one is filled in from the engine's own sizes: each pane of glass by the square metre at its cut size, the hinges and handle on each door, and the channel or clamps, in the finish chosen. Each line says what it is the price of, such as `glass:10:clear` or `hinge:geneva:chrome`, and starts at the price the company last sent for it, so a company's prices build up as it quotes. Totals and VAT are always worked out on the server, in whole pence. A quote can only be sent when every shower it prices still stands at the revision it priced and has been checked, so a customer is never offered something no one has looked over. Once sent, the database refuses any change to it: it can only be accepted or withdrawn. Sending moves the job to Quoted and emails the customer a link of their own, which opens the quote on the designer's address, the public one, at `/q/<link>`. The link is long and random, only its hash is stored, and it is never passed on as a referrer. The customer accepts by typing their name and ticking a box; the job moves to Ordered and the company is emailed. A withdrawn quote, or one that has run out, cannot be accepted.

| Public route | What it does |
| --- | --- |
| `GET /api/quote/:link` | The quote, as the customer reads it |
| `POST /api/quote/:link/accept` | Accept it, with the customer's name, from the quote page only |

These answer on the designer's address, never the workspace's.

Owners run their own team. Adding someone needs only their address: they are emailed to say who added them and as what, with a button that opens the sign-in page with their address filled in. The email carries no sign-in link, because a link runs out in minutes and the email may not be opened for days. A company can add up to twenty people a day, so nobody can use SetOut to send mail in bulk. A company always keeps at least one owner, checked inside the statement that makes the change, so two owners demoting each other at once cannot leave it with none. Every change to the team is written to the company's audit log in the same batch as the change, and only if the change was made.

Owners also keep the company's settings, so nobody edits the database by hand. On the settings page they rename, re-colour, add, remove and reorder the finishes and handles each designer offers. An option keeps its id for good, because designs, quotes and the price list name it by its id, as in `handle:pull:chrome`. A new one gets an id made from its name, so Gunmetal grey is `gunmetal-grey`. A designer always offers at least one finish and one handle, and a new design starts with the first of each. An option that showers already use can still be removed, and the page says how many use it. Those showers keep it, and their sheets and quotes then name it from its id. How the glass is drilled for a handle is fixed by SetOut, by its id: no holes for the knob, and two holes 203mm apart for every other handle, including one an owner adds. The page says so beside each handle.

Owners also choose who is emailed when a design arrives: one to five addresses, the first of which gets customers' replies. They set the colours of the designer and of the quotes customers open, as `#rrggbb`, and a logo for those quotes, as an `https` link to a picture on their own website. They set the VAT and how many days a new quote stands for, kept in the company's settings as `vatRateBp` and `quoteValidDays`. Every new quote starts with these, and staff can still change them on it. And they set the company's name. Everything is checked on the server, and a request with one thing wrong changes nothing. Each part says which version of it a change was made from, so a change made from an older copy is refused rather than saved over someone else's. Each change goes in the audit log in the same batch, only if it was made, with what changed and who changed it. Staff can see the settings but change none of them. Which websites may show a designer is a security setting, and the making rules change cut sizes, so neither is on the page.

The workspace's pages are few: `/sign-in`, the inbox at `/jobs`, a job at `/jobs/:id`, a quote at `/jobs/:id/quotes/:quoteId`, a job's making sheets at `/jobs/:id/making`, its installation sheets at `/jobs/:id/installation`, a glass order at `/glass`, the team at `/team`, and the company's settings at `/settings`.

A glass order is for the toughener, laid out as Custom Showers' own orders are. Its first page lists every pane of the checked showers on the jobs chosen. Then each pane has a page: the order's header (work ID, date, name, description, reference, marks, quantity, size and weight), the pane drawn to scale with every edge dimensioned and marked FP, each cut-out drawn on its edge with a template letter and its distance from the nearer end, handle holes with their distance in from the edge, and where the toughening stamp goes. A last page draws the templates used. The company's name and the page number are at the foot of every page. It offers the jobs at Ordered, or one job when opened from its page. Cut-outs are measured as Custom Showers' own orders measure them: a hinge notch from the nearer end of its edge to the notch's near edge; a hole from the bottom to its centre, and a pull handle's second hole from the first. A door with a knob has one hole for it, at the knob's height. The toughening stamp is 5mm up in a bottom corner: 59mm in on a fixed panel, away from its hinges, and 50mm in on a door, on its hinge side (SetOut's fixed rule `stamp`). On a pane cut to shape, each corner that is still square has a small square drawn in it. Each hinge is cut to its own maker's template where SetOut has it (SetOut's fixed rule `hinges.cutouts`, from the CRL sheets saved in `docs/hinge-templates/`): a Geneva or Vienna door has CRL's notch with its two relief holes ("mouse ears"), and so does the panel it hangs from in line, the hinge being the same either side; at a corner the Geneva 90° hinge (GEN092) takes two 16mm holes in the panel instead, 37mm in and 57mm apart. CRL's figures are checked against its UK catalogue and brochure, saved by Matt in `data/crl/` (what SetOut takes from them is in `data/crl/LEARNED.md`). Any other hinge is cut to SetOut's own notches, and the templates page says to check them against the template in the hinge's box. Every cut-out is named for its hinge as the orders name it ("Gen - G/G - 90°"), each template gets a letter in the order it first appears, and the last page draws each one large with all its sizes.

Panes are cut to the shape of the opening, by Matt's rules of 11 November 2026, worked out by the engine's `shapesOf` from the customer's readings. An edge against a wall follows the wall's lean, in or out; one that leans out makes the pane bigger. A fixed pane's bottom follows the floor. Its top follows the ceiling when the glass goes to the ceiling, and otherwise stays level at the glass height above the floor's highest point along its run, so the pane is taller where the floor is lower. A door's sides are always plumb; when the glass goes to the ceiling its top and bottom rake with the ceiling and floor, and otherwise it is square. Edges at a glass joint or a corner are plumb. Every difference is kept and shown, however small. Each pane's size on the glass order, the making sheet, the job page and a quote is the rectangle it is cut from, around its shape; the drawing shows the shape inside it, dashed, with each edge's length and each corner's offset. Every cut-out stays at exactly the same place on the glass, measured up from the bottom corner of its own edge. With every reading square, every shape is the spec's own rectangle. The spec's own cut sizes are unchanged: they are the square rectangles the hinges and limits are checked against.

Where each cut-out is comes from the engine's `panesOf`: every notch and hole on a stated edge, as seen from outside the shower, at the spec's own heights, which its tests hold it to for every known design. The spec itself names a fixed panel's mating hinge notch "hinge side" or "handle side", which a fixed panel does not have, so the sheets never print those words; they say left edge or right edge. Nothing is drawn from a guess, because a cut-out on the wrong edge is a pane in the skip.

An installation sheet is one printed A4 page per checked shower, for the fitters, laid out as Custom Showers' own are. A header with the shower's name and the job's reference. The shower seen from outside, runs unfolded side by side: the floor, the walls as they lean and any measured ceiling, each pane where it stands, the hinges and handle on each door, each pane's share of the opening and the height at each end. Beside it the customer, the installation address, their phone and email, and the revision that was checked; below that, how far the opening is out of square, drawn larger than it is: each wall's lean over the glass height and the fall of the floor and any ceiling along each run, in mm. Then every pane as cut, with each edge's length and the gaps to set it out by: under each corner to the floor, over it to the ceiling where the glass goes to one, and across to the walls and the next pane. Then the fittings, with the company's own names for its finishes and handles: each door's hinges and how they fix (wall to glass, or glass to glass in line or round a corner), its handle, and its seal with its length, then the U-channel or clamps and any support, each with CRL's catalogue number on the right (the engine's `crlPartOf`, below). Last, the installation comments. The gaps come from the engine's `setOutOf`, worked from the same lines the panes are cut to, so a gap and a size on the glass order always add up to the opening; the fittings come from `fittingsOf`. A door's deduction comes off its latch side, except that a door hung in line from the panel beside it on glass-to-glass hinges keeps the hinge's gap on that side (Matt, 11 November 2026: 3mm, SetOut's fixed rule `hinges.glassToGlassGapMm`); its cut size is the same either way. The installation address, its postcode and the comments are the job's own, written on the sheet's page and saved on the job, and the timeline says who changed them.

CRL's catalogue numbers come from the engine's `crl.ts`. Geneva, Vienna and Bellagio are CRL's own ranges, so a hinge's number follows from its range and how it fixes (to the wall on the offset back plate: GEN044, V1E044, BEL344; glass to glass in line: GEN180, V1E180, BEL380; at a corner: GEN092, V1E092, BEL392), with the finish's code on the end. Seals are clear, so have one number for the glass they are on (bubble seal PCR8/PCR10/PCR12; 90° stopper seal PC0890/PC1090). The channel is CRL's deep U-channel (SDCD38 for 10mm, SDCD12 for 12mm), which is aluminium, so chrome hardware has it brite anodised (BA). A company's finish takes CRL's code for the finish of the same name unless an owner sets one in Settings, and a handle has a number only once an owner sets one (without its finish: BM8X8). Every number is looked up in `crl-catalogue.ts`, every catalogue number in Matt's copy of CRL's catalogue, written from `data/crl/` by `scripts/crl-catalogue.mjs` and checked against it by the engine's tests; where CRL does not list a part in a finish, the sheet says so for the office to sort out, and where a finish or handle has no code yet, it says where to add one. The public designer is never sent the codes.

A making sheet is one printed A4 page per shower, for the workshop and the toughener, and only a checked shower has one. Everything on it comes from the revision that was checked, as the server worked it out: each pane's cut size beside what was measured, its notches, holes and cut-outs with their heights, the hinge centres and handle holes on each door, the glass, the fixings, any support the run needs, the notes from measuring, and the plan and elevation of that revision, with who checked it and when. A job's page shows what the server worked out and the customer agreed to, never anything a browser added up: the drawings from the last card, each panel's cut size beside what was measured, the hardware and glass, every reading in the order it was taken, the photos and the timeline. Signing in, signing out and moving to another company each load the page afresh, so nothing one person or company could see is left in the page for the next.

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
| `audit_log` | What was done to the company's account and by whom: who was added to the team, taken off it or given another role, and each change to its settings |
| `quotes` | Each quote on a job: its lines, the revisions it prices, what it comes to, and whether it was sent, accepted or withdrawn. Frozen once sent |
| `price_list` | The price a company last sent for each thing it quotes, so the next quote starts from it |

Three tables belong to the platform rather than to a company: `users`, one row per person whatever companies they belong to, `login_tokens` for sign-in links, and `sessions` for signed-in browsers.

Still to come, with the step that uses them: `catalog_items`, `finishes`, `price_books` and `orders` in step 3. A quote's lines are kept on the quote itself, as the document it was sent as, rather than in a table of their own. `suppliers`, `purchase_orders`, `appointments` and `webhook_endpoints` in step 5.

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

- **Rule limits are provisional.** `ADJUSTABLE` in `packages/engine/src/ruleset.ts` lists every rule a company may change and how far. The mechanism is settled. The bounds are a cautious first guess, to be agreed with a glazier before the making rules join the company's settings page. Until then no company has overrides.
- **Lists that will grow are checked in code, not by the database.** Job stages, file kinds and event types are validated by the data layer, so adding a stage is a code change and not a table rebuild.
- **Review notes name the company.** The engine's notes to a customer say who will check something by hand. The company's name is passed in with its rules, so Brennan Glass's customers are never told that Custom Showers will check their door.

## Risks to keep in view

- **Other companies make showers differently.** The default rules are Custom Showers' own. Brennan Glass is the first test of how much must be adjustable.
- **A wrong number is toughened glass in a skip.** Sign-off, frozen copies, and known designs checked against known cut lists on every change are the defences.
- **Layout coverage sets the market.** Sliding doors, bi-folds and quadrants are engine work, and each one widens who can use SetOut. Today the model is a chain of flat panels joined straight or at 90 degrees.
