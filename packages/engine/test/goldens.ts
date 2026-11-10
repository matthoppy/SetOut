import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConfiguratorSpec, DesignDocument } from '../src';

/**
 * A known design with its known cut list.
 *
 * Each file in ./goldens was written by the Custom Showers configurator's own
 * engine before that code was moved here. The document is the input; the spec
 * is what the live engine produced for it. See goldens.test.ts.
 */
export interface Golden {
  name: string;
  title: string;
  source: string;
  document: DesignDocument;
  expected: { spec: ConfiguratorSpec };
}

const dir = join(fileURLToPath(new URL('.', import.meta.url)), 'goldens');

export const GOLDENS: Golden[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Golden);

/** The company and rules every golden was made under. */
export const GOLDEN_COMPANY = 'Custom Showers';

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
