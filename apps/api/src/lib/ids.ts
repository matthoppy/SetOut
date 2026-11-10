/**
 * Ids.
 *
 * Every row's id is unguessable text with a prefix that says what it is:
 * job_01KA2..., cus_01KA2.... They are safe to show in a link, they sort by
 * the time they were made, and a misplaced one is obvious at a glance.
 *
 * After the prefix: 10 characters of time and 16 of randomness (80 bits), in
 * Crockford base 32, the same layout as a ULID.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const ID_PREFIX = {
  company: 'co',
  designer: 'dsn',
  customer: 'cus',
  job: 'job',
  design: 'dsg',
  revision: 'rev',
  draft: 'drf',
  file: 'fil',
  event: 'evt',
} as const;

export type IdKind = keyof typeof ID_PREFIX;

export function newId(kind: IdKind, nowMs: number = Date.now()): string {
  let time = '';
  let rest = nowMs;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[rest % 32] + time;
    rest = Math.floor(rest / 32);
  }
  let random = '';
  // 256 divides evenly by 32, so the low five bits of a random byte are fair.
  for (const byte of crypto.getRandomValues(new Uint8Array(16))) random += ALPHABET[byte & 31];
  return `${ID_PREFIX[kind]}_${time}${random}`;
}

/** The current time as it is stored: UTC, ISO 8601. */
export function nowIso(): string {
  return new Date().toISOString();
}
