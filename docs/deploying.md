# Deploying

SetOut is one Cloudflare Worker with two environments. Nobody pastes code into a dashboard.

The Worker also serves SetOut's own public site. It is on staging's workers.dev name under `/site/` now. Putting it on `setoutglass.com` is a change to the routes that has not been made: see [The site's address](#the-sites-address).

| Environment | Worker | Database | Addresses | Deployed |
| --- | --- | --- | --- | --- |
| Staging | `setout-staging` | `setout-staging` | `designer-staging.setoutglass.com`, `app-staging.setoutglass.com`, and its workers.dev name | Automatically, by every push to `main` that passes the checks |
| Production | `setout-production` | `setout-production` | `designer.setoutglass.com`, `app.setoutglass.com` | By hand, from GitHub |

The addresses are attached by the deploy itself, from `apps/api/wrangler.jsonc`. The first deploy that attaches one creates its DNS record and its certificate, which can take a couple of minutes. The deploy's health check waits for that.

Both databases are SetOut's own, separate from Custom Showers', and both were created to store their data in the EU. That cannot be changed afterwards, which is why it was done at the start.

## Switching deploys on, once

Until two secrets exist in GitHub, CI still runs every check and then says deploys are not switched on. Nothing is red.

1. **Create a Cloudflare API token.** In the Cloudflare dashboard, open the Account API tokens page and choose Create Token. Start from the **Edit Cloudflare Workers** template, add the permission **D1: Edit**, and limit the token to the one account. Cloudflare's own guide is at https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/.
2. **Find the account id.** It is shown on the Workers and Pages overview page in the Cloudflare dashboard.
3. **Add both to GitHub.** In the SetOut repository, open Settings, then Secrets and variables, then Actions, and add two repository secrets:
   - `CLOUDFLARE_API_TOKEN`: the token from step 1
   - `CLOUDFLARE_ACCOUNT_ID`: the id from step 2

Put the token straight into GitHub. Never paste it into a chat, a commit or a file.

The next push to `main` then deploys staging. To deploy without changing anything, re-run the latest CI run from the Actions tab.

## What a staging deploy does

1. Runs lint, typecheck, build and every test.
2. Makes sure the bucket for drawings and photos exists, creating it in the EU the first time.
3. Applies any new database migrations to the staging database.
4. Publishes the Worker with both built apps and the site, stamped with the commit.
5. Asks the new deploy's `/api/health` whether it is the commit that was just sent, whether its engine cuts the known design to the known sizes, and whether it can reach its database. If any of that is wrong the run fails.

The address is shown on the run, under the staging environment. Open it to see the same check in the browser: the workspace shell at `/`, the designer shell at `/designer/`, and SetOut's own site at `/site/`.

## Deploying production

In GitHub, open Actions, choose **Deploy to production**, choose Run workflow, and type `production` to confirm. It runs every check again on exactly what is about to ship, applies migrations to the production database, publishes, and asks the deploy whether it is healthy.

Only `main` can be deployed to production, and only one production deploy runs at a time.

## Going back

A deploy that passes its health check but turns out to be wrong can be undone from the Cloudflare dashboard: open the Worker, then Deployments, and roll back to the previous version. From a terminal with the token set:

```sh
cd apps/api
npx wrangler rollback --env production
```

Rolling back moves the code, not the database. That is why migrations follow one rule.

## Migrations

Migrations are the `.sql` files in `apps/api/migrations`, applied in order and never edited once they have run anywhere.

**A migration must leave the previous version of the code working.** Migrations are applied before the new code arrives, and a rollback puts the old code back on top of the new schema. So:

- Add a table or a column: safe.
- Remove or rename something: do it in two releases. First ship code that no longer uses it, then remove it.

To add one:

```sh
cd apps/api
npx wrangler d1 migrations create DB describe_the_change
```

Then add the table to `src/db/tables.ts` and a row for it to `test/seed.ts`. The isolation tests and the schema tests pick it up from there, and fail if a convention has been missed.

## Running a deploy from your own machine

Possible, and the same script CI uses, but CI is the normal way.

```sh
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
npm run build
node scripts/deploy.mjs staging
```

## Adding a company

Until the platform admin exists in step 4, a company and its first designer are added with a seed file. The script only prints SQL. You run what it prints against the database you mean.

```sh
node scripts/seed-company.mjs scripts/seeds/custom-showers.json --key live --notify sales@example.com > seed.sql
cd apps/api
npx wrangler d1 execute DB --env staging --remote --file ../../seed.sql
```

The site key is printed at the top of `seed.sql`. It is safe to publish: it is what goes in the embed code. Use `--key test` for staging and `--key live` for production. The notify address is given on the command line so that no inbox is committed to the repository.

## Adding a person to a company

Until owners can invite their own staff, a person is put on a company's team with a script. Like the seed script, it only prints SQL. It makes the person's user if they have none, gives someone already on the team the role given, and adds nothing if the company id is wrong.

```sh
node scripts/add-member.mjs co_01... someone@example.com --role owner --name "Their name" > member.sql
cd apps/api
npx wrangler d1 execute DB --env staging --remote --file ../../member.sql
```

A company's id can be read from the database with `npx wrangler d1 execute DB --env staging --remote --command "SELECT id, name FROM companies"`. Once added, the person asks for a link on the workspace's sign-in page. The address is given on the command line so that no inbox is committed to the repository.

## Secrets

Secrets are set per environment with `wrangler secret put`, or in the Cloudflare dashboard under the Worker's settings. They never go in `wrangler.jsonc`. Each is optional, and the code says what it does without it.

| Secret | What it is for | Without it |
| --- | --- | --- |
| `TURNSTILE_SECRET_KEY` | Checking the bot check's token when a design is sent | Designs are accepted and marked as unchecked |
| `RESEND_API_KEY` | Sending email | Nothing is emailed, and each job's timeline says mail is not set up |

```sh
cd apps/api
npx wrangler secret put TURNSTILE_SECRET_KEY --env staging
```

Email also needs the address it is sent from. That is not a secret: it is `EMAIL_FROM` in `apps/api/wrangler.jsonc`, per environment. With either the key or the address missing, nothing is emailed.

## The site's settings

The site needs no secret of its own. Its form uses the two above. It has three variables, which are not secrets and are set per environment in `apps/api/wrangler.jsonc`:

| Variable | What it is | Without it | Staging | Production |
| --- | --- | --- | --- | --- |
| `SITE_HOST` | The site's address, without `www` | The site is only under `/site/`, where an address serves everything by path | Empty | `setoutglass.com`, which does nothing until that address is routed to the Worker |
| `SITE_NOTIFY_EMAIL` | The inbox a get-started enquiry is emailed to | Enquiries are saved, nobody is emailed, and each row says mail is not set up | `delivered@resend.dev`, Resend's test inbox | Empty. **Matt to set** |
| `SITE_TURNSTILE_SITE_KEY` | The bot check widget's public key, which the form shows | The form has no bot check, and enquiries are marked as not checked | Empty. **Matt to set** | Empty. **Matt to set** |

The bot check's public key must belong to the same Turnstile widget as `TURNSTILE_SECRET_KEY`, or every enquiry will fail the check. The existing widget, "SetOut designer", already covers `setoutglass.com` and staging's workers.dev name, so its key can be used: it is the `turnstileSiteKey` in Custom Showers' designer settings, and is shown in the Turnstile dashboard. It is safe to publish.

To read the enquiries that have arrived:

```sh
cd apps/api
npx wrangler d1 execute DB --env production --remote --command "SELECT created_at, company_name, contact_name, email, phone, website, showers_per_month, message, bot_check, email_status FROM site_enquiries ORDER BY created_at DESC LIMIT 20"
```

## The site's address

The site is built and served, but `setoutglass.com` is not attached to the Worker. Nothing in this section has been done. It is for Matt to approve.

**Before switching it on**

1. Settle the placeholders. `npm run build` lists them, and they show on the pages in dashed boxes: the prices, and Custom Showers' registered details and the retention period on the privacy page. They are the open questions in [site-plan.md](site-plan.md).
2. Set `SITE_TURNSTILE_SITE_KEY` for production, in `apps/api/wrangler.jsonc`. `SITE_NOTIFY_EMAIL` is set: enquiries go to sales@customshowers.uk.
3. Check what `setoutglass.com` and `www.setoutglass.com` point at now. In the Cloudflare dashboard, open the `setoutglass.com` zone, then DNS. A custom domain is not attached over a record that is already there, so an existing `A`, `AAAA` or `CNAME` on either name has to be removed first, or the deploy stops and says so. The records Resend uses for email (`MX`, `TXT` and the `resend._domainkey` and `send` names) are separate and must be left alone.

**The change**

In `apps/api/wrangler.jsonc`, under `env.production`, add two routes:

```jsonc
"routes": [
  { "pattern": "designer.setoutglass.com", "custom_domain": true },
  { "pattern": "app.setoutglass.com", "custom_domain": true },
  { "pattern": "setoutglass.com", "custom_domain": true },
  { "pattern": "www.setoutglass.com", "custom_domain": true }
],
```

`SITE_HOST` is already `setoutglass.com` there, so nothing else changes. Then deploy production in the usual way. The deploy attaches both names, and creates their DNS records and certificates, which can take a couple of minutes.

**Afterwards, check**

- `https://setoutglass.com/` shows the site, and `https://www.setoutglass.com/pricing/` lands on `https://setoutglass.com/pricing/`.
- `https://setoutglass.com/jobs` shows the site's not-found page, not the workspace.
- `https://designer.setoutglass.com/embed.js` and `https://app.setoutglass.com/` are as they were.
- The form at `https://setoutglass.com/get-started/` shows the bot check, and one real enquiry arrives in the inbox.

**To take it off again**, remove the two routes and deploy. Then open the Worker's settings in the Cloudflare dashboard, look under Domains and Routes, and remove the two names if they are still listed.

Staging has no address of its own for the site. If it should have one, such as `site-staging.setoutglass.com`, add it to `env.staging.routes` in the same way and set staging's `SITE_HOST` to it. Only the one name is needed.

When mail is set up, a design that arrives is emailed to the addresses on its designer, with the whole job and the drawings and photos attached, and a copy goes to the customer. Emails are sent after the customer has had their answer, and what happened to each one is written on the job's timeline: sent, refused with the reason, or held back.

## What is set up, as of 11 November 2026

| | Staging | Production |
| --- | --- | --- |
| Deployed | Every push to `main` that passes the checks | By hand. First deployed on 11 November 2026, at `b155bb7` |
| Sending domain | `setoutglass.com` in Resend, region EU, with its DNS records in Cloudflare | The same |
| Sent from | `hello@setoutglass.com`, under the company's name | The same |
| `RESEND_API_KEY` | Set. A key that can only send, and only from `setoutglass.com` | Set. A key of its own, "SetOut production", that can only send, and only from `setoutglass.com` |
| Bot check widget | "SetOut designer" in Turnstile, for `setoutglass.com` and its addresses, and staging's workers.dev name | The same widget |
| `TURNSTILE_SECRET_KEY` | Set | Set |
| Custom Showers' designer | A test key. Its bot check site key is in its settings. Its enquiries go to `delivered@resend.dev`, Resend's test inbox, so trying the designer never lands in a real one. Sent emails can be read in Resend under Emails | A live key, for `customshowers.uk` and `www.customshowers.uk` only, with the bot check. Its enquiries go to `sales@customshowers.uk` |
| Custom Showers' team | Matt, as owner | Matt, as owner |

The secrets were put straight into the Worker through Cloudflare's API and never written down anywhere. If one is lost or leaked, make a new key, set it, and delete the old one. Nothing needs copying.

## Still to set up, with the step that needs it

- **The site on `setoutglass.com`.** Built, and on staging under `/site/`. Its address, its inbox and its bot check key are Matt's to switch on: see [The site's address](#the-sites-address).

- **The paid Workers plan**, before real traffic. The free plan's limits are enough for staging.
- **Custom Showers' own site on the SetOut designer.** Production is ready for it. The switch is Matt's call: once the site embeds the SetOut designer, its enquiries arrive in the SetOut workspace and by email, and stop reaching the old dashboard.
