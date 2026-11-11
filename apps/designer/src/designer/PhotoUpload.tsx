/**
 * Loose photos of the room, added at the end.
 *
 * Separate from the ones taken against each measurement: those show a tape in
 * place and back up a number, these show the room. Between them they catch
 * the kerb, the pipework, the window in the return wall and the ceiling that
 * drops — the things a customer stops seeing in their own bathroom.
 *
 * Only the 'extra' slot is managed here. The per-measurement photos belong to
 * the Measure step and are left alone.
 */

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ImagePlus, Loader2, X } from 'lucide-react';
import {
  createPhoto,
  releasePhoto,
  MAX_EXTRA_PHOTOS,
  type Photo,
} from './photos';

export function PhotoUpload({
  photos,
  onChange,
}: {
  /** Every photo on the enquiry, of any slot. */
  photos: Photo[];
  onChange: (photos: Photo[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);

  const extras = photos.filter((p) => p.slot === 'extra');
  const fromMeasuring = photos.length - extras.length;
  const room = MAX_EXTRA_PHOTOS - extras.length;

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setFailed([]);

    const accepted: Photo[] = [];
    const rejected: string[] = [];

    for (const file of Array.from(files).slice(0, room)) {
      const photo = await createPhoto(file, 'extra', extras.length + accepted.length + 1);
      if (photo) accepted.push(photo);
      else rejected.push(file.name);
    }

    onChange([...photos, ...accepted]);
    setFailed(rejected);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = (id: string) => {
    releasePhoto(photos.find((p) => p.id === id));
    onChange(photos.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-semibold">Any other photos (optional)</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {fromMeasuring > 0
            ? `You have already attached ${fromMeasuring} ${
                fromMeasuring === 1 ? 'photo' : 'photos'
              } while measuring. If there is anything else we should see — the tray, the pipework, a sloping ceiling — add it here.`
            : 'Anything we should see before we quote: the tray, the pipework, a sloping ceiling, a window in the way.'}{' '}
          Up to {MAX_EXTRA_PHOTOS}.
        </p>
      </div>

      {extras.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {extras.map((photo, i) => (
            <li key={photo.id} className="group relative overflow-hidden rounded border">
              <img
                src={photo.previewUrl}
                alt={`The opening, photo ${i + 1}`}
                className="aspect-square w-full object-cover"
              />
              <button
                type="button"
                onClick={() => remove(photo.id)}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-foreground shadow-sm transition-opacity hover:bg-background"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {failed.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          We could not read {failed.join(', ')}. Everything else was added — try those again as
          a JPEG or PNG if you want them included.
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy || room <= 0}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Adding
          </>
        ) : (
          <>
            <ImagePlus className="mr-2 h-4 w-4" />
            {extras.length ? 'Add another' : 'Add photos'}
          </>
        )}
      </Button>
      {room <= 0 && (
        <p className="text-xs text-muted-foreground">
          That is the {MAX_EXTRA_PHOTOS} we can attach here. Remove one to swap it.
        </p>
      )}
    </div>
  );
}
