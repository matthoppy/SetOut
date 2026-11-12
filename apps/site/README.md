# SetOut's own site

The public pages at `setoutglass.com`: what SetOut is, what a subscription includes, and how a shower company gets started. The plan it was built to, and the questions still open, are in [docs/site-plan.md](../../docs/site-plan.md).

It is plain HTML written at build time. There is no framework and nothing to install.

| File | Holds |
| --- | --- |
| `build.mjs` | Writes every page into `dist/site/site/`, with the stylesheet, the form's script and the pictures named by a hash of their contents |
| `src/layout.mjs` | The head, header and footer every page has |
| `src/pages/` | One file per page. `index.mjs` lists them with their titles and descriptions |
| `src/site.css` | The look. The colours are not in it: the build puts the workspace's own tokens in front of it |
| `src/client/form.js` | The get-started form: sends it to `POST /api/site/enquiries` and shows the answer |
| `src/images/` | Pictures of SetOut itself |
| `test/build.test.mjs` | Builds the site and checks it: links, pictures, the content security policy, and what it must not say |

## Seeing it

```sh
npm run dev          # from the repository root
```

Then open http://localhost:8787/site/. The form saves to the local database and emails nobody.

After a change to a page, run `npm run build -w @setout/site` and reload. Always build everything once first with the root `npm run build`: the site's build empties only its own folder, but the workspace's empties them all.

## Adding or moving a page

A page's path is in two places, and the build fails if they differ: `src/pages/index.mjs`, and `apps/api/src/site-pages.json`, which is the list of pages the Worker will serve. Links between pages are written with `to('/pricing/')`, which makes them relative, so the same files work at the root of `setoutglass.com` and under `/site/` on staging.

Nothing may be styled or scripted inline. The Worker sends every page with a content security policy that allows the site's own files and Cloudflare's bot check, and nothing else.

## Placeholders

Anything only Matt can settle is written with `placeholder(name, text)`. It shows on the page in a dashed box, the build lists every one, and a test holds the list. Remove each as it is settled, and none should be left when the site goes on its real address. As built:

| Page | Placeholder | Waiting for |
| --- | --- | --- |
| Pricing | `prices` | What SetOut costs: not until it goes live (Matt, 12 November 2026) |
| Privacy | `legal-details` | Custom Showers' registered name and number, registered address and ICO registration. Custom Showers is the company behind SetOut (Matt, 12 November 2026) |
| Privacy | `enquiry-retention` | How long an enquiry is kept |

Settled by Matt on 12 November 2026: the home page may name Custom Showers ("yeah thats fine"), enquiries go to sales@customshowers.uk, which is also the address on the privacy page, and the site may name CRL ("yes").

## The pictures

All of them are real screenshots, taken on 12 November 2026 from SetOut running locally, with a made-up company, "Demo Showers", and made-up customers. The design was sent through the designer as a customer would send it. The prices on the quote are made up too, and the captions say so.

| Picture | Shows |
| --- | --- |
| `designer-layouts` | The designer's first step, choosing a layout |
| `designer-card`, `designer-reading` | Two measuring cards, on a phone |
| `designer-measurements` | The last card: the opening drawn from the readings |
| `workspace-inbox` | The job inbox |
| `workspace-job` | A job page, checked |
| `workspace-quote` | Writing a quote |
| `customer-quote` | The quote as the customer opens it, on a phone |
| `making-sheet`, `glass-order`, `installation-sheet` | The three printed sheets |

To retake one, run SetOut locally, add a company with `scripts/seed-company.mjs` and a person with `scripts/add-member.mjs`, take the screenshot, and save it here as a WebP no wider than 1280 pixels. The build reads each picture's size, and fails if a picture is here that no page shows.
