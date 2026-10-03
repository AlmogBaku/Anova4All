import { describe, expect, it } from "vitest";
import {
  DEVICE_ID,
  TOKEN_A,
  TOKEN_B,
  apiError,
  fakeFetch,
  fakeTokens,
  json,
  status,
} from "@/test/fake-api.ts";
import { ApiClient } from "./client.ts";
import { ApiError } from "./errors.ts";

const BASE = "https://api.example.test";

function client(
  script: Parameters<typeof fakeFetch>[0],
  tokens = fakeTokens(),
) {
  const f = fakeFetch(script);
  return {
    api: new ApiClient({
      baseUrl: BASE + "/",
      tokens: tokens.source,
      fetch: f.fetch,
    }),
    calls: f.calls,
    tokens,
  };
}

async function rejection(p: Promise<unknown>): Promise<ApiError> {
  const e = await p.then(
    () => undefined,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiError);
  return e as ApiError;
}

describe("ApiClient", () => {
  it("sends the bearer token and parses JSON", async () => {
    const { api, calls } = client(() => json(200, status()));
    const s = await api.getDevice(DEVICE_ID);
    expect(s.id).toBe(DEVICE_ID);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/api/devices/${DEVICE_ID}`);
    expect(calls[0].token).toBe(TOKEN_A);
  });

  it("sends JSON bodies with the right method and path", async () => {
    const { api, calls } = client(() => json(200, status()));
    await api.updateCook(DEVICE_ID, { minutes: 90 });
    expect(calls[0].init.method).toBe("PATCH");
    expect(calls[0].url).toBe(`${BASE}/api/devices/${DEVICE_ID}/cook`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ minutes: 90 });
  });

  it("on 401 refreshes the session once and retries once with the new token", async () => {
    const { api, calls, tokens } = client((call) =>
      call.token === TOKEN_A
        ? apiError(401, "unauthorized")
        : json(200, { devices: [] }),
    );
    await expect(api.listDevices()).resolves.toEqual([]);
    expect(tokens.refreshCalls).toBe(1);
    expect(tokens.signOutCalls).toBe(0);
    expect(calls.map((c) => c.token)).toEqual([TOKEN_A, TOKEN_B]);
  });

  it("signs out when the refreshed token is refused too, without looping", async () => {
    const { api, calls, tokens } = client(() => apiError(401, "unauthorized"));
    const e = await rejection(api.listDevices());
    expect(e.code).toBe("unauthorized");
    expect(e.status).toBe(401);
    expect(calls).toHaveLength(2);
    expect(tokens.refreshCalls).toBe(1);
    expect(tokens.signOutCalls).toBe(1);
  });

  it("shares one refresh between concurrent 401s", async () => {
    const { api, tokens } = client((call) =>
      call.token === TOKEN_A
        ? apiError(401, "unauthorized")
        : json(200, status()),
    );
    await Promise.all([api.getDevice(DEVICE_ID), api.getDevice(DEVICE_ID)]);
    expect(tokens.refreshCalls).toBe(1);
  });

  it("does not call the server without a session", async () => {
    const tokens = fakeTokens(null);
    const { api, calls } = client(() => json(200, {}), tokens);
    const e = await rejection(api.serverInfo());
    expect(e.code).toBe("unauthorized");
    expect(calls).toHaveLength(0);
  });

  it.each([
    [409, "device_offline"],
    [409, "key_mismatch"],
    [409, "cook_in_progress"],
    [409, "no_active_cook"],
    [403, "not_member"],
    [403, "owner_only"],
    [400, "invalid_input"],
    [429, "rate_limited"],
    [500, "internal"],
  ])("maps %i %s to a typed ApiError", async (code, name) => {
    const { api } = client(() => apiError(code, name, `message for ${name}`));
    const e = await rejection(
      api.startCook(DEVICE_ID, { temperature: 57, unit: "c" }),
    );
    expect(e.status).toBe(code);
    expect(e.code).toBe(name);
    expect(e.message).toBe(`message for ${name}`);
  });

  it("maps unknown bodies and network failures", async () => {
    const html = client(() => new Response("<html>", { status: 502 }));
    const e1 = await rejection(html.api.stopCook(DEVICE_ID));
    expect(e1.code).toBe("unknown");
    expect(e1.status).toBe(502);

    const down = client(() => {
      throw new TypeError("Failed to fetch");
    });
    const e2 = await rejection(down.api.stopCook(DEVICE_ID));
    expect(e2.code).toBe("network");
    expect(e2.status).toBe(0);
  });
});
