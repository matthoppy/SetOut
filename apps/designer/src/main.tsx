/**
 * The designer's entry point.
 *
 * It is opened in a frame on a company's page by the embed script, with that
 * company's site key in the address. It asks the API who the key belongs to,
 * takes on the company's name, colour, options and rules, and shows the
 * designer. With no key it shows a preview that does everything but send.
 */

import './index.css';
import { resolveRuleset, type EngineContext } from '@setout/engine';
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Configurator } from './designer/Configurator';
import { loadConfig, type DesignerConfig } from './designer/config';
import { DraftError, openDraft, type OpenedDraft } from './designer/drafts';
import { EngineProvider } from './designer/engine';
import { applyBrand } from './lib/brand';

const params = new URLSearchParams(window.location.search);
const siteKey = params.get('key');
const embedded = window.self !== window.top;
// In the frame that covers the page, the designer has the whole screen. In a
// frame that grows with its content there is no screen height to fill.
const fillsViewport = !embedded || params.get('mode') === 'full';
// A link from another device opens the design that device was working on.
const draftToken = params.get('draft');

if (params.get('theme') === 'dark') document.documentElement.classList.add('dark');

type Loaded =
  | { state: 'loading' }
  | { state: 'ready'; config: DesignerConfig; resume: OpenedDraft | null; draftProblem: string | null }
  | { state: 'failed'; reason: string };

/** The draft a link asked for, or why it could not be opened. The designer starts either way. */
async function resumeFrom(config: DesignerConfig): Promise<{ resume: OpenedDraft | null; draftProblem: string | null }> {
  if (!draftToken || !config.siteKey) return { resume: null, draftProblem: null };
  try {
    return { resume: await openDraft(draftToken, config.siteKey), draftProblem: null };
  } catch (error) {
    const gone = error instanceof DraftError && error.kind === 'gone';
    return {
      resume: null,
      draftProblem: gone
        ? 'That saved design could not be found. It may have run out. You can start again here.'
        : 'Your saved design could not be reached. Check your connection and reload to try again.',
    };
  }
}

function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadConfig(siteKey)
      .then(async (config) => {
        const draft = await resumeFrom(config);
        if (cancelled) return;
        applyBrand(config.brand);
        setLoaded({ state: 'ready', config, ...draft });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoaded({
          state: 'failed',
          reason: error instanceof Error ? error.message : 'The designer could not start.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Tell the company's page how tall we are, so the frame grows with the
  // content and never shows a scrollbar of its own.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !embedded) return;
    let last = 0;
    const post = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      // A pixel of jitter would otherwise cause an endless resize loop with
      // pages that adjust their layout in response.
      if (Math.abs(height - last) < 2) return;
      last = height;
      window.parent.postMessage({ type: 'setout:height', height }, '*');
    };
    const observer = new ResizeObserver(post);
    observer.observe(el);
    post();
    return () => observer.disconnect();
  }, []);

  const engine = useMemo<EngineContext | null>(() => {
    if (loaded.state !== 'ready') return null;
    return {
      rules: resolveRuleset(loaded.config.rules.overrides),
      companyName: loaded.config.brand.name,
    };
  }, [loaded]);

  return (
    <div ref={rootRef}>
      {loaded.state === 'loading' && (
        <p className="p-8 text-center text-sm text-muted-foreground" role="status">
          Loading the designer
        </p>
      )}
      {loaded.state === 'failed' && (
        <div className="mx-auto max-w-md p-8 text-center" role="alert">
          <h1 className="text-lg font-bold">The designer could not start</h1>
          <p className="mt-2 text-sm text-muted-foreground">{loaded.reason}</p>
        </div>
      )}
      {loaded.state === 'ready' && loaded.draftProblem && (
        <p role="alert" className="border-b bg-muted/40 px-4 py-2 text-center text-xs text-muted-foreground sm:text-sm">
          {loaded.draftProblem}
        </p>
      )}
      {loaded.state === 'ready' && engine && (
        <EngineProvider value={engine}>
          <Configurator config={loaded.config} embedded={embedded} fillsViewport={fillsViewport} resume={loaded.resume} />
        </EngineProvider>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
