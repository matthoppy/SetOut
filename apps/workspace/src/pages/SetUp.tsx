/**
 * Setting up: a new company's owner is walked through its settings, one part
 * at a time, and ends with the code to paste into its website.
 *
 * Every step but the last is a part of the settings page, with the same form
 * and the same checks on the server, so there is one set of rules. Each part
 * saves on its own, any step can be skipped, and the wizard remembers where
 * the owner had got to.
 */

import { useCallback, useState } from 'react';
import { api, signInAgain, SignedOut, type DesignerSettings, type Me, type Settings as SettingsData } from '../lib/api';
import { useLoad } from '../lib/load';
import { go, Link } from '../lib/router';
import { Problem } from './parts';
import { BrandingPart, EmailsPart, FinishesPart, GlassPart, HandlesPart, HingesPart, NamePart, SlidingPart, UnsavedContext, WebsitesPart } from './Settings';

interface Step {
  id: string;
  /** In the list of steps. */
  name: string;
  title: string;
  about: string;
}

const STEPS: Step[] = [
  { id: 'name', name: 'Your company', title: 'Your company’s name', about: 'This is the name your customers see on the designer and on their quotes.' },
  { id: 'branding', name: 'Colours and logo', title: 'Your colours and logo', about: 'So the designer and your quotes look like part of your own website.' },
  { id: 'finishes', name: 'Finishes', title: 'The finishes you offer', about: 'Your customers choose the finish of their hinges and handle from this list. Start from ours, and add, rename or remove to match what you fit.' },
  { id: 'handles', name: 'Handles', title: 'The handles you offer', about: 'Your customers choose one of these for their door.' },
  { id: 'glass', name: 'Glass', title: 'The glass you offer', about: 'Most companies offer 10mm alone. Offer others only if you make showers in them.' },
  { id: 'hinges', name: 'Hinges', title: 'The hinges you offer', about: 'One standard hinge for each way of hanging a door is enough to start. Offer more styles if your customers should choose.' },
  { id: 'sliding', name: 'Sliding doors', title: 'Sliding doors', about: 'Off unless you make them. Turn it on and your customers are offered the sliding layouts too.' },
  { id: 'emails', name: 'Who is emailed', title: 'Who hears about each design', about: 'A design that arrives is in your inbox here at once. These addresses are emailed it too.' },
  { id: 'websites', name: 'Your website', title: 'Your website’s address', about: 'Tell us where the designer will go. It will show there and nowhere else.' },
  { id: 'embed', name: 'Add it to your website', title: 'Add the designer to your website', about: 'Two lines to paste into the page where customers should design their shower.' },
];

const failed = (error: unknown) => {
  if (error instanceof SignedOut) signInAgain();
};

