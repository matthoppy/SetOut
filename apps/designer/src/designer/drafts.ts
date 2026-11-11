/**
 * An unfinished design, kept on the server so it can be carried on from
 * another device.
 *
 * A customer often chooses a layout at a computer and measures in the
 * bathroom with a phone. A draft is the design as it stands and where they
 * had got to. It is opened by a link with a long secret in it. It never holds
 * their name, their contact details or their photos.
 */

import { createDocument, type ConfiguratorState } from '@setout/engine';
import type { StepId } from './steps/types';

const API = '/api/designer/drafts';

/** Where the customer had got to. */
export interface DraftProgress {
  stepId: StepId;
  measureCard: number;
  templateId: string | null;
}

/** When the server last saved a draft, and when it will let it go. */
export interface DraftStamp {
  updatedAt: string;
  expiresAt: string;
}

export interface OpenedDraft extends DraftStamp {
  token: string;
  state: ConfiguratorState;
  progress: DraftProgress;
}

/** Why a draft could not be reached. `gone` means it will never be: unknown, or its time ran out. */
export class DraftError extends Error {
  constructor(
    readonly kind: 'gone' | 'unreachable',
    message: string
  ) {
    super(message);
    this.name = 'DraftError';
  }
}

/** What is sent for a draft. */
export function draftBody(state: ConfiguratorState, progress: DraftProgress): string {
  return JSON.stringify({ document: createDocument(state), progress });
}

/** A value written out the same way however its parts happen to be ordered, with nothing unset in it. */
function settled(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(settled);
  if (typeof value !== 'object' || value === null) return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    // Unset and empty mean the same thing in a design: not measured, not chosen.
    if (source[key] !== undefined && source[key] !== null) out[key] = settled(source[key]);
  }
  return out;
}

/**
 * What a draft amounts to, for telling whether two are the same. Two devices
 * build the same design with its parts in a different order, and the server
 * rebuilds it in its own, so the words sent cannot be compared as they are.
 */
export function draftKey(state: ConfiguratorState, progress: DraftProgress): string {
  return JSON.stringify(settled({ design: state, progress }));
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new DraftError('unreachable', 'The saved design could not be reached. Check your connection.');
  }
  if (response.status === 404 || response.status === 410) {
    throw new DraftError('gone', 'That saved design could not be found. It may have run out.');
  }
  if (!response.ok) throw new DraftError('unreachable', 'The saved design could not be reached just now.');
  return (await response.json()) as T;
}

const json = (method: string, body: string): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body });

/** Start a draft. The token that comes back is what opens it. */
export function startDraft(siteKey: string, body: string): Promise<DraftStamp & { token: string }> {
  return call(API, json('POST', JSON.stringify({ siteKey, ...JSON.parse(body) })));
}

/** Save a draft as it now stands. */
export function saveDraft(token: string, body: string): Promise<DraftStamp> {
  return call(`${API}/${encodeURIComponent(token)}`, json('PUT', body));
}

/** Open a draft, in the designer it was made in. */
export async function openDraft(token: string, siteKey: string): Promise<OpenedDraft> {
  const found = await call<DraftStamp & { document: { design: ConfiguratorState }; progress: DraftProgress }>(
    `${API}/${encodeURIComponent(token)}?key=${encodeURIComponent(siteKey)}`
  );
  return { token, state: found.document.design, progress: found.progress, updatedAt: found.updatedAt, expiresAt: found.expiresAt };
}

/** The link that opens a draft: this designer's own address, with the key and the token. */
export function draftLink(siteKey: string, token: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('key', siteKey);
  url.searchParams.set('draft', token);
  return url.toString();
}
