import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEVICE_ID,
  TOKEN_A,
  TOKEN_B,
  apiError,
  fakeFetch,
  fakeTokens,
  sseBody,
  status,
  statusEvent,
  type Call,
} from "@/test/fake-api.ts";
import { ApiClient } from "./client.ts";
import {
  BACKOFF_JITTER,
  BACKOFF_MAX_MS,
  BACKOFF_MIN_MS,
  DeviceStream,
  backoffDelay,
  linkView,
} from "./device-stream.ts";
import { SseParser, type SseMessage } from "./sse.ts";

describe("SseParser", () => {
  const stream =
    ": ping\n\n" +
    'event: status\r\ndata: {"a":1}\r\n\r\n' +
    'event: cook_ended\rdata: {"reason":"auto_stop"}\r\r' +
    "data: line1\ndata: line2\nid: 7\n\n" +
    "event: nodata\n\n";

  const expected: SseMessage[] = [
    { kind: "comment", text: "ping" },
    { kind: "event", event: "status", data: '{"a":1}' },
    { kind: "event", event: "cook_ended", data: '{"reason":"auto_stop"}' },
    { kind: "event", event: "message", data: "line1\nline2", id: "7" },
  ];

  it("parses events, multi-line data and comments", () => {
    expect(new SseParser().push(stream)).toEqual(expected);
  });

  it("gives the same result for chunks split at every position", () => {
    for (let i = 0; i <= stream.length; i++) {
      const p = new SseParser();
      const got = [...p.push(stream.slice(0, i)), ...p.push(stream.slice(i))];
      expect(got, `split at ${i}`).toEqual(expected);
    }
  });

  it("gives the same result one character at a time", () => {
    const p = new SseParser();
    const got = [...stream].flatMap((ch) => p.push(ch));
    expect(got).toEqual(expected);
  });

  it("treats a CR at a chunk end followed by LF as one line break", () => {
    const p = new SseParser();
    expect(p.push("data: x\r")).toEqual([]);
    expect(p.push("\n\r")).toEqual([
      { kind: "event", event: "message", data: "x" },
    ]);
    expect(p.push("\n")).toEqual([]);
  });
});

describe("backoffDelay", () => {
  it("starts at 1 s, doubles, caps at 30 s", () => {
    const mid = () => 0.5;
    expect([0, 1, 2, 3, 4, 5, 6, 10].map((a) => backoffDelay(a, mid))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
  });

  it("keeps jitter within ±20% and inside [1 s, 30 s]", () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** attempt);
      for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
        const d = backoffDelay(attempt, () => r);
        expect(d).toBeGreaterThanOrEqual(
          Math.max(BACKOFF_MIN_MS, Math.floor(base * (1 - BACKOFF_JITTER))),
        );
        expect(d).toBeLessThanOrEqual(
          Math.min(BACKOFF_MAX_MS, Math.ceil(base * (1 + BACKOFF_JITTER))),
        );
      }
    }
    // Jitter actually varies the delay.
    expect(backoffDelay(2, () => 0)).not.toBe(backoffDelay(2, () => 0.999));
  });
});

