/**
 * The step-by-step fitting guide, printed after a shower's installation sheet:
 * in the workspace, where staff read it before it goes to a customer, and on
 * the customer's own page, where their fitter reads it. Both draw it with
 * this, from the engine's steps, so they cannot say different things.
 */

import type { FittingStep } from '@setout/engine';

export function FittingGuide({ title, reference, steps, notes }: { title: string; reference: string; steps: FittingStep[]; notes?: string | null }) {
  return (
    <div className="border border-black">
      <header className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3 border-b border-black px-2 py-1.5">
        <h1 className="text-[17px] font-bold uppercase">Fitting guide</h1>
        <p className="text-center text-[17px] font-bold">{title}</p>
        <p className="text-right text-[17px] font-bold">{reference}</p>
      </header>
      <p className="border-b border-black px-2 py-1.5 text-[12px]">
        Read this through before you start. Every size here is on the installation sheet, which is the one to follow if they ever differ.
      </p>
      <ol className="divide-y divide-black/30">
        {steps.map((step, i) => (
          <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-2 px-2 py-1.5 [break-inside:avoid]">
            <span className="text-[17px] font-bold tabular-nums">{i + 1}</span>
            <div>
              <h2 className="text-[13px] font-bold uppercase">{step.title}</h2>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[12px]">
                {step.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
      {notes && notes.trim() && (
        <section className="border-t border-black px-2 py-1.5">
          <h2 className="text-[13px] font-bold uppercase">For this job</h2>
          <p className="mt-0.5 whitespace-pre-line text-[12px]">{notes}</p>
        </section>
      )}
    </div>
  );
}
