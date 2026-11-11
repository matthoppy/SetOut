/**
 * One photo, attached to one measurement.
 *
 * `capture="environment"` makes a phone open the rear camera straight away
 * rather than the gallery, which is the point: the customer is standing at
 * the wall with the tape already in place, and the photo is only useful taken
 * at that moment.
 */

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, X } from 'lucide-react';
import { createPhoto, releasePhoto, type Photo, type PhotoSlot } from './photos';

export function PhotoCapture({
  slot,
  prompt,
  photo,
  onChange,
}: {
  slot: PhotoSlot;
  /** What the photo should show, in one short line. */
  prompt: string;
  photo?: Photo;
  onChange: (photo: Photo | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setFailed(false);
    const next = await createPhoto(file, slot);
    if (next) {
      releasePhoto(photo);
      onChange(next);
    } else {
      setFailed(true);
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = () => {
    releasePhoto(photo);
    onChange(null);
  };

  return (
    <div className="rounded border border-dashed p-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => handle(e.target.files?.[0])}
      />

      {photo ? (
        <div className="flex items-center gap-3">
          <img
            src={photo.previewUrl}
            alt={prompt}
            className="h-14 w-14 shrink-0 rounded object-cover"
          />
          <p className="flex-1 text-xs text-muted-foreground">
            Photo attached. We will check it against the number you gave.
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={remove} aria-label="Remove this photo">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{prompt}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding
              </>
            ) : (
              <>
                <Camera className="mr-2 h-4 w-4" />
                Take a photo (optional)
              </>
            )}
          </Button>
          {failed && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              We could not read that image — try again, or carry on without it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
