import { DOCUMENT_FORMAT, ENGINE_VERSION, selfCheck, type SelfCheck } from '@setout/engine';
import { useEffect, useState } from 'react';

/** What /api/health answers. */
interface Health {
  ok: boolean;
  environment: string;
  commit: string;
  engine: string;
  documentFormat: number;
  selfCheck: SelfCheck;
  database: { ok: boolean; migrations: number };
}

type Server = { state: 'asking' } | { state: 'answered'; health: Health } | { state: 'silent'; reason: string };

interface Props {
  /** Which app is showing this. */
  app: 'designer' | 'workspace';
  /** One sentence on what this app will be. */
  children: React.ReactNode;
}

/**
 * The page a new deploy is judged by.
 *
 * It runs the engine's known design in this browser, asks the server for the
 * answer its own copy of the engine gives, and says plainly whether the two
 * agree. Real screens replace it as they are built.
 */
export function SystemStatus({ app, children }: Props) {
  const [server, setServer] = useState<Server>({ state: 'asking' });
  const [here] = useState(selfCheck);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const health = (await response.json()) as Health;
        setServer({ state: 'answered', health });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setServer({ state: 'silent', reason: error instanceof Error ? error.message : 'No answer' });
      });
    return () => controller.abort();
  }, []);

  const health = server.state === 'answered' ? server.health : null;
  const agree =
    health !== null &&
    here.ok &&
    health.selfCheck.ok &&
    health.selfCheck.cutSizes === here.cutSizes &&
    health.engine === ENGINE_VERSION &&
    health.documentFormat === DOCUMENT_FORMAT;

  return (
    <main className="so-status">
      <p className="so-status__eyebrow">SetOut {app}</p>
      <h1 className="so-status__title">
        {server.state === 'asking' && 'Checking this deploy'}
        {server.state === 'silent' && 'The server did not answer'}
        {health && agree && health.database.ok && 'Everything agrees'}
        {health && agree && !health.database.ok && 'The database is not ready'}
        {health && !agree && 'The page and the server disagree'}
      </h1>
      <p className="so-status__lead">{children}</p>

      <dl className="so-status__facts">
        <div>
          <dt>Reference design</dt>
          <dd>A 400 panel and a 700 door, 2000 high, in channel</dd>
        </div>
        <div>
          <dt>Cut in this page</dt>
          <dd data-ok={here.ok}>{here.cutSizes}</dd>
        </div>
        <div>
          <dt>Cut on the server</dt>
          <dd data-ok={health ? health.selfCheck.ok && health.selfCheck.cutSizes === here.cutSizes : undefined}>
            {health ? health.selfCheck.cutSizes : server.state === 'silent' ? server.reason : 'Asking'}
          </dd>
        </div>
        <div>
          <dt>Engine</dt>
          <dd data-ok={health ? health.engine === ENGINE_VERSION : undefined}>
            {ENGINE_VERSION} here{health ? `, ${health.engine} on the server` : ''}
          </dd>
        </div>
        <div>
          <dt>Database</dt>
          <dd data-ok={health ? health.database.ok : undefined}>
            {health
              ? health.database.ok
                ? `Connected, ${health.database.migrations} ${health.database.migrations === 1 ? 'migration' : 'migrations'} applied`
                : 'Not ready'
              : 'Asking'}
          </dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{health ? `${health.environment}, commit ${health.commit.slice(0, 7)}` : 'Asking'}</dd>
        </div>
      </dl>
    </main>
  );
}
