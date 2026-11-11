/**
 * Sending the design.
 *
 * The design document goes to SetOut's API with the customer's details. The
 * server checks the document, runs the engine itself with the company's rules
 * and stores its own answer, so nothing worked out in this browser is trusted.
 *
 * The drawings are rasterised here before sending. Inline SVG is unreliable in
 * mail clients, so the company gets PNG attachments that render anywhere.
 */

import type { CustomerDetails, DesignDocument } from '@setout/engine';
import type { DesignerConfig } from './config';

export interface EnquiryAttachment {
  filename: string;
  /** Base64, no data: prefix. */
  content: string;
  /** A drawing made by the designer, or a photo the customer took. */
  kind: 'drawing' | 'photo';
}

export interface EnquiryRequest {
  siteKey: string;
  document: DesignDocument;
  /** The layout the customer started from, or null for a shape built by hand. */
  templateId: string | null;
  customer: CustomerDetails;
  attachments: EnquiryAttachment[];
  turnstileToken: string | null;
  antispam: AntiSpamSignals;
}

export interface AntiSpamSignals {
  /** Hidden field. Any content means a bot filled it in. */
  honeypot: string;
  /** Milliseconds between opening the configurator and pressing send. */
  elapsedMs: number;
}

/**
 * Rasterise a live <svg> element to a base64 PNG.
 *
 * Scaled 2x so panel dimensions stay legible when the glazier zooms in on a
 * phone. Resolves to null rather than throwing — a missing drawing should
 * never block an enquiry, since the spec table carries the same numbers.
 */
export async function svgToPngBase64(svg: SVGSVGElement, scale = 2): Promise<string | null> {
  try {
    const width = Number(svg.getAttribute('width')) || svg.clientWidth;
    const height = Number(svg.getAttribute('height')) || svg.clientHeight;
    if (!width || !height) return null;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));

    // Mail clients render on white; the app may be on a tinted surface.
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(width));
    bg.setAttribute('height', String(height));
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);

    const source = new XMLSerializer().serializeToString(clone);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;

    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('svg load failed'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/png').split(',')[1] ?? null;
  } catch {
    return null;
  }
}

export interface SubmitResult {
  ok: boolean;
  /** The company's reference for the new job, such as CS-1042. */
  reference?: string;
  error?: string;
}

const ENDPOINT = '/api/designer/enquiries';

export async function sendDesign(
  config: DesignerConfig,
  request: Omit<EnquiryRequest, 'siteKey'>
): Promise<SubmitResult> {
  if (!config.siteKey) {
    return { ok: false, error: 'This is a preview of the designer, so nothing is sent.' };
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...request, siteKey: config.siteKey } satisfies EnquiryRequest),
    });
    const body = (await res.json().catch(() => null)) as { reference?: string; message?: string } | null;
    if (!res.ok) {
      // The API gives a readable reason for the cases a customer can act on,
      // like failing the bot check or a measurement it will not accept.
      console.error(`[designer] ${ENDPOINT} returned ${res.status}`, body);
      return { ok: false, error: body?.message ?? `Send failed (${res.status})` };
    }
    return { ok: true, reference: body?.reference };
  } catch (e) {
    // fetch only throws before it gets a reply at all. That is a different
    // fault from the server refusing, so say so in the console.
    console.error(`[designer] could not reach ${ENDPOINT}`, e);
    return { ok: false, error: 'We could not reach our server. Check your connection and try again.' };
  }
}
