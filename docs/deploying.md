# Deploying

SetOut is one Cloudflare Worker with two environments. Nobody pastes code into a dashboard.

| Environment | Worker | Database | Deployed |
| --- | --- | --- | --- |
| Staging | `setout-staging` | `setout-staging` | Automatically, by every push to `main` that passes the checks |
| Production | `setout-production` | `setout-production` | By hand, from GitHub |

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
2. Applies any new database migrations to the staging database.
3. Publishes the Worker with both built apps, stamped with the commit.
4. Asks the new deploy's `/api/health` whether it is the commit that was just sent, whether its engine cuts the known design to the known sizes, and whether it can reach its database. If any of that is wrong the run fails.

The address is shown on the run, under the staging environment. Open it to see the same check in the browser: the workspace shell at `/` and the designer shell at `/designer/`.

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

## Still to set up, with the step that needs it

- **File storage (R2)**, for photos and drawings, in step 1. It has to be switched on in the Cloudflare dashboard, which asks for a payment card. The bucket should be created in the EU, like the databases.
- **The paid Workers plan**, before real traffic. The free plan's limits are enough for staging.
- **The product's own addresses**, once the domain is registered: one for the designer and one for the workspace.
- **Secrets for email and bot checks**, in step 1. They are added with `wrangler secret put`, per environment, and never go in `wrangler.jsonc`.
