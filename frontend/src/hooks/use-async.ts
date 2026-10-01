import { useCallback, useEffect, useRef, useState } from "react";

interface Result<T> {
  key: string;
  nonce: number;
  data?: T;
  error?: unknown;
}

/**
 * Loads data for `key` (null = don't load). Re-runs when the key changes or on
 * reload(); keeps the previous data while reloading.
 */
export function useAsync<T>(key: string | null, load: () => Promise<T>) {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);

  useEffect(() => {
    if (key === null) return;
    let active = true;
    loadRef.current().then(
      (data) => active && setResult({ key, nonce, data }),
      (error: unknown) => active && setResult({ key, nonce, error }),
    );
    return () => {
      active = false;
    };
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const current = result && result.key === key ? result : null;
  return {
    data: current?.data,
    error: current && current.nonce === nonce ? current.error : undefined,
    loading: key !== null && (!current || current.nonce !== nonce),
    reload,
  };
}
