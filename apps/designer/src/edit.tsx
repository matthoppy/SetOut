/**
 * The staff editor's entry point.
 *
 * Opened from a job in the workspace, on the workspace's own address, at
 * /edit/<job>/<shower>. The browser's staff session comes with every request,
 * so the shower, its company's designer and its rules are fetched from the
 * workspace's routes, and the change is saved through them. Signed out, it
 * goes to the workspace's sign-in page.
 */

import './index.css';
import { createDocument, resolveRuleset, type EngineContext } from '@setout/engine';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DesignerConfig } from './designer/config';
import { EngineProvider } from './designer/engine';
import { hydrateState } from './designer/hydrate';
import { StaffEditor, type StaffSave } from './designer/StaffEditor';
import { applyBrand } from './lib/brand';
import type { ConfiguratorState } from '@setout/engine';

const [, , jobId = '', designId = ''] = window.location.pathname.split('/');
const base = `/api/workspace/jobs/${encodeURIComponent(jobId)}/designs/${encodeURIComponent(designId)}`;
const backHref = `/jobs/${encodeURIComponent(jobId)}`;

interface Editor {
  config: DesignerConfig;
  job: { id: string; reference: string; customer: string | null };
  design: { id: string; label: string };
  revision: { number: number; document: { format: number; design: ConfiguratorState } };
  templateId: string | null;
  /** The thicknesses customers are offered. Staff may choose any, and glass in another is said to be a special. */
  offeredGlassThicknesses?: number[];
}

type Loaded = { state: 'loading' } | { state: 'ready'; editor: Editor; initial: ConfiguratorState } | { state: 'failed'; reason: string };

const signIn = () => window.location.replace('/sign-in');

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (response.status === 401) {
    signIn();
    throw new Error('Please sign in again.');
  }
  return response;
}

function App() {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    call(`${base}/editor`)
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as Editor & { message?: string };
        if (!response.ok) throw new Error(body.message ?? 'This shower could not be opened.');
        if (cancelled) return;
        applyBrand(body.config.brand);
        document.title = `Changing ${body.job.reference}`;
        setLoaded({ state: 'ready', editor: body, initial: hydrateState(body.revision.document.design, body.config) });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoaded({ state: 'failed', reason: error instanceof Error ? error.message : 'This shower could not be opened.' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const engine = useMemo<EngineContext | null>(
    () =>
      loaded.state === 'ready'
        ? {
            rules: resolveRuleset(loaded.editor.config.rules.overrides),
            companyName: loaded.editor.config.brand.name,
            ...(loaded.editor.offeredGlassThicknesses ? { glassThicknessesMm: loaded.editor.offeredGlassThicknesses } : {}),
          }
        : null,
    [loaded]
  );

  if (loaded.state === 'loading') {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground" role="status">
        Opening the shower
      </p>
    );
  }
  if (loaded.state === 'failed' || !engine) {
    return (
      <div className="mx-auto max-w-md p-8 text-center" role="alert">
        <h1 className="text-lg font-bold">The shower could not be opened</h1>
        <p className="mt-2 text-sm text-muted-foreground">{loaded.state === 'failed' ? loaded.reason : ''}</p>
        <a href={backHref} className="mt-4 inline-block text-sm font-medium text-primary underline">
          Back to the job
        </a>
      </div>
    );
  }

  const { editor, initial } = loaded;
  const save = async ({ state, reason, attachments }: StaffSave) => {
    const response = await call(`${base}/revisions`, {
      method: 'POST',
      body: JSON.stringify({ basedOn: editor.revision.number, document: createDocument(state), reason, attachments }),
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) throw new Error(body.message ?? 'The change could not be saved. Please try again.');
    window.location.assign(backHref);
  };

  const named = editor.design.label && editor.design.label !== 'Shower' ? ` · ${editor.design.label}` : '';
  return (
    <EngineProvider value={engine}>
      <StaffEditor
        config={editor.config}
        initial={initial}
        templateId={editor.templateId}
        revision={editor.revision.number}
        title={`${editor.job.reference}${editor.job.customer ? ` · ${editor.job.customer}` : ''}${named}`}
        backHref={backHref}
        onSave={save}
      />
    </EngineProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
