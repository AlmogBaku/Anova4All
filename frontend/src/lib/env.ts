// Build-time configuration. See .env.example.

/** Router basename derived from Vite's `base` (e.g. "/Anova4All/" -> "/Anova4All"). */
export const BASENAME = import.meta.env.BASE_URL.replace(/\/+$/, "") || "/";

/** Absolute URL of an app route, e.g. appUrl("/invite") for links and auth redirects. */
export function appUrl(route: string): string {
  const base = BASENAME === "/" ? "" : BASENAME;
  return `${window.location.origin}${base}${route}`;
}

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "";

export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
