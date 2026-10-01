import { API_URL } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import { ApiClient, type TokenSource } from "./client.ts";

const supabaseTokens: TokenSource = {
  async getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
  async refresh() {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  },
  async signOut() {
    await supabase.auth.signOut();
  },
};

/** The app's Go API client, authenticated with the Supabase session. */
export const api = new ApiClient({ baseUrl: API_URL, tokens: supabaseTokens });

export { ApiClient } from "./client.ts";
export type { TokenSource } from "./client.ts";
export * from "./errors.ts";
export * from "./types.ts";
export * from "./device-stream.ts";
