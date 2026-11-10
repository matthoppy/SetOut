# SetOut

Software for frameless shower companies. A company's customer designs and measures a shower once, on the company's own website, and the company prices, quotes and makes it from that same design.

There are two apps and one engine:

- **The designer** is embedded on a company's website. The customer picks a layout, chooses glass and hardware, follows the measuring cards and sends the design.
- **The workspace** is where the company's staff receive each design as a job, check it, edit it, quote it and print what the toughener and the fitter need.
- **The engine** sits under both and under the API between them. It owns the design document, the measuring sequence, the checks, the cut sizes and the hardware. All three run the same copy, so they cannot disagree about a size.

## Where it stands

Step 0 of six is done: the foundations. The engine has moved across from the Custom Showers configurator with its rules passed in, the database and its company-scoped data layer exist, and one Worker serves the API and both app shells. The designer's and the workspace's real screens arrive in steps 1 and 2.

The plan, the data model and the decisions behind them are in [docs/architecture.md](docs/architecture.md).

## What is in the repository

| Folder | Holds |
| --- | --- |
| `packages/engine` | The shared engine and its tests. Pure TypeScript: no screen, no network, no clock. |
| `packages/ui` | Screens and parts shared by the two apps. |
| `apps/designer` | The customer's app, served at `/designer/`. |
| `apps/workspace` | The trade workspace, served at `/`. |
| `apps/api` | The Cloudflare Worker, the database schema and its migrations. Serves `/api` and both built apps. |
| `scripts` | Deploying, and checking a deploy is healthy. |
| `docs` | The architecture and decisions, and how deploys work. |

## Running it

You need Node 22.

```sh
npm install
npm run dev
```

That builds both apps, creates a local database, and starts the Worker at http://localhost:8787. The workspace is at `/`, the designer at `/designer/`, and the health check at `/api/health`.

To work on one app with live reload, keep that running and start the app beside it:

```sh
npm run dev -w @setout/workspace   # http://localhost:5173
npm run dev -w @setout/designer    # http://localhost:5174/designer/
```

## Checking it

```sh
npm run check
```

runs everything CI runs:

| Command | What it proves |
| --- | --- |
| `npm run lint` | Code style, and two rules of the house: the engine uses nothing from the platform it runs on, and only `apps/api/src/db` touches the database. |
| `npm run typecheck` | Every package compiles in strict mode. |
| `npm run build` | Both apps build. |
| `npm test` | The engine cuts 33 known designs to their known sizes. No company can read, change, delete or link to another company's rows. |

## Deploying

A push to `main` that passes the checks is deployed to staging, and the deploy is then asked whether it is healthy. Production is deployed by hand from GitHub. Both need two secrets added once. See [docs/deploying.md](docs/deploying.md).

## Rules of the house

These are what keep a wrong number from becoming a wrong piece of glass, and one company's data from reaching another. Each is enforced by a test or a lint rule, not by memory.

1. **The design document is the only source of truth.** Drawings, cut sizes and hardware are always worked out from it by the engine. Nothing is typed in twice.
2. **The server never trusts a number worked out in a browser.** It runs the engine again with that company's rules and stores its own answer.
3. **The server decides which company a request belongs to.** No request names its own company, and the data layer adds the company to every statement.
4. **Rules are data.** Every clearance and deduction is in a ruleset passed to the engine. Nothing in the calculations is a constant.
5. **A design revision is never edited.** A change is a new revision, with who made it and why. The database refuses anything else.
6. **A change to a cut size is deliberate.** If a known design starts cutting differently, a test fails. See [packages/engine/README.md](packages/engine/README.md).
