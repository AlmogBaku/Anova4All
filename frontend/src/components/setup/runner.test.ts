// Check 14: setup order, Wi-Fi handling, pair polling and key hygiene.
// Real BleClient over the fake GATT, real ApiClient over a scripted fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "@/lib/api/client.ts";
import { BleClient } from "@/lib/client/ble/index.ts";
import {
  FakeDevice,
  ID_CARD,
  cooker,
  type Responder,
} from "@/lib/client/ble/fake-gatt.ts";
import {
  DEVICE_ID,
  apiError,
  fakeFetch,
  fakeTokens,
  json,
  type Call,
} from "@/test/fake-api.ts";
import type { SetupState } from "./machine.ts";
import {
  PAIR_INTERVAL_MS,
  PAIR_TIMEOUT_MS,
  SetupRunner,
  preflightProblems,
  type SetupDeps,
} from "./runner.ts";

const KEY = "testkey000";
/** Bytes that map to "testkey000"; 255 and 252 exercise rejection sampling. */
const KEY_BYTES = [255, 19, 4, 18, 19, 252, 10, 4, 24, 26, 26, 26];
const SERVER = { host: "anova.example.test", port: 8080 };
const SSID = "TestNet";
const PASSWORD = "testpass1";

type PairScript = (n: number) => Response;

function harness(opts: { responder?: Responder; pair?: PairScript } = {}) {
  const fake = new FakeDevice(opts.responder ?? cooker());
  let pairN = 0;
  const pairScript: PairScript =
    opts.pair ?? (() => json(200, { id: DEVICE_ID, name: "Anova" }));
  const f = fakeFetch((call: Call) => {
    if (call.url.endsWith("/api/server-info")) return json(200, SERVER);
    if (call.url.endsWith("/api/devices/pair")) return pairScript(++pairN);
    return apiError(404, "not_found");
  });
  const api = new ApiClient({
    baseUrl: "https://api.example.test",
    tokens: fakeTokens().source,
    fetch: f.fetch,
  });
  const links: BleClient[] = [];
  const deps: SetupDeps = {
    environment: async () => ({
      secureContext: true,
      bluetooth: true,
      adapterAvailable: true,
      signedIn: true,
    }),
    requestDevice: vi.fn(async () => fake.asDevice()),
    createLink: (device) => {
      const c = new BleClient(device, { sleep: async () => {} });
      links.push(c);
      return c;
    },
    serverInfo: () => api.serverInfo(),
    pair: (idCard, key, signal) => api.pair(idCard, key, signal),
    rename: vi.fn(async () => {}),
  };
  const runner = new SetupRunner(deps);
  const states: SetupState[] = [];
  runner.subscribe(() => states.push(runner.getSnapshot()));
  const pairCalls = () =>
    f.calls.filter((c) => c.url.endsWith("/api/devices/pair"));
  return { fake, runner, states, deps, calls: f.calls, pairCalls, links };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

/** Runs preflight → prepare → find up to the Wi-Fi choice. */
async function toWifi(h: ReturnType<typeof harness>) {
  await h.runner.preflight();
  h.runner.prepared();
  await h.runner.find();
  await flush();
}

function storageSpy() {
  const store = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(() => null),
    length: 0,
  };
  return store;
}

let local: ReturnType<typeof storageSpy>;
let session: ReturnType<typeof storageSpy>;

