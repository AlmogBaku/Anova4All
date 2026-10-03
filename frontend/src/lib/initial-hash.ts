// The URL fragment as the page loaded, captured before supabase-js reads and
// clears auth callbacks from it. Import this first in main.tsx.
export const INITIAL_HASH =
  typeof window === "undefined" ? "" : window.location.hash;

/** An auth error Supabase put in the fragment (e.g. an expired email link). */
export function authErrorFromHash(hash: string): string | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  return p.get("error_description") ?? p.get("error");
}
