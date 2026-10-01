import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inFrame, oauthApi, trustedRedirect } from "./oauth.ts";

describe("trustedRedirect", () => {
  it("accepts the exact https app hosts and http loopback", () => {
    for (const u of [
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.com/cb",
      "https://chatgpt.com/connector_platform_oauth_redirect",
      "http://localhost:6274/oauth/callback",
      "http://127.0.0.1:33418/cb",
      "http://[::1]:8080/cb",
    ]) {
      expect(trustedRedirect(u), u).toBe(true);
    }
  });

  it("refuses look-alikes, plain http, other schemes and junk", () => {
    for (const u of [
      "https://evilclaude.ai/cb",
      "https://claude.ai.evil.test/cb",
      "https://sub.claude.ai/cb",
      "http://claude.ai/cb",
      "https://claude.ai:8443/cb",
      "https://user@claude.ai/cb",
      "http://localhost.evil.test/cb",
      "javascript:alert(1)",
      "claude.ai",
      "",
    ]) {
      expect(trustedRedirect(u), u).toBe(false);
    }
  });
});

describe("inFrame", () => {
  it("is false at the top and true when framed or the parent is cross-origin", () => {
    const top = {} as Window;
    expect(inFrame({ self: top, top } as unknown as Window)).toBe(false);
    expect(inFrame({ self: top, top: {} } as unknown as Window)).toBe(true);
    const crossOrigin = {
      self: top,
      get top(): Window {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    expect(inFrame(crossOrigin as unknown as Window)).toBe(true);
  });
});

describe("oauthApi", () => {
  const fake = (oauth: Record<string, unknown>) =>
    ({ auth: { oauth } }) as unknown as SupabaseClient;

  it("returns only the URL Supabase gives after a decision, without redirecting itself", async () => {
    const approveAuthorization = vi.fn().mockResolvedValue({
      data: { redirect_url: "https://claude.ai/cb?code=x" },
      error: null,
    });
    const denyAuthorization = vi.fn().mockResolvedValue({
      data: { redirect_url: "https://claude.ai/cb?error=access_denied" },
      error: null,
    });
    const api = oauthApi(fake({ approveAuthorization, denyAuthorization }));
    expect(await api.approve("auth-1")).toBe("https://claude.ai/cb?code=x");
    expect(approveAuthorization).toHaveBeenCalledWith("auth-1", {
      skipBrowserRedirect: true,
    });
    expect(await api.deny("auth-1")).toBe(
      "https://claude.ai/cb?error=access_denied",
    );
    expect(denyAuthorization).toHaveBeenCalledWith("auth-1", {
      skipBrowserRedirect: true,
    });
  });

  it("fails rather than navigating when no redirect comes back", async () => {
    const api = oauthApi(
      fake({
        approveAuthorization: vi
          .fn()
          .mockResolvedValue({ data: null, error: { message: "expired" } }),
      }),
    );
    await expect(api.approve("auth-1")).rejects.toThrow("expired");
  });

  it("tells a consent request from an already-approved redirect", async () => {
    const getAuthorizationDetails = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          authorization_id: "auth-1",
          redirect_uri: "https://claude.ai/cb",
          client: { id: "c1", name: "Claude", uri: "", logo_uri: "" },
          user: { id: "u", email: "alice@example.test" },
          scope: "openid",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { redirect_url: "https://claude.ai/cb?code=y" },
        error: null,
      });
    const api = oauthApi(fake({ getAuthorizationDetails }));
    expect(await api.details("auth-1")).toEqual({
      kind: "consent",
      authorizationId: "auth-1",
      clientName: "Claude",
      redirectUri: "https://claude.ai/cb",
      scope: "openid",
    });
    expect(await api.details("auth-1")).toEqual({
      kind: "redirect",
      url: "https://claude.ai/cb?code=y",
    });
  });

  it("lists and revokes connected apps", async () => {
    const listGrants = vi.fn().mockResolvedValue({
      data: [
        {
          client: { id: "c1", name: "Claude", uri: "", logo_uri: "" },
          scopes: [],
          granted_at: "2026-10-01T00:00:00Z",
        },
      ],
      error: null,
    });
    const revokeGrant = vi.fn().mockResolvedValue({ data: {}, error: null });
    const api = oauthApi(fake({ listGrants, revokeGrant }));
    expect(await api.apps()).toEqual([
      { clientId: "c1", name: "Claude", grantedAt: "2026-10-01T00:00:00Z" },
    ]);
    await api.revoke("c1");
    expect(revokeGrant).toHaveBeenCalledWith({ clientId: "c1" });
  });
});