beforeEach(() => {
  vi.useFakeTimers();
  local = storageSpy();
  session = storageSpy();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  let call = 0;
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(
    <T extends ArrayBufferView | null>(buf: T): T => {
      const bytes = buf as unknown as Uint8Array;
      bytes.fill(0);
      if (call++ === 0) bytes.set(KEY_BYTES.slice(0, bytes.length));
      return buf;
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SetupRunner", () => {
  it("runs key → server → Wi-Fi in that order and pairs with that key", async () => {
    const h = harness();
    await toWifi(h);
    expect(h.runner.getSnapshot()).toMatchObject({
      step: "wifi",
      phase: "ready",
      idCard: ID_CARD,
    });
    expect(h.fake.received).toEqual([
      "get id card",
      `set number ${KEY}`,
      `server para ${SERVER.host} ${SERVER.port}`,
    ]);

    await h.runner.submitWifi(SSID, PASSWORD);
    await flush();
    expect(h.fake.received.slice(3)).toEqual([
      `wifi para 2 ${SSID} ${PASSWORD} WPA2PSK AES`,
    ]);
    // Bluetooth is released before waiting for the cooker.
    expect(h.fake.gatt.connected).toBe(false);

    expect(h.pairCalls()).toHaveLength(1);
    expect(JSON.parse(String(h.pairCalls()[0].init.body))).toEqual({
      id_card: ID_CARD,
      key: KEY,
    });
    expect(h.runner.getSnapshot()).toMatchObject({
      step: "name",
      device: { id: DEVICE_ID, name: "Anova" },
    });
  });

  it('"keep current Wi-Fi" sends no wifi para', async () => {
    const h = harness();
    await toWifi(h);
    await h.runner.keepWifi();
    await flush();
    expect(h.fake.received.some((c) => c.startsWith("wifi para"))).toBe(false);
    expect(h.fake.gatt.connected).toBe(false);
    expect(h.runner.getSnapshot().step).toBe("name");
  });

  it("refuses a Wi-Fi name with a space and sends nothing", async () => {
    const h = harness();
    await toWifi(h);
    const sent = h.fake.received.length;
    const error = await h.runner.submitWifi("My Net", PASSWORD);
    expect(error).toMatch(/space/i);
    expect(h.fake.received).toHaveLength(sent);
    expect(h.pairCalls()).toHaveLength(0);
    expect(h.runner.getSnapshot()).toMatchObject({
      step: "wifi",
      phase: "ready",
    });
    // A short password is refused by the same BLE validation.
    expect(await h.runner.submitWifi(SSID, "short")).toBeTruthy();
    await h.runner.keepWifi();
  });

  it("polls /pair every 2 s for 60 s, then shows troubleshooting", async () => {
    const h = harness({ pair: () => apiError(409, "key_mismatch") });
    await toWifi(h);
    await h.runner.keepWifi();
    await flush();
    expect(h.pairCalls()).toHaveLength(1);
    expect(h.runner.getSnapshot()).toMatchObject({
      step: "pair",
      phase: "working",
      pair: { attempts: 1, lastCode: "key_mismatch" },
    });

    await vi.advanceTimersByTimeAsync(PAIR_INTERVAL_MS - 1);
    expect(h.pairCalls()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.pairCalls()).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(PAIR_TIMEOUT_MS - PAIR_INTERVAL_MS - 1);
    expect(h.runner.getSnapshot().phase).toBe("working");
    await vi.advanceTimersByTimeAsync(1);
    const s = h.runner.getSnapshot();
    expect(s).toMatchObject({
      step: "pair",
      phase: "failed",
      pairTimedOut: true,
      resume: "pair",
    });
    expect(s.problems[0].fix).toMatch(/unplug/i);
    expect(h.pairCalls()).toHaveLength(PAIR_TIMEOUT_MS / PAIR_INTERVAL_MS);

    // Nothing more after the timeout.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.pairCalls()).toHaveLength(30);
  });

  it("keeps polling through device_offline and pairs when the cooker arrives", async () => {
    const h = harness({
      pair: (n) =>
        n < 4
          ? apiError(409, "device_offline")
          : json(200, { id: DEVICE_ID, name: "Anova" }),
    });
    await toWifi(h);
    await h.runner.keepWifi();
    await vi.advanceTimersByTimeAsync(3 * PAIR_INTERVAL_MS);
    expect(h.pairCalls()).toHaveLength(4);
    expect(h.runner.getSnapshot().step).toBe("name");
  });

  it("Keep waiting after a timeout polls again with the same key, without Bluetooth", async () => {
    const h = harness({
      pair: (n) =>
        n <= 30
          ? apiError(409, "device_offline")
          : json(200, { id: DEVICE_ID, name: "Anova" }),
    });
    await toWifi(h);
    await h.runner.keepWifi();
    await vi.advanceTimersByTimeAsync(PAIR_TIMEOUT_MS);
    expect(h.runner.getSnapshot().pairTimedOut).toBe(true);
    const bleCommands = h.fake.received.length;

    await h.runner.retry();
    await flush();
    expect(h.runner.getSnapshot().step).toBe("name");
    expect(h.fake.received).toHaveLength(bleCommands);
    expect(JSON.parse(String(h.pairCalls().at(-1)!.init.body)).key).toBe(KEY);
  });

  it("stops polling on a non-retryable pair error", async () => {
    const h = harness({ pair: () => apiError(403, "not_member") });
    await toWifi(h);
    await h.runner.keepWifi();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.pairCalls()).toHaveLength(1);
    expect(h.runner.getSnapshot()).toMatchObject({
      step: "pair",
      phase: "failed",
      resume: "pair",
    });
  });

  it("takes the key from crypto.getRandomValues and never stores, logs or exposes it", async () => {
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const h = harness({
      pair: (n) =>
        n < 2
          ? apiError(409, "key_mismatch")
          : json(200, { id: DEVICE_ID, name: "Anova" }),
    });
    await toWifi(h);
    expect(globalThis.crypto.getRandomValues).toHaveBeenCalled();
    expect(h.fake.received).toContain(`set number ${KEY}`);

    await h.runner.submitWifi(SSID, PASSWORD);
    await vi.advanceTimersByTimeAsync(PAIR_INTERVAL_MS);
    await h.runner.name("Kitchen");
    expect(h.runner.getSnapshot().step).toBe("done");

    for (const s of [...h.states, h.runner.getSnapshot()]) {
      const text = JSON.stringify(s);
      expect(text).not.toContain(KEY);
      expect(text).not.toContain(PASSWORD);
    }
    for (const store of [local, session]) {
      expect(store.setItem).not.toHaveBeenCalled();
    }
    for (const spy of logs) {
      for (const args of spy.mock.calls) {
        expect(JSON.stringify(args)).not.toContain(KEY);
      }
    }
    // The runner itself drops the key once paired.
    expect(
      Object.values(h.runner).filter((v) => typeof v === "string"),
    ).not.toContain(KEY);
  });

  it("resumes at the failed step: a server failure reconnects and redoes only the server step", async () => {
    let failServer = true;
    const h = harness({
      responder: cooker({
        "server para": (cmd) =>
          failServer ? "drop" : [cmd.slice("server para ".length) + "\r"],
      }),
    });
    await toWifi(h);
    expect(h.runner.getSnapshot()).toMatchObject({
      step: "server",
      phase: "failed",
      resume: "server",
    });
    expect(h.runner.getSnapshot().problems[0].fix).toBeTruthy();
    expect(h.fake.gatt.connected).toBe(false);

    failServer = false;
    h.fake.received.length = 0;
    await h.runner.retry();
    await flush();
    expect(h.fake.received).toEqual([
      "get id card",
      `server para ${SERVER.host} ${SERVER.port}`,
    ]);
    expect(h.runner.getSnapshot()).toMatchObject({
      step: "wifi",
      phase: "ready",
    });
    await h.runner.keepWifi();
    await flush();
    expect(JSON.parse(String(h.pairCalls()[0].init.body)).key).toBe(KEY);
  });

  it("a cancelled device picker fails at find with guidance and retries from find", async () => {
    const h = harness();
    await h.runner.preflight();
    h.runner.prepared();
    vi.mocked(h.deps.requestDevice).mockRejectedValueOnce(
      new DOMException(
        "User cancelled the requestDevice() chooser.",
        "NotFoundError",
      ),
    );
    await h.runner.find();
    expect(h.runner.getSnapshot()).toMatchObject({
      step: "find",
      phase: "failed",
      resume: "find",
    });
    expect(h.runner.getSnapshot().problems[0].fix).toBeTruthy();
    await h.runner.retry();
    await flush();
    expect(h.runner.getSnapshot().step).toBe("wifi");
    h.runner.dispose();
  });

  it("disconnects Bluetooth on dispose, restart and failure", async () => {
    const a = harness();
    await toWifi(a);
    expect(a.fake.gatt.connected).toBe(true);
    a.runner.dispose();
    await flush();
    expect(a.fake.gatt.connected).toBe(false);

    const b = harness();
    await toWifi(b);
    b.runner.restart();
    await flush();
    expect(b.fake.gatt.connected).toBe(false);
    expect(b.runner.getSnapshot()).toMatchObject({
      step: "find",
      idCard: undefined,
    });

    const c = harness({ responder: cooker({ "set number": () => "drop" }) });
    await toWifi(c);
    expect(c.runner.getSnapshot()).toMatchObject({
      step: "key",
      phase: "failed",
    });
    expect(c.fake.gatt.connected).toBe(false);
  });

  it("dispose during pairing stops polling", async () => {
    const h = harness({ pair: () => apiError(409, "device_offline") });
    await toWifi(h);
    await h.runner.keepWifi();
    await flush();
    h.runner.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.pairCalls()).toHaveLength(1);
  });
});

describe("preflightProblems", () => {
  const ok = {
    secureContext: true,
    bluetooth: true,
    adapterAvailable: true,
    signedIn: true,
  };

  it("passes a capable, signed-in browser", () => {
    expect(preflightProblems(ok)).toEqual([]);
  });

  it("names every problem with a fix", () => {
    for (const env of [
      { ...ok, secureContext: false },
      { ...ok, bluetooth: false },
      { ...ok, adapterAvailable: false },
      { ...ok, signedIn: false },
    ]) {
      const problems = preflightProblems(env);
      expect(problems).toHaveLength(1);
      expect(problems[0].fix.length).toBeGreaterThan(0);
    }
  });
});
