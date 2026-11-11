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
import { EngineProvider } from './designer/engine';
import { applyBrand } from './lib/brand';

const params = new URLSearchParams(window.location.search);
const siteKey = params.get('key');
const embedded = window.self !== window.top;

if (params.get('theme') === 'dark') document.documentElement.classList.add('dark');

type Loaded = { state: 'loading' } | { state: 'ready'; config: DesignerConfig } | { state: 'failed'; reason: string };

function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadConfig(siteKey)
      .then((config) => {
        if (cancelled) return;
        applyBrand(config.brand);
        setLoaded({ state: 'ready', config });
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
      {loaded.state === 'ready' && engine && (
        <EngineProvider value={engine}>
          <Configurator config={loaded.config} embedded={embedded} />
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
