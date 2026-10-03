import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BleClient,
  BleError,
  bleErrorFrom,
  bleGuidance,
  type BleErrorCode,
} from "./index.ts";
import { FakeDevice, ID_CARD, cooker, type Responder } from "./fake-gatt.ts";

const SSID = "TestNet";
const PASSWORD = "testpass1";
const KEY = "testkey000";

function setup(
  responder: Responder = cooker(),
  opts: ConstructorParameters<typeof BleClient>[1] = {},
) {
  const fake = new FakeDevice(responder);
  const sleep = async (ms: number) => {
    fake.log.push({ kind: "sleep", ms });
  };
  const client = new BleClient(fake.asDevice(), { sleep, ...opts });
  return { fake, client, ch: fake.gatt.characteristic };
}

async function expectCode(p: Promise<unknown>, code: BleErrorCode) {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(BleError);
  expect((err as BleError).code).toBe(code);
}

function expectClean(fake: FakeDevice) {
  expect(fake.gatt.connected).toBe(false);
  expect(fake.gatt.characteristic.listenerCount).toBe(0);
  expect(fake.deviceListeners).toBe(0);
  expect(fake.forgetCalls).toBe(0);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("BleClient", () => {
  it("connect() returns the id_card", async () => {
    const { client } = setup();
    await expect(client.connect()).resolves.toBe(ID_CARD);
    await client.disconnect();
  });

  it("writes a 60-byte wifi para in chunks of <=20 bytes, 30 ms apart", async () => {
    const { fake, client, ch } = setup();
    await client.connect();
    fake.log.length = 0;
    ch.chunks.length = 0;

    const password = PASSWORD.repeat(3);
    await expect(client.setWifi(SSID, password)).resolves.toBe("ok");

    const full = `wifi para 2 ${SSID} ${password} WPA2PSK AES\r`;
    expect(full.length).toBe(60);
    expect(ch.chunks.join("")).toBe(full);
    expect(ch.chunks.length).toBe(3);
    for (const c of ch.chunks) expect(c.length).toBeLessThanOrEqual(20);
    expect(fake.log.map((e) => e.kind)).toEqual([
      "write",
      "sleep",
      "write",
      "sleep",
      "write",
    ]);
    for (const e of fake.log) if (e.kind === "sleep") expect(e.ms).toBe(30);
    expect(fake.received).toContain(full.slice(0, -1));
    await client.disconnect();
  });

  it("assembles a two-part reply once, starts notifications once, no extra listeners", async () => {
    const { client, ch } = setup(
      cooker({
        "get id card": () => ["anova f000000000", "00000000000000\r"],
      }),
    );
    await expect(client.connect()).resolves.toBe(ID_CARD);
    await expect(client.getIdCard()).resolves.toBe(ID_CARD);
    await expect(client.setSecretKey(KEY)).resolves.toBe("ok");
    expect(ch.startCount).toBe(1);
    expect(ch.listenerCount).toBe(1);
    await client.disconnect();
    expect(ch.listenerCount).toBe(0);
  });

  it("runs two concurrent sends in order", async () => {
    let releaseFirst!: () => void;
    const gate = new Promise<void>((r) => (releaseFirst = r));
    const { fake, client, ch } = setup(
      cooker({
        "set number": () => {
          // Reply later, after the second send was queued.
          void gate.then(() => ch.notify("ok\r"));
          return "none";
        },
      }),
    );
    await client.connect();
    fake.received.length = 0;

    const a = client.setSecretKey(KEY);
    const b = client.setServerInfo("192.0.2.10", 8080);
    await new Promise((r) => setTimeout(r, 10));
    // Second command must not be written while the first awaits its reply.
    expect(fake.received).toEqual([`set number ${KEY}`]);
    releaseFirst();
    await expect(a).resolves.toBe("ok");
    await expect(b).resolves.toBe("192.0.2.10 8080");
    expect(fake.received).toEqual([
      `set number ${KEY}`,
      "server para 192.0.2.10 8080",
    ]);
    await client.disconnect();
  });

  it("reconnects once after a drop mid-step and succeeds", async () => {
    const { fake, client, ch } = setup(
      cooker({
        "set number": (_c, count) => (count === 1 ? "drop" : ["ok\r"]),
      }),
    );
    await client.connect();
    await expect(client.setSecretKey(KEY)).resolves.toBe("ok");
    expect(fake.gatt.connectCount).toBe(2);
    expect(ch.startCount).toBe(2);
    expect(ch.listenerCount).toBe(1);
    expect(fake.deviceListeners).toBe(1);
    await client.disconnect();
    expectClean(fake);
  });

  it('fails with "disconnected" on a second drop', async () => {
    const { fake, client } = setup(cooker({ "set number": () => "drop" }));
    await client.connect();
    await expectCode(client.setSecretKey(KEY), "disconnected");
    expect(fake.gatt.connectCount).toBe(2);
    await client.disconnect();
    expectClean(fake);
  });

  it('times out, retries, then fails with "timeout" leaving no timers', async () => {
    vi.useFakeTimers();
    const { fake, client } = setup(cooker({ "set number": () => "none" }));
    await client.connect();
    fake.received.length = 0;

    const p = client.setSecretKey(KEY);
    const check = expectCode(p, "timeout");
    await vi.advanceTimersByTimeAsync(3000 * 3 + 10);
    await check;
    expect(fake.received).toEqual(Array(3).fill(`set number ${KEY}`));
    expect(vi.getTimerCount()).toBe(0);

    // The link stays usable and a late stray line is ignored.
    fake.gatt.characteristic.notify("ok\r");
    await expect(client.getIdCard()).resolves.toBe(ID_CARD);
    expect(vi.getTimerCount()).toBe(0);
    await client.disconnect();
    expectClean(fake);
  });

  it("rejects invalid Wi-Fi input before sending", async () => {
    const { fake, client } = setup();
    await client.connect();
    fake.received.length = 0;
    await expectCode(client.setWifi("Test Net", PASSWORD), "invalid_input");
    await expectCode(client.setWifi(SSID, ""), "invalid_input");
    await expectCode(client.setWifi(SSID, "test pass1"), "invalid_input");
    await expectCode(client.setWifi("TestNét", PASSWORD), "invalid_input");
    expect(fake.received).toEqual([]);
    await client.disconnect();
  });

  it('send before connect and after disconnect fails with "disconnected"', async () => {
    const { fake, client } = setup();
    await expectCode(client.send("version"), "disconnected");
    await client.connect();
    await client.disconnect();
    await client.disconnect(); // idempotent
    await expectCode(client.send("version"), "disconnected");
    expectClean(fake);
  });

  it("disconnect() during a pending command rejects it and cleans up", async () => {
    const { fake, client } = setup(cooker({ "set number": () => "none" }));
    await client.connect();
    const p = client.setSecretKey(KEY);
    const check = expectCode(p, "disconnected");
    await new Promise((r) => setTimeout(r, 5));
    await client.disconnect();
    await check;
    expectClean(fake);
  });

  describe("every connect failure path disconnects", () => {
    it("GATT connect fails twice", async () => {
      const { fake, client } = setup();
      fake.gatt.failConnect = 2;
      await expectCode(client.connect(), "gatt");
      expectClean(fake);
    });

    it("GATT connect fails once, then succeeds", async () => {
      const { fake, client } = setup();
      fake.gatt.failConnect = 1;
      await expect(client.connect()).resolves.toBe(ID_CARD);
      await client.disconnect();
      expectClean(fake);
    });

    it("service missing", async () => {
      const { fake, client } = setup();
      fake.gatt.failService = true;
      await expectCode(client.connect(), "not_found");
      expectClean(fake);
    });

    it("startNotifications fails", async () => {
      const { fake, client } = setup();
      fake.gatt.failStartNotifications = true;
      await expectCode(client.connect(), "gatt");
      expectClean(fake);
    });

    it("id card times out", async () => {
      vi.useFakeTimers();
      const { fake, client } = setup(cooker({ "get id card": () => "none" }));
      const check = expectCode(client.connect(), "timeout");
      await vi.advanceTimersByTimeAsync(10_000);
      await check;
      expect(vi.getTimerCount()).toBe(0);
      expectClean(fake);
    });

    it("id card drops twice", async () => {
      const { fake, client } = setup(cooker({ "get id card": () => "drop" }));
      await expectCode(client.connect(), "disconnected");
      expectClean(fake);
    });
  });
});

describe("requestDevice", () => {
  it("reports unsupported without navigator.bluetooth", async () => {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", {});
    await expectCode(BleClient.requestDevice(), "unsupported");
  });

  it("reports insecure_context on http", async () => {
    vi.stubGlobal("isSecureContext", false);
    vi.stubGlobal("navigator", {});
    await expectCode(BleClient.requestDevice(), "insecure_context");
  });

  it("maps chooser cancel to cancelled and passes the Anova filters", async () => {
    vi.stubGlobal("isSecureContext", true);
    const requestDevice = vi.fn(async () => {
      throw new DOMException(
        "User cancelled the requestDevice() chooser.",
        "NotFoundError",
      );
    });
    vi.stubGlobal("navigator", { bluetooth: { requestDevice } });
    await expectCode(BleClient.requestDevice(), "cancelled");
    expect(requestDevice).toHaveBeenCalledWith({
      filters: [
        { namePrefix: "Anova" },
        { services: ["0000ffe0-0000-1000-8000-00805f9b34fb"] },
      ],
      optionalServices: ["0000ffe0-0000-1000-8000-00805f9b34fb"],
    });
  });
});

describe("bleErrorFrom", () => {
  const cases: [string, unknown, BleErrorCode, boolean?][] = [
    [
      "chooser cancelled",
      new DOMException(
        "User cancelled the requestDevice() chooser.",
        "NotFoundError",
      ),
      "cancelled",
    ],
    [
      "service missing",
      new DOMException(
        "No Services matching UUID found in Device.",
        "NotFoundError",
      ),
      "not_found",
    ],
    [
      "adapter off",
      new DOMException("Bluetooth adapter not available.", "NotFoundError"),
      "unsupported",
    ],
    [
      "security, secure page",
      new DOMException("Origin is not allowed", "SecurityError"),
      "permission",
      true,
    ],
    [
      "security, insecure page",
      new DOMException("Must be handling a user gesture", "SecurityError"),
      "insecure_context",
      false,
    ],
    [
      "not allowed",
      new DOMException("Permission denied", "NotAllowedError"),
      "permission",
    ],
    [
      "network",
      new DOMException("GATT Server is disconnected.", "NetworkError"),
      "gatt",
    ],
    [
      "invalid state",
      new DOMException(
        "GATT operation already in progress.",
        "InvalidStateError",
      ),
      "gatt",
    ],
    [
      "abort",
      new DOMException("Connection aborted", "AbortError"),
      "disconnected",
    ],
    ["timeout", new DOMException("Timed out", "TimeoutError"), "timeout"],
    ["unknown", new Error("boom"), "gatt"],
  ];
  it.each(cases)("%s", (_n, e, code, secure) => {
    if (secure !== undefined) vi.stubGlobal("isSecureContext", secure);
    expect(bleErrorFrom(e).code).toBe(code);
  });

  it("TypeError without navigator.bluetooth is unsupported", () => {
    vi.stubGlobal("navigator", {});
    expect(
      bleErrorFrom(
        new TypeError(
          "Cannot read properties of undefined (reading 'requestDevice')",
        ),
      ).code,
    ).toBe("unsupported");
  });

  it("passes BleError through", () => {
    const e = new BleError("timeout");
    expect(bleErrorFrom(e)).toBe(e);
  });

  it("has guidance for every code", () => {
    const codes: BleErrorCode[] = [
      "unsupported",
      "insecure_context",
      "cancelled",
      "not_found",
      "permission",
      "gatt",
      "timeout",
      "disconnected",
      "invalid_input",
    ];
    for (const c of codes) {
      const g = bleGuidance(c);
      expect(g.title.length).toBeGreaterThan(0);
      expect(g.fix.length).toBeGreaterThan(0);
    }
    expect(bleGuidance("unsupported").fix).toMatch(/Chrome/);
    expect(bleGuidance("unsupported").fix).toMatch(/iPhone/);
    expect(bleGuidance("cancelled").fix).toMatch(/Anova/);
    expect(bleGuidance("gatt").fix).toMatch(/one Bluetooth connection/);
    expect(bleGuidance("timeout").fix).toMatch(/plug/);
  });
});
