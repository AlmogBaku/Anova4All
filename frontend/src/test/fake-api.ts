// Test helpers: a scripted fetch and controllable SSE bodies. Synthetic data only.
import type { TokenSource } from "@/lib/api/client.ts";
import type { DeviceStatus } from "@/lib/api/types.ts";

export const DEVICE_ID = "00000000-0000-4000-8000-000000000001";
export const TOKEN_A = "test-access-token-a";
export const TOKEN_B = "test-access-token-b";

export interface Call {
  url: string;
  init: RequestInit;
  token: string | null;
}

export type Script = (call: Call, n: number) => Response | Promise<Response>;

export function fakeFetch(script: Script) {
  const calls: Call[] = [];
  const fn = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const auth = headers.get("Authorization");
    const call: Call = {
      url: String(input),
      init,
      token: auth?.startsWith("Bearer ") ? auth.slice(7) : null,
    };
    calls.push(call);
    return script(call, calls.length);
  };
  return { fetch: fn as typeof fetch, calls };
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function apiError(status: number, code: string, message = code) {
  return json(status, { error: { code, message } });
}

export function fakeTokens(
  initial: string | null = TOKEN_A,
  refreshed = TOKEN_B,
) {
  const t = {
    current: initial,
    refreshCalls: 0,
    signOutCalls: 0,
    source: {} as TokenSource,
  };
  t.source = {
    getAccessToken: async () => t.current,
    refresh: async () => {
      t.refreshCalls++;
      t.current = refreshed;
      return refreshed;
    },
    signOut: async () => {
      t.signOutCalls++;
      t.current = null;
    },
  };
  return t;
}

/** An SSE response body the test writes to. Errors with AbortError when the request aborts. */
export function sseBody(signal?: AbortSignal | null) {
  const encoder = new TextEncoder();
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
    cancel() {
      closed = true;
    },
  });
  signal?.addEventListener("abort", () => {
    if (closed) return;
    closed = true;
    ctrl.error(new DOMException("The operation was aborted.", "AbortError"));
  });
  return {
    stream,
    response: () =>
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    write(text: string) {
      if (!closed) ctrl.enqueue(encoder.encode(text));
    },
    writeBytes(bytes: Uint8Array) {
      if (!closed) ctrl.enqueue(bytes);
    },
    close() {
      if (closed) return;
      closed = true;
      ctrl.close();
    },
    get closed() {
      return closed;
    },
  };
}

export function status(over: Partial<DeviceStatus> = {}): DeviceStatus {
  return {
    id: DEVICE_ID,
    name: "Anova",
    is_owner: true,
    online: true,
    state: {
      status: "stopped",
      current_temperature: 20,
      target_temperature: 57,
      timer_running: false,
      timer_value: 0,
      unit: "c",
      speaker_status: false,
    },
    ...over,
  };
}

export function statusEvent(s: DeviceStatus): string {
  return `event: status\ndata: ${JSON.stringify(s)}\n\n`;
}
