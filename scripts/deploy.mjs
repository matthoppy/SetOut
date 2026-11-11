/**
 * Deploy one environment: apply any new database migrations, then publish the
 * Worker with the built apps.
 *
 *   node scripts/deploy.mjs staging
 *   node scripts/deploy.mjs production
 *
 * Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, and `npm run build`
 * to have run. Migrations go first, so the code that is about to arrive never
 * meets a database older than it expects. That means a migration must always
 * leave the previous version of the code working too.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const environment = process.argv[2];
if (environment !== 'staging' && environment !== 'production') {
  console.error('Say which environment: staging or production.');
  process.exit(1);
}
for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
  if (!process.env[name]) {
    console.error(`${name} is not set. See docs/deploying.md.`);
    process.exit(1);
  }
}

const root = fileURLToPath(new URL('..', import.meta.url));
const api = join(root, 'apps', 'api');
if (!existsSync(join(root, 'dist', 'site', 'index.html'))) {
  console.error('The apps are not built. Run `npm run build` first.');
  process.exit(1);
}

const commit =
  process.env.GITHUB_SHA ??
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const outputFile = join(mkdtempSync(join(tmpdir(), 'setout-deploy-')), 'wrangler.ndjson');

const wranglerEnv = { ...process.env, CI: 'true', WRANGLER_OUTPUT_FILE_PATH: outputFile };

function wrangler(args) {
  console.log(`\n> wrangler ${args.join(' ')}`);
  execFileSync('npx', ['wrangler', ...args], { cwd: api, stdio: 'inherit', env: wranglerEnv });
}

/**
 * The bucket for drawings and photos, made in the EU the first time. A
 * bucket's place cannot be changed afterwards, so it is never left to chance.
 */
function ensureFilesBucket() {
  const bucket = `setout-${environment}-files`;
  console.log(`\n> wrangler r2 bucket create ${bucket} --jurisdiction eu`);
  try {
    const out = execFileSync('npx', ['wrangler', 'r2', 'bucket', 'create', bucket, '--jurisdiction', 'eu'], {
      cwd: api,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: wranglerEnv,
    });
    console.log(out.trim());
  } catch (error) {
    const said = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (/already exists|already own/i.test(said)) {
      console.log(`${bucket} is already there.`);
      return;
    }
    console.error(said);
    throw new Error(`Could not make sure the ${bucket} bucket exists.`, { cause: error });
  }
}

ensureFilesBucket();
wrangler(['d1', 'migrations', 'apply', 'DB', '--env', environment, '--remote']);
wrangler(['deploy', '--env', environment, '--var', `COMMIT:${commit}`]);

// Wrangler records what it did, one JSON object per line.
const records = readFileSync(outputFile, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const deployed = records.findLast((record) => record.type === 'deploy');

/** A deployed address as a URL. Wrangler lists some as bare hosts or route patterns. */
function toUrl(target) {
  if (typeof target !== 'string') return null;
  const first = target.trim().split(/\s+/)[0].replace(/\/\*$/, '');
  if (/^https:\/\//.test(first)) return first;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(first)) return `https://${first}`;
  return null;
}

// Ask the workers.dev name if there is one: it answers at once, where a newly
// attached address can take a minute or two to get its certificate.
const urls = (deployed?.targets ?? []).map(toUrl).filter(Boolean);
const url = urls.find((u) => u.endsWith('.workers.dev')) ?? urls[0];
if (!url) {
  console.error('The deploy finished but did not report an address.');
  console.error(JSON.stringify(records, null, 2));
  process.exit(1);
}

console.log(`\nDeployed ${environment} from ${commit.slice(0, 7)} at:`);
for (const u of urls) console.log(`  ${u}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `url=${url}\n`);