/** A DeviceStream wired to a real ApiClient and a scripted fetch. */
function harness(
  script: (call: Call, n: number) => Response | Promise<Response>,
) {
  const tokens = fakeTokens();
  const f = fakeFetch(script);
  const api = new ApiClient({
    baseUrl: "https://api.example.test",
    tokens: tokens.source,
    fetch: f.fetch,
  });
  const stream = new DeviceStream(api, DEVICE_ID, { random: () => 0.5 });
  return { stream, calls: f.calls, tokens };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe("DeviceStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconnects with exponential backoff after failures", async () => {
    const { stream, calls } = harness(() => {
      throw new TypeError("Failed to fetch");
    });
    stream.start();
    await flush();
    expect(calls).toHaveLength(1);
    expect(stream.getSnapshot().retryInMs).toBe(1000);

    const expectedDelays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    for (let i = 0; i < expectedDelays.length; i++) {
      const delay = expectedDelays[i];
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(calls, `before retry ${i + 1}`).toHaveLength(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls, `after retry ${i + 1}`).toHaveLength(i + 2);
      expect(stream.getSnapshot().retryInMs).toBe(
        expectedDelays[i + 1] ?? 30000,
      );
    }
    stream.stop();
  });

  it("reaches the stream URL with the bearer token and SSE accept header", async () => {
    const body = { current: sseBody() };
    const { stream, calls } = harness((call) => {
      body.current = sseBody(call.init.signal);
      return body.current.response();
    });
    stream.start();
    await flush();
    expect(calls[0].url).toBe(
      `https://api.example.test/api/devices/${DEVICE_ID}/events`,
    );
    expect(calls[0].token).toBe(TOKEN_A);
    expect(new Headers(calls[0].init.headers).get("Accept")).toBe(
      "text/event-stream",
    );
    stream.stop();
  });

  it("tracks online/offline from status events, split chunks and pings", async () => {
    let body = sseBody();
    const { stream } = harness((call) => {
      body = sseBody(call.init.signal);
      return body.response();
    });
    stream.start();
    await flush();
    expect(stream.getSnapshot().connection).toBe("live");
    expect(linkView(stream.getSnapshot())).toBe("connecting"); // no status yet

    const online = statusEvent(status({ online: true }));
    body.write(": ping\n");
    body.write("\n" + online.slice(0, 17));
    await flush();
    expect(stream.getSnapshot().status).toBeNull();
    body.write(online.slice(17));
    await flush();
    expect(stream.getSnapshot().status?.online).toBe(true);
    expect(linkView(stream.getSnapshot())).toBe("online");

    const offline = { ...status({ online: false }), state: undefined };
    body.write(statusEvent(offline));
    await flush();
    expect(stream.getSnapshot().status?.online).toBe(false);
    expect(linkView(stream.getSnapshot())).toBe("cooker_offline");

    body.write('event: cook_ended\ndata: {"reason":"auto_stop"}\n\n');
    await flush();
    expect(stream.getSnapshot().cookEnded).toEqual({
      reason: "auto_stop",
      seq: 1,
    });

    // The stream dropping is distinct from the cooker being offline.
    body.close();
    await flush();
    expect(stream.getSnapshot().connection).toBe("reconnecting");
    expect(linkView(stream.getSnapshot())).toBe("stream_down");
    expect(stream.getSnapshot().status?.online).toBe(false); // last known, stale
    stream.stop();
  });

  it("handles multi-byte characters split across chunks", async () => {
    let body = sseBody();
    const { stream } = harness((call) => {
      body = sseBody(call.init.signal);
      return body.response();
    });
    stream.start();
    await flush();
    const bytes = new TextEncoder().encode(
      statusEvent(status({ name: "Küche" })),
    );
    const cut = bytes.indexOf(0xc3) + 1; // inside "ü"
    body.writeBytes(bytes.slice(0, cut));
    body.writeBytes(bytes.slice(cut));
    await flush();
    expect(stream.getSnapshot().status?.name).toBe("Küche");
    stream.stop();
  });

  it("resets the backoff after a healthy stream", async () => {
    let n = 0;
    let body = sseBody();
    const { stream, calls } = harness((call) => {
      n++;
      if (n <= 3) throw new TypeError("Failed to fetch");
      body = sseBody(call.init.signal);
      return body.response();
    });
    stream.start();
    await flush(); // fail 1 -> 1 s
    await vi.advanceTimersByTimeAsync(1000); // fail 2 -> 2 s
    await vi.advanceTimersByTimeAsync(2000); // fail 3 -> 4 s
    expect(stream.getSnapshot().retryInMs).toBe(4000);
    await vi.advanceTimersByTimeAsync(4000); // opens
    expect(stream.getSnapshot().connection).toBe("live");
    // Healthy for 20 s (pings keep the watchdog quiet), then the server ends it.
    for (let i = 0; i < 2; i++) {
      await vi.advanceTimersByTimeAsync(10_000);
      body.write(": ping\n\n");
    }
    body.close();
    await flush();
    expect(stream.getSnapshot().retryInMs).toBe(1000);
    expect(calls).toHaveLength(4);
    stream.stop();
  });

  it("keeps growing the backoff when streams die right away", async () => {
    let body = sseBody();
    const { stream } = harness((call) => {
      body = sseBody(call.init.signal);
      queueMicrotask(() => body.close());
      return body.response();
    });
    stream.start();
    await flush();
    expect(stream.getSnapshot().retryInMs).toBe(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(stream.getSnapshot().retryInMs).toBe(2000);
    stream.stop();
  });

  it("refreshes the token once on 401 and continues", async () => {
    let body = sseBody();
    const { stream, calls, tokens } = harness((call) => {
      if (call.token === TOKEN_A) return apiError(401, "unauthorized");
      body = sseBody(call.init.signal);
      return body.response();
    });
    stream.start();
    await flush();
    expect(tokens.refreshCalls).toBe(1);
    expect(calls.map((c) => c.token)).toEqual([TOKEN_A, TOKEN_B]);
    expect(stream.getSnapshot().connection).toBe("live");
    stream.stop();
  });

  it("stops as signed out when the refreshed token is refused too", async () => {
    const { stream, calls, tokens } = harness(() =>
      apiError(401, "unauthorized"),
    );
    stream.start();
    await flush();
    expect(stream.getSnapshot().connection).toBe("signed_out");
    expect(tokens.refreshCalls).toBe(1);
    expect(tokens.signOutCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toHaveLength(2);
  });

  it("stops and reports access lost on 403 not_member", async () => {
    const { stream, calls } = harness(() => apiError(403, "not_member"));
    stream.start();
    await flush();
    expect(stream.getSnapshot().connection).toBe("access_lost");
    expect(linkView(stream.getSnapshot())).toBe("access_lost");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toHaveLength(1);
  });

  it("aborts the request on stop and never reconnects", async () => {
    let body = sseBody();
    const { stream, calls } = harness((call) => {
      body = sseBody(call.init.signal);
      return body.response();
    });
    stream.start();
    await flush();
    const signal = calls[0].init.signal!;
    expect(signal.aborted).toBe(false);
    stream.stop();
    expect(signal.aborted).toBe(true);
    expect(stream.getSnapshot().connection).toBe("stopped");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toHaveLength(1);
  });

  it("stop during a backoff wait cancels the pending reconnect", async () => {
    const { stream, calls } = harness(() => {
      throw new TypeError("Failed to fetch");
    });
    stream.start();
    await flush();
    stream.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toHaveLength(1);
  });

  it("treats 45 s without any bytes as a dead link and reconnects", async () => {
    let body = sseBody();
    const { stream, calls } = harness((call) => {
      body = sseBody(call.init.signal);
      return body.response();
    });
    stream.start();
    await flush();
    const first = calls[0].init.signal!;
    await vi.advanceTimersByTimeAsync(44_999);
    expect(first.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(first.aborted).toBe(true);
    expect(stream.getSnapshot().connection).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    stream.stop();
  });
});
