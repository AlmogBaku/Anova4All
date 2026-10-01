// The OAuth consent flow and connected apps, through the Supabase OAuth server.
// Approve is offered only to known app hosts and never inside a frame.
import type { SupabaseClient } from "@supabase/supabase-js";

const TRUSTED_HOSTS = ["claude.ai", "claude.com", "chatgpt.com"];
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

/** Whether a client's redirect URI may receive an approval: exact https hosts, or http loopback. */
export function trustedRedirect(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  if (u.protocol === "https:")
    return TRUSTED_HOSTS.includes(u.hostname) && u.port === "";
  if (u.protocol === "http:") return LOOPBACK.includes(u.hostname);
  return false;
}

/** The host shown to the user next to the app's name. */
export function redirectHost(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return uri;
  }
}

export function inFrame(win: Window = window): boolean {
  try {
    return win.self !== win.top;
  } catch {
    return true; // cross-origin parent
  }
}

export interface ConsentRequest {
  kind: "consent";
  authorizationId: string;
  clientName: string;
  redirectUri: string;
  scope: string;
}

export type ConsentDetails = ConsentRequest | { kind: "redirect"; url: string };

export interface ConnectedApp {
  clientId: string;
  name: string;
  grantedAt: string;
}

export class OAuthError extends Error {}

export function oauthApi(sb: SupabaseClient) {
  const decide = async (id: string, approve: boolean): Promise<string> => {
    const fn = approve
      ? sb.auth.oauth.approveAuthorization
      : sb.auth.oauth.denyAuthorization;
    const { data, error } = await fn.call(sb.auth.oauth, id, {
      skipBrowserRedirect: true,
    });
    if (error || !data?.redirect_url)
      throw new OAuthError(error?.message ?? "No redirect returned");
    return data.redirect_url;
  };
  return {
    async details(authorizationId: string): Promise<ConsentDetails> {
      const { data, error } =
        await sb.auth.oauth.getAuthorizationDetails(authorizationId);
      if (error || !data)
        throw new OAuthError(error?.message ?? "Request not found");
      if ("authorization_id" in data) {
        return {
          kind: "consent",
          authorizationId: data.authorization_id,
          clientName: data.client.name,
          redirectUri: data.redirect_uri,
          scope: data.scope,
        };
      }
      return { kind: "redirect", url: data.redirect_url };
    },
    /** Returns the URL Supabase says to go to next; the caller navigates there and nowhere else. */
    approve: (id: string) => decide(id, true),
    deny: (id: string) => decide(id, false),
    async apps(): Promise<ConnectedApp[]> {
      const { data, error } = await sb.auth.oauth.listGrants();
      if (error) throw new OAuthError(error.message);
      return (data ?? []).map((g) => ({
        clientId: g.client.id,
        name: g.client.name,
        grantedAt: g.granted_at,
      }));
    },
    async revoke(clientId: string): Promise<void> {
      const { error } = await sb.auth.oauth.revokeGrant({ clientId });
      if (error) throw new OAuthError(error.message);
    },
  };
}
