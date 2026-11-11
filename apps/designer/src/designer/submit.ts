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

/** A copy of a drawing that carries its own colours, for use as a picture away from the page. */
function withOwnColours(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originals = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const copies = [clone, ...Array.from(clone.querySelectorAll('*'))];
  originals.forEach((original, i) => {
    for (const attribute of ['fill', 'stroke']) {
      // A colour taken from the page's styles means nothing in a picture on its own.
      if (copies[i]?.getAttribute(attribute)?.includes('var(')) {
        copies[i].setAttribute(attribute, getComputedStyle(original).getPropertyValue(attribute));
      }
    }
  });
  return clone;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'sync';
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('picture load failed'));
    img.src = url;
  });
}

/**
 * One PNG of every drawing inside an element, top to bottom, with the
 * headings and notes between them. Used for the measuring drawings, which
 * are several small drawings that belong on one sheet.
 *
 * Resolves to null rather than throwing, like svgToPngBase64: a missing
 * drawing must never stop a design being sent.
 */
export async function drawingsToPngBase64(container: HTMLElement, scale = 2): Promise<string | null> {
  try {
    const parts = Array.from(container.querySelectorAll<HTMLElement | SVGSVGElement>('svg, [data-drawing-title], figcaption'));
    const width = Math.max(...parts.map((p) => p.clientWidth), 0);
    if (!width) return null;

    const pad = 12;
    const sheet = document.createElement('canvas');
    const measure = sheet.getContext('2d');
    if (!measure) return null;

    // Lay it out first: a picture or some lines of words, each with its height.
    const rows: ({ image: HTMLImageElement; w: number; h: number } | { lines: string[]; font: string; lineHeight: number })[] = [];
    for (const part of parts) {
      if (part instanceof SVGSVGElement) {
        const w = part.clientWidth;
        const h = part.clientHeight;
        if (!w || !h) continue;
        const clone = withOwnColours(part);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('width', String(w));
        clone.setAttribute('height', String(h));
        const source = new XMLSerializer().serializeToString(clone);
        rows.push({ image: await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`), w, h });
      } else {
        const title = part.hasAttribute('data-drawing-title');
        const font = title ? '600 14px system-ui, sans-serif' : '12px system-ui, sans-serif';
        measure.font = font;
        const lines: string[] = [];
        let line = '';
        for (const word of (part.textContent ?? '').trim().split(/\s+/)) {
          const next = line ? `${line} ${word}` : word;
          if (line && measure.measureText(next).width > width - pad * 2) {
            lines.push(line);
            line = word;
          } else {
            line = next;
          }
        }
        if (line) lines.push(line);
        rows.push({ lines, font, lineHeight: title ? 22 : 17 });
      }
    }
    if (!rows.some((r) => 'image' in r)) return null;

    const height = rows.reduce((sum, r) => sum + ('image' in r ? r.h : r.lines.length * r.lineHeight + 8), pad * 2);
    sheet.width = (width + pad * 2) * scale;
    sheet.height = height * scale;
    const ctx = sheet.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width + pad * 2, height);
    let y = pad;
    for (const row of rows) {
      if ('image' in row) {
        ctx.drawImage(row.image, pad, y, row.w, row.h);
        y += row.h;
      } else {
        ctx.font = row.font;
        ctx.fillStyle = '#334155';
        ctx.textBaseline = 'top';
        y += 4;
        for (const text of row.lines) {
          ctx.fillText(text, pad, y);
          y += row.lineHeight;
        }
        y += 4;
      }
    }
    return sheet.toDataURL('image/png').split(',')[1] ?? null;
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