export function SetUp({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const settings = useLoad<SettingsData>('settings', (signal) => api.settings(signal));
  const [step, setStep] = useState(() => (me.setUp?.done ? 0 : Math.min(me.setUp?.step ?? 0, STEPS.length - 1)));
  const [saved, setSaved] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const reportUnsaved = useCallback((value: boolean) => setUnsaved(value), []);
  const data = settings.data;

  if (me.role !== 'owner') {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
        <h1 className="text-2xl font-bold">Setting up</h1>
        <p className="mt-2 text-quiet">Only an owner can set the company up. You can see how it is set on the settings page.</p>
        <Link to="/settings" className="mt-4 inline-block font-medium text-accent underline underline-offset-2">
          Open the settings
        </Link>
      </div>
    );
  }

  const moveTo = (next: number) => {
    setStep(next);
    setSaved(null);
    setUnsaved(false);
    window.scrollTo(0, 0);
    // Where the owner had got to is kept, so the wizard opens there next time.
    if (!me.setUp?.done) api.saveSetUp({ step: next }).catch(failed);
  };
  const finish = async () => {
    setFinishing(true);
    try {
      await api.saveSetUp({ done: true, step });
      onChanged();
      go('/jobs');
    } catch (error) {
      failed(error);
      setFinishing(false);
    }
  };

  const current = STEPS[step];
  const designer = data?.designers[0];
  const last = step === STEPS.length - 1;
  const part = (name: string) => ({
    owner: true,
    justSaved: saved === name,
    onSaved: () => {
      setSaved(name);
      settings.reload();
      if (name === 'name') onChanged();
    },
    onReload: settings.reload,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-quiet">
        Setting up · Step {step + 1} of {STEPS.length}
      </p>
      <h1 className="mt-1 text-2xl font-bold">{current.title}</h1>
      <p className="mt-1 text-quiet">{current.about}</p>

      <nav aria-label="Steps of setting up" className="mt-4">
        <ol className="flex flex-wrap gap-1.5 text-xs">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => moveTo(i)}
                disabled={unsaved && i !== step}
                aria-current={i === step ? 'step' : undefined}
                className={`rounded-full border px-2.5 py-1 font-medium disabled:opacity-50 ${
                  i === step ? 'border-accent bg-accent text-accent-ink' : i < step ? 'border-rule bg-surface text-ink' : 'border-rule text-quiet'
                }`}
              >
                {i + 1}. {s.name}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {settings.error && !data ? <Problem error={settings.error} retry={settings.reload} /> : null}
      {!data && !settings.error && (
        <p className="pt-6 text-quiet" role="status">
          Loading your settings
        </p>
      )}

      {data && (
        <UnsavedContext.Provider value={reportUnsaved}>
          {current.id === 'name' && <NamePart key={data.company.versions.name} company={data.company} limits={data.limits} {...part('name')} />}
          {current.id === 'branding' && <BrandingPart key={data.company.versions.branding} company={data.company} {...part('branding')} />}
          {!designer && current.id !== 'name' && current.id !== 'branding' && (
            <p className="mt-6 rounded-lg border border-rule bg-surface p-4 text-sm text-quiet">This company has no designer yet. SetOut adds one when the company is set up.</p>
          )}
          {designer && current.id === 'finishes' && <FinishesPart key={designer.versions.finishes} designer={designer} limits={data.limits} {...part('finishes')} />}
          {designer && current.id === 'handles' && <HandlesPart key={designer.versions.handles} designer={designer} limits={data.limits} {...part('handles')} />}
          {designer && current.id === 'glass' && <GlassPart key={designer.versions.glass} designer={designer} limits={data.limits} {...part('glass')} />}
          {designer && current.id === 'hinges' && <HingesPart key={designer.versions.hinges} designer={designer} limits={data.limits} {...part('hinges')} />}
          {designer && current.id === 'sliding' && <SlidingPart key={designer.versions.sliding} designer={designer} limits={data.limits} {...part('sliding')} />}
          {designer && current.id === 'emails' && <EmailsPart key={designer.versions.notifyEmails} designer={designer} limits={data.limits} {...part('emails')} />}
          {designer && current.id === 'websites' && <WebsitesPart key={designer.versions.websites} designer={designer} limits={data.limits} {...part('websites')} />}
          {designer && current.id === 'embed' && <Embed designer={designer} script={data.embedScript} onWebsites={() => moveTo(STEPS.findIndex((s) => s.id === 'websites'))} />}
        </UnsavedContext.Provider>
      )}

      <div className="mt-8 border-t border-rule pt-4">
        {unsaved && (
          <p role="status" className="mb-3 text-sm text-warn">
            Save your changes, or undo them, before moving on.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => moveTo(step - 1)} disabled={step === 0 || unsaved} className="h-11 rounded-md border border-rule bg-surface px-4 font-medium disabled:opacity-50">
            Back
          </button>
          {last ? (
            <button type="button" onClick={finish} disabled={finishing} className="h-11 rounded-md bg-accent px-5 font-semibold text-accent-ink disabled:opacity-50">
              {finishing ? 'Finishing' : 'Finish and open the inbox'}
            </button>
          ) : (
            <button type="button" onClick={() => moveTo(step + 1)} disabled={unsaved} className="h-11 rounded-md bg-accent px-5 font-semibold text-accent-ink disabled:opacity-50">
              Next: {STEPS[step + 1].name}
            </button>
          )}
        </div>
        {!last && (
          <p className="mt-3 text-sm text-quiet">
            Every step can be left as it is and changed later, in Settings.{' '}
            {!me.setUp?.done && (
              <button type="button" onClick={finish} disabled={finishing || unsaved} className="font-medium text-accent underline underline-offset-2 disabled:opacity-50">
                Skip the rest for now
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

const CARD = 'mt-6 rounded-lg border border-rule bg-surface p-4';

/** The two lines that put the designer on a page, with the company's own key in them. */
export function embedCode(siteKey: string, script: string): string {
  return `<div data-setout-designer="${siteKey}"></div>\n<script src="${script}" async></script>`;
}

function Embed({ designer, script, onWebsites }: { designer: DesignerSettings; script: string; onWebsites: () => void }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const code = embedCode(designer.siteKey, script);
  const preview = `${script.replace(/embed\.js$/, '')}?key=${encodeURIComponent(designer.siteKey)}`;
  const test = designer.siteKey.startsWith('pk_test_');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied('yes');
    } catch {
      // A browser that will not copy still lets the code be selected by hand.
      setCopied('no');
    }
  };

  return (
    <>
      <section className={CARD}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-quiet">Your code</h2>
        <pre className="mt-3 overflow-x-auto rounded-md border border-rule bg-ground p-3 text-[13px] leading-relaxed">
          <code>{code}</code>
        </pre>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={copy} className="h-10 rounded-md bg-accent px-4 font-semibold text-accent-ink">
            Copy the code
          </button>
          <a href={preview} target="_blank" rel="noreferrer" className="font-medium text-accent underline underline-offset-2">
            See your designer as customers will
          </a>
        </div>
        <p role="status" className="mt-2 min-h-5 text-sm text-good">
          {copied === 'yes' ? 'Copied. Paste it into your page.' : copied === 'no' ? 'Your browser would not copy it. Select the code above and copy it by hand.' : ''}
        </p>
        <p className="mt-1 text-sm text-quiet">
          The key in it, <span className="break-all font-mono text-[13px] text-ink">{designer.siteKey}</span>, is safe to publish. It says which company the designer belongs to and nothing more.
          {test && ' It is a test key, so it also works on a page on your own computer.'}
        </p>
      </section>

      <section className={CARD}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-quiet">Where it will show</h2>
        {designer.websites.length === 0 ? (
          <p className="mt-3 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">
            No website is listed yet, so the designer will not show anywhere.{' '}
            <button type="button" onClick={onWebsites} className="font-semibold underline underline-offset-2">
              Add your website’s address
            </button>
          </p>
        ) : (
          <>
            <ul className="mt-3 space-y-1 text-sm">
              {designer.websites.map((site) => (
                <li key={site} className="break-all font-medium">
                  {site}
                </li>
              ))}
            </ul>
            <button type="button" onClick={onWebsites} className="mt-2 text-sm font-medium text-accent underline underline-offset-2">
              Change the websites
            </button>
          </>
        )}
      </section>

      <section className={CARD}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-quiet">Where to paste it</h2>
        <p className="mt-3 text-sm">
          Paste both lines where the designer should appear on the page: a page of its own, such as “Design your shower”, works best. It is as wide as the space you give it and
          grows to its own height.
        </p>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-semibold">WordPress</dt>
            <dd className="text-quiet">Edit the page, add a Custom HTML block, and paste the code into it.</dd>
          </div>
          <div>
            <dt className="font-semibold">Wix</dt>
            <dd className="text-quiet">Add, then Embed Code, then Embed HTML. Choose Code and paste it in. Make the box the full width of the page.</dd>
          </div>
          <div>
            <dt className="font-semibold">Squarespace</dt>
            <dd className="text-quiet">Add a Code block to the page, set it to HTML, and paste the code into it.</dd>
          </div>
          <div>
            <dt className="font-semibold">Shopify</dt>
            <dd className="text-quiet">Add a Custom Liquid section to the page and paste the code into it.</dd>
          </div>
          <div>
            <dt className="font-semibold">A site someone built for you</dt>
            <dd className="text-quiet">Send them the two lines. They go in the page’s HTML where the designer should appear, and nothing else is needed.</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-quiet">
          To show a button that opens the designer over the page, add <span className="font-mono text-[13px] text-ink">data-mode="button"</span> to the first line. When a customer sends
          a design it arrives in your inbox here, and the addresses you chose are emailed.
        </p>
      </section>
    </>
  );
}
