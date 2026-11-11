/**
 * "Carry on on my phone": a link, and a code to point a phone's camera at,
 * that open this design where it now stands on another device.
 *
 * Choosing a layout is comfortable at a computer. Measuring is done standing
 * in a bathroom with a tape in one hand. This is the way across.
 */

import { useMemo, useState } from 'react';
import { Check, Copy, Loader2, Share2, Smartphone } from 'lucide-react';
import { encode } from 'uqr';
import { Button } from '@/components/ui/button';

/** A QR code as plain squares, so it takes the page's colours and needs no image. */
function QrCode({ text, size = 176 }: { text: string; size?: number }) {
  const code = useMemo(() => encode(text, { ecc: 'M', border: 2 }), [text]);
  const cells: string[] = [];
  code.data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) cells.push(`M${x} ${y}h1v1h-1z`);
    })
  );
  return (
    // Always dark on white: a camera reads it whatever the page's theme.
    <svg viewBox={`0 0 ${code.size} ${code.size}`} width={size} height={size} role="img" aria-label="A code to scan with your phone's camera" shapeRendering="crispEdges" className="rounded bg-white">
      <path d={cells.join('')} fill="#0f172a" />
    </svg>
  );
}

export function CarryOn({
  link,
  onStart,
}: {
  /** The link, once there is one. */
  link: string | null;
  /** Make the link. Rejects with a message to show when it cannot be made. */
  onStart: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const show = async () => {
    setOpen(true);
    if (link) return;
    setBusy(true);
    setError(null);
    try {
      await onStart();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The link could not be made. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // No clipboard here. The link is on the screen to copy by hand.
    }
  };

  return (
    <section className="rounded-lg border p-4" aria-labelledby="carry-on-title">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 id="carry-on-title" className="text-sm font-semibold">
            Measuring is easier with your phone in your hand
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Carry on from here on another device. What you do on one shows up on the other.</p>
        </div>
        {!open && (
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={show}>
            Carry on on my phone
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-4 border-t pt-4">
          {busy && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Making your link
            </p>
          )}
          {error && (
            <div role="alert" className="space-y-2 text-sm">
              <p className="text-red-700 dark:text-red-300">{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={show}>
                Try again
              </Button>
            </div>
          )}
          {link && !busy && (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <QrCode text={link} />
              <div className="min-w-0 flex-1 space-y-3 text-sm">
                <p>Point your phone&rsquo;s camera at the code, or send yourself the link. It opens this design where you are now.</p>
                <p className="break-all rounded bg-muted px-2 py-1.5 font-mono text-[11px] leading-snug">{link}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={copy}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? 'Copied' : 'Copy the link'}
                  </Button>
                  {canShare && (
                    <Button type="button" variant="outline" size="sm" onClick={() => navigator.share({ url: link }).catch(() => {})}>
                      <Share2 className="h-4 w-4" />
                      Send it
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  The link works for 30 days. Anyone who has it can open and change this design, so only pass it to someone helping you. It does not hold your name, your details or your photos.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
