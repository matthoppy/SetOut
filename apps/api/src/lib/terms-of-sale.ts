/**
 * The terms of sale on the order confirmation page, section 6.
 *
 * The default is Custom Showers' own wording, exactly as Matt approved it in
 * the page's reference (16 November 2026). Do not reword it here without his
 * say. A company can have its own terms, saved in its settings as
 * `termsOfSale`: a list of { title, text }. Whatever is shown is identified by
 * a hash of its exact wording, and the customer's acceptance is saved with
 * that version, so what they agreed to can always be told apart from a later
 * edit.
 */

export interface TermsItem {
  /** Shown in bold, ending with a full stop: "Made to measure." */
  title: string;
  text: string;
}

export interface TermsOfSale {
  items: TermsItem[];
  /** "sha256:" and the first 16 hex characters of the hash of the exact wording. */
  version: string;
  /** Where the wording came from. */
  source: 'default' | 'company';
}

export const DEFAULT_TERMS: readonly TermsItem[] = [
  {
    title: 'Made to measure.',
    text: 'Your glass is cut and toughened to your measurements. Because it is made to your specification, the usual 14-day right to cancel for online orders does not apply.',
  },
  {
    title: 'Cancelling.',
    text: "You can cancel for a full refund until we place your glass order with our supplier, which is usually within 1 working day of payment. After that the order can't be cancelled or refunded.",
  },
  {
    title: 'Your measurements.',
    text: "You're responsible for the measurements you've given. If the glass doesn't fit because a measurement was wrong, a replacement is a new order at your cost.",
  },
  {
    title: 'Delivery and damage.',
    text: "Delivery is kerbside. Please check the glass when it arrives and tell us within 48 hours, with photos, if anything is damaged or not as ordered. We'll replace it free of charge.",
  },
  {
    title: 'Faulty goods.',
    text: "This doesn't affect your statutory rights if the glass or hardware is faulty.",
  },
  {
    title: 'Lead time.',
    text: "Typically around 2 weeks from payment. We'll keep you updated if it changes.",
  },
  {
    title: 'Payment.',
    text: 'Full payment is taken upfront by card. No VAT is charged, as Custom Showers is not VAT registered.',
  },
];

/** The words of the third box, which the customer must tick. */
export const TERMS_CHECKBOX =
  "I've read and agree to the terms of sale above, including that the order can't be cancelled or refunded once the glass has been ordered.";

const MAX_ITEMS = 20;
const MAX_TEXT = 1000;

/** A company's own terms from its settings, if they are a usable list; otherwise null. */
function companyTerms(settings: unknown): TermsItem[] | null {
  const raw = (settings as { termsOfSale?: unknown } | null)?.termsOfSale;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) return null;
  const items: TermsItem[] = [];
  for (const item of raw) {
    const title = typeof item?.title === 'string' ? item.title.trim() : '';
    const text = typeof item?.text === 'string' ? item.text.trim() : '';
    if (!text || title.length > 200 || text.length > MAX_TEXT) return null;
    items.push({ title, text });
  }
  return items;
}

export async function termsVersion(items: readonly TermsItem[]): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(items.map((i) => [i.title, i.text]))));
  return `sha256:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)}`;
}

/** The terms a company's customers are shown: its own, or the default. */
export async function termsFor(companySettings: unknown): Promise<TermsOfSale> {
  const own = companyTerms(companySettings);
  const items = own ?? [...DEFAULT_TERMS];
  return { items, version: await termsVersion(items), source: own ? 'company' : 'default' };
}
