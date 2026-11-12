/**
 * What every page and sheet says about a sliding shower.
 *
 * Sliding doors are on CRL's Serenity, cut to CRL's own installation sheets.
 * No job has been cut from them through SetOut yet, so wherever a sliding
 * shower appears it says its sizes are not confirmed, in the same words. The
 * sizes, the header and what is still to settle all come from the spec, as
 * the engine worked them out (sliding.ts).
 */

import type { ConfiguratorSpec } from '@setout/engine';

export const SLIDING_UNCONFIRMED =
  'Sliding door sizes are not confirmed yet. They are worked out from CRL’s Serenity installation sheets and have not been checked against a job. Check every size and hole against the sheet in the kit’s box before glass is ordered.';

/** The header bar and the set-out of a sliding shower, in a sentence each. */
export function slidingFacts(spec: ConfiguratorSpec): string[] {
  const s = spec.sliding;
  if (!s) return [];
  const [first, second] = s.header.holesFromFixedEndMm;
  return [
    `Opening ${s.overallWidthMm}mm wide, glass to ${s.overallHeightMm}mm. The door closes to the ${s.doorCloses} and laps the fixed panel by ${s.overlapMm}mm, with ${s.wallGapMm}mm at each end.`,
    `Header bar cut to ${s.header.lengthMm}mm, its centre ${s.header.centreHeightMm}mm up from the floor, drilled Ø${s.header.holeDiameterMm} at ${first}mm and ${second}mm from the fixed panel’s end of the opening.`,
    `With the door slid right back the way in is about ${s.clearOpeningMm}mm.`,
  ];
}

/**
 * The notice, printed as well as shown. `detail` adds the header and set-out;
 * `questions` adds what SetOut has stood in for until Matt settles it.
 * Nothing at all for a shower that is not sliding.
 */
export function SlidingNotice({
  spec,
  detail = false,
  questions = false,
  className = '',
}: {
  spec: ConfiguratorSpec;
  detail?: boolean;
  questions?: boolean;
  className?: string;
}) {
  const s = spec.sliding;
  if (!s) return null;
  return (
    <div role="note" className={`border-2 border-black bg-white p-2 text-[12px] leading-snug text-black ${className}`}>
      <p className="font-bold uppercase">Sliding door, CRL Serenity: sizes not confirmed</p>
      <p>{SLIDING_UNCONFIRMED}</p>
      {detail && (
        <ul className="mt-1 list-disc pl-4">
          {slidingFacts(spec).map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      )}
      {questions && s.unconfirmed.length > 0 && (
        <>
          <p className="mt-1 font-semibold">SetOut’s own, still to settle:</p>
          <ul className="list-disc pl-4 text-[11px]">
            {s.unconfirmed.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
