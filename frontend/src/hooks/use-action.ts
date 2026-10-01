import { useState } from "react";
import { errorText } from "@/lib/errors.ts";

/** Runs an async action with a busy flag and a user-facing error. Resolves to undefined on failure. */
export function useAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (...args: A): Promise<R | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn(...args);
    } catch (e) {
      setError(errorText(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}
