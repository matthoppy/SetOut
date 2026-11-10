/**
 * Ask a deploy whether it is healthy, and refuse to call it done unless it
 * is the commit that was just sent, in the environment it was sent to, with
 * an engine that gives the known answer and a database that answers.
 *
 *   node scripts/check-deploy.mjs https://setout-staging.example.workers.dev staging <commit>
 */
const [url, environment, commit] = process.argv.slice(2);
if (!url || !environment || !commit) {
  console.error('usage: check-deploy.mjs <url> <environment> <commit>');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ask() {
  const response = await fetch(new URL('/api/health', url), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  const health = await response.json();
  const problems = [];
  if (response.status !== 200) problems.push(`answered ${response.status}`);
  if (health.ok !== true) problems.push('says it is not ok');
  if (health.environment !== environment) problems.push(`is ${health.environment}, not ${environment}`);
  if (health.commit !== commit) problems.push(`is commit ${String(health.commit).slice(0, 7)}, not ${commit.slice(0, 7)}`);
  if (health.selfCheck?.ok !== true) problems.push(`cut the known design to ${health.selfCheck?.cutSizes}`);
  if (health.database?.ok !== true) problems.push('cannot reach its database');
  return { health, problems };
}

// A new deploy can take a few seconds to reach every location.
let last = { health: null, problems: ['never answered'] };
for (let attempt = 1; attempt <= 12; attempt++) {
  try {
    last = await ask();
    if (last.problems.length === 0) break;
  } catch (error) {
    last = { health: null, problems: [error instanceof Error ? error.message : String(error)] };
  }
  console.log(`Attempt ${attempt}: ${last.problems.join('; ')}`);
  await sleep(5_000);
}

if (last.problems.length > 0) {
  console.error(`\n${url} is not healthy: ${last.problems.join('; ')}`);
  if (last.health) console.error(JSON.stringify(last.health, null, 2));
  process.exit(1);
}

const page = await fetch(url, { signal: AbortSignal.timeout(10_000) });
if (page.status !== 200 || !(page.headers.get('content-type') ?? '').includes('text/html')) {
  console.error(`\n${url} did not serve the workspace page (${page.status}).`);
  process.exit(1);
}

const { health } = last;
console.log(`\n${url} is healthy.`);
console.log(`  environment  ${health.environment}`);
console.log(`  commit       ${health.commit.slice(0, 7)}`);
console.log(`  engine       ${health.engine}, document format ${health.documentFormat}`);
console.log(`  known design ${health.selfCheck.cutSizes}`);
console.log(`  database     ${health.database.migrations} migration(s) applied`);
