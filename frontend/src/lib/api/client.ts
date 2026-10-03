import { ApiError, apiErrorFrom } from "./errors.ts";
import type {
  DeviceStatus,
  PairResult,
  ServerInfo,
  StartCook,
  UpdateCook,
} from "./types.ts";

/** Where the client gets the Supabase access token. Tokens are never logged. */
export interface TokenSource {
  /** Current access token, or null when signed out. */
  getAccessToken(): Promise<string | null>;
  /** Refreshes the session; resolves with the new access token or null. */
  refresh(): Promise<string | null>;
  /** Called when a refreshed token is still refused. */
  signOut(): Promise<void>;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenSource;
  fetch?: typeof fetch;
}

/**
 * Typed fetch wrapper for the Go API. Every request carries the bearer token;
 * on 401 it refreshes the session once and retries once, then signs out.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly tokens: TokenSource;
  private readonly fetchImpl: typeof fetch;
  private refreshing: Promise<string | null> | null = null;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.tokens = opts.tokens;
    this.fetchImpl = opts.fetch ?? ((...args) => globalThis.fetch(...args));
  }

  /**
   * Authorized fetch returning the raw response (used for the SSE stream).
   * Throws ApiError("network") if no response arrives, and
   * ApiError("unauthorized") after the refresh-once retry is refused too.
   */
  async authorizedFetch(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    let token = await this.tokens.getAccessToken();
    if (!token) {
      throw new ApiError(401, "unauthorized", "Not signed in");
    }
    let res = await this.send(path, init, token);
    if (res.status !== 401) return res;

    // Refresh once (shared by concurrent callers), retry once.
    await discard(res);
    token = await this.refreshOnce();
    if (token) {
      res = await this.send(path, init, token);
      if (res.status !== 401) return res;
      await discard(res);
    }
    await this.tokens.signOut().catch(() => {});
    throw new ApiError(401, "unauthorized", "Your session has ended");
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await this.authorizedFetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw await apiErrorFrom(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  serverInfo(signal?: AbortSignal): Promise<ServerInfo> {
    return this.request("GET", "/api/server-info", undefined, signal);
  }

  async listDevices(signal?: AbortSignal): Promise<DeviceStatus[]> {
    const r = await this.request<{ devices: DeviceStatus[] }>(
      "GET",
      "/api/devices",
      undefined,
      signal,
    );
    return r.devices ?? [];
  }

  getDevice(deviceId: string, signal?: AbortSignal): Promise<DeviceStatus> {
    return this.request(
      "GET",
      `/api/devices/${enc(deviceId)}`,
      undefined,
      signal,
    );
  }

  pair(idCard: string, key: string, signal?: AbortSignal): Promise<PairResult> {
    return this.request(
      "POST",
      "/api/devices/pair",
      { id_card: idCard, key },
      signal,
    );
  }

  startCook(deviceId: string, body: StartCook): Promise<DeviceStatus> {
    return this.request("POST", `/api/devices/${enc(deviceId)}/cook`, body);
  }

  updateCook(deviceId: string, body: UpdateCook): Promise<DeviceStatus> {
    return this.request("PATCH", `/api/devices/${enc(deviceId)}/cook`, body);
  }

  stopCook(deviceId: string): Promise<DeviceStatus> {
    return this.request("POST", `/api/devices/${enc(deviceId)}/cook/stop`);
  }

  private async send(
    path: string,
    init: RequestInit,
    token: string,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    try {
      return await this.fetchImpl(this.baseUrl + path, { ...init, headers });
    } catch (e) {
      if (isAbort(e)) throw e;
      throw new ApiError(0, "network", "Can't reach the server");
    }
  }

  private refreshOnce(): Promise<string | null> {
    if (!this.refreshing) {
      this.refreshing = this.tokens
        .refresh()
        .catch(() => null)
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

export function isAbort(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "name" in e &&
    (e as { name: unknown }).name === "AbortError"
  );
}

async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // ignore
  }
}
