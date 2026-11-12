/**
 * Talking to Stripe, and checking that a message came from Stripe.
 *
 * Written against Stripe's HTTP API with no library: two calls out, Checkout
 * and the billing portal, and one check in, a webhook's signature. Every call
 * takes the function that sends it, so tests hand in a stand-in and nothing
 * in them ever reaches Stripe.
 *
 * SetOut never sees a card. The owner types it on Stripe's own pages.
 */

const API = 'https://api.stripe.com/v1';

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'StripeError';
  }
}

type Params = { [key: string]: string | number | boolean | null | undefined | Params | Params[] };

/** Stripe takes forms, with nested values named in brackets: line_items[0][price]. */
export function formEncode(params: Params, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) value.forEach((item, i) => formEncode(item, `${name}[${i}]`, out));
    else if (typeof value === 'object') formEncode(value, name, out);
    else out.set(name, String(value));
  }
  return out;
}

async function post<T>(secretKey: string, path: string, params: Params, send: typeof fetch): Promise<T> {
  const response = await send(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formEncode(params).toString(),
  });
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!response.ok) {
    // Stripe's own words are for the log, never for the page.
    throw new StripeError(`Stripe answered ${response.status}. ${body.error?.message ?? ''}`.trim().slice(0, 300), response.status);
  }
  return body as T;
}

export interface CheckoutRequest {
  /** Stripe's id for the plan's price. */
  priceId: string;
  companyId: string;
  /** The company's Stripe customer, if it already has one. */
  customerId: string | null;
  /** The owner's address, for a company Stripe has not met. */
  email: string;
  /** When the trial ends, if it has not yet: the first charge waits until then. */
  trialEndsAt: string | null;
  successUrl: string;
  cancelUrl: string;
}

/** The earliest a trial may end, by Stripe's rule: at least 48 hours from now. */
const MIN_TRIAL_MS = 48 * 3_600_000;

/**
 * Start paying for a plan: a Checkout session on Stripe's own page. Answers
 * with the address to send the browser to.
 *
 * The company's id goes with it three ways, so that the webhook that follows
 * can be tied back to the company whichever message arrives first.
 */
export async function createCheckoutSession(secretKey: string, request: CheckoutRequest, send: typeof fetch = fetch, now = new Date()): Promise<{ url: string }> {
  const trialEnd = request.trialEndsAt ? Date.parse(request.trialEndsAt) : NaN;
  const session = await post<{ url?: string }>(
    secretKey,
    '/checkout/sessions',
    {
      mode: 'subscription',
      client_reference_id: request.companyId,
      ...(request.customerId ? { customer: request.customerId } : { customer_email: request.email }),
      line_items: [{ price: request.priceId, quantity: 1 }],
      metadata: { company_id: request.companyId },
      subscription_data: {
        metadata: { company_id: request.companyId },
        // Trial days already had are not given again, and days left are not lost.
        ...(Number.isFinite(trialEnd) && trialEnd - now.getTime() > MIN_TRIAL_MS ? { trial_end: Math.floor(trialEnd / 1000) } : {}),
      },
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
    },
    send
  );
  if (typeof session.url !== 'string' || !session.url.startsWith('https://')) throw new StripeError('Stripe gave no page to pay on.', 502);
  return { url: session.url };
}

/** Stripe's own page for changing the card, the plan, or cancelling. Answers with its address. */
export async function createPortalSession(secretKey: string, customerId: string, returnUrl: string, send: typeof fetch = fetch): Promise<{ url: string }> {
  const session = await post<{ url?: string }>(secretKey, '/billing_portal/sessions', { customer: customerId, return_url: returnUrl }, send);
  if (typeof session.url !== 'string' || !session.url.startsWith('https://')) throw new StripeError('Stripe gave no page to manage billing on.', 502);
  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/** How old a message may be, in seconds. Stripe's own default. */
export const SIGNATURE_TOLERANCE_S = 300;

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}

/** Whether two strings are the same, taking the same time whether or not they are. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The value of a Stripe-Signature header for this body, as Stripe would sign it. Used by tests. */
export async function signStripePayload(secret: string, body: string, atSeconds: number): Promise<string> {
  return `t=${atSeconds},v1=${await hmac(secret, `${atSeconds}.${body}`)}`;
}

/**
 * Whether a webhook's body was signed by Stripe with this secret, recently.
 *
 * The header is `t=<when>,v1=<signature>`, where the signature is the
 * HMAC-SHA256 of `<when>.<body>` with the endpoint's secret. The body must be
 * exactly the bytes that arrived, so it is checked before it is parsed. A
 * header may carry more than one v1 while a secret is being changed.
 */
export async function verifyStripeSignature(
  secret: string | undefined,
  header: string | null | undefined,
  body: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = SIGNATURE_TOLERANCE_S
): Promise<boolean> {
  if (!secret || !header) return false;
  let at: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [name, value] = part.trim().split('=', 2);
    if (name === 't' && /^\d{1,12}$/.test(value ?? '')) at = Number(value);
    if (name === 'v1' && /^[0-9a-f]{64}$/.test(value ?? '')) signatures.push(value);
  }
  if (at === null || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - at) > toleranceSeconds) return false;
  const expected = await hmac(secret, `${at}.${body}`);
  return signatures.some((signature) => sameText(signature, expected));
}
