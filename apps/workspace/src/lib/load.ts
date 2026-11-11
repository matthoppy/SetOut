/**
 * Loading something for a screen. While a new key loads, what was there stays
 * on screen, so moving between stages or searching does not flash empty.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface Loaded<T> {
  key: string;
  data?: T;
  error?: unknown;
}

export function useLoad<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<Loaded<T> | null>(null);
  const [version, setVersion] = useState(0);
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });

  useEffect(() => {
    const controller = new AbortController();
    loader.current(controller.signal).then(
      (data) => setState({ key, data }),
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ key, error });
      }
    );
    return () => controller.abort();
  }, [key, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const current = state?.key === key ? state : null;
  return {
    data: current?.data ?? state?.data,
    error: current?.error,
    loading: current === null,
    reload,
  };
}
