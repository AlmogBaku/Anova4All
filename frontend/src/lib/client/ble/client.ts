/// <reference types="web-bluetooth" />
import {
  GET_ID_CARD,
  decodeIdCard,
  setSecretKeyCommand,
  setServerInfoCommand,
  setWifiCommand,
} from "./commands.ts";
import { BleError, bleErrorFrom } from "./errors.ts";

export const ANOVA_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
export const ANOVA_CHARACTERISTIC_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";
export const ANOVA_DEVICE_NAME = "Anova";

/** BLE writes larger than this are truncated by the cooker. */
export const MAX_CHUNK_BYTES = 20;
const DELIMITER = "\r";

export interface BleClientOptions {
  /** Per-attempt timeout (write + reply). Default 3000 ms. */
  timeoutMs?: number;
  /** Extra attempts after a timeout. Default 2. */
  retries?: number;
  /** Delay between 20-byte chunks. Default 30 ms. */
  chunkDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface Waiter {
  promise: Promise<string>;
  resolve: (line: string) => void;
  reject: (err: BleError) => void;
}

function waiter(): Waiter {
  let resolve!: (line: string) => void;
  let reject!: (err: BleError) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Rejections may happen while nobody awaits yet (e.g. a drop mid-write).
  promise.catch(() => {});
  return { promise, resolve, reject };
}

const defaultSleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

export class BleClient {
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly chunkDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  private characteristic?: BluetoothRemoteGATTCharacteristic;
  private buffer = "";
  private decoder = new TextDecoder();
  private pending?: Waiter;
  private queue: Promise<unknown> = Promise.resolve();
  /** True between connect() and disconnect(). */
  private open = false;
  /** Bumped on every drop / disconnect so in-flight chunk writes stop. */
  private epoch = 0;

  static async requestDevice(): Promise<BluetoothDevice> {
    if (
      typeof globalThis.isSecureContext !== "undefined" &&
      !globalThis.isSecureContext
    ) {
      throw new BleError(
        "insecure_context",
        "Web Bluetooth requires a secure (https) page",
      );
    }
    const bluetooth =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth
        : undefined;
    if (!bluetooth) {
      throw new BleError(
        "unsupported",
        "Web Bluetooth is not available in this browser",
      );
    }
    try {
      return await bluetooth.requestDevice({
        filters: [
          { namePrefix: ANOVA_DEVICE_NAME },
          { services: [ANOVA_SERVICE_UUID] },
        ],
        optionalServices: [ANOVA_SERVICE_UUID],
      });
    } catch (e) {
      throw bleErrorFrom(e);
    }
  }

  constructor(
    private readonly device: BluetoothDevice,
    opts: BleClientOptions = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? 3000;
    this.retries = opts.retries ?? 2;
    this.chunkDelayMs = opts.chunkDelayMs ?? 30;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  /** Connects, starts notifications once, and returns the cooker's id_card. Disconnects on failure. */
  connect(): Promise<string> {
    return this.enqueue(async () => {
      this.open = true;
      this.device.addEventListener(
        "gattserverdisconnected",
        this.onDisconnected,
      );
      try {
        try {
          await this.setup();
        } catch (e) {
          const err = bleErrorFrom(e);
          if (err.code !== "gatt" && err.code !== "disconnected") throw err;
          // First GATT connects often fail spuriously; try once more.
          this.teardownLink();
          await this.setup();
        }
        return decodeIdCard(await this.run(GET_ID_CARD));
      } catch (e) {
        this.close();
        throw bleErrorFrom(e);
      }
    });
  }

  /** Sends one command and resolves with its reply line. Runs in FIFO order. */
  send(command: string): Promise<string> {
    return this.enqueue(() => this.run(command));
  }

  async getIdCard(): Promise<string> {
    return decodeIdCard(await this.send(GET_ID_CARD));
  }

  /** `set number <key>`; resolves with the raw reply (expected "ok"). */
  setSecretKey(key: string): Promise<string> {
    return this.validated(() => setSecretKeyCommand(key));
  }

  /** `server para <host> <port>`; resolves with the raw reply (expected "<host> <port>"). */
  setServerInfo(host: string, port: number): Promise<string> {
    return this.validated(() => setServerInfoCommand(host, port));
  }

  /** `wifi para 2 <ssid> <password> WPA2PSK AES`; resolves with the raw reply (expected "ok"). */
  setWifi(ssid: string, password: string): Promise<string> {
    return this.validated(() => setWifiCommand(ssid, password));
  }

  /** Always safe and idempotent. Never calls device.forget(). */
  async disconnect(): Promise<void> {
    this.close();
  }

  // ---- internals ----

  private validated(build: () => string): Promise<string> {
    let command: string;
    try {
      command = build();
    } catch (e) {
      return Promise.reject(bleErrorFrom(e));
    }
    return this.send(command);
  }

  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const result = this.queue.then(op, op);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private linked(): boolean {
    return !!this.characteristic && !!this.device.gatt?.connected;
  }

  /** One command with timeouts/retries and at most one reconnect after a drop. */
  private async run(command: string): Promise<string> {
    let reconnected = false;
    for (;;) {
      if (!this.open)
        throw new BleError("disconnected", "Not connected to the cooker");
      try {
        if (!this.linked()) {
          if (reconnected)
            throw new BleError(
              "disconnected",
              "Bluetooth connection dropped again",
            );
          reconnected = true;
          this.teardownLink();
          await this.setup();
        }
        return await this.withRetries(command);
      } catch (e) {
        const err = bleErrorFrom(e);
        const dropped =
          err.code === "disconnected" ||
          (err.code === "gatt" && !this.linked());
        if (!dropped || !this.open) throw err;
        if (reconnected) {
          throw new BleError(
            "disconnected",
            "Bluetooth connection dropped again",
            { cause: err },
          );
        }
        reconnected = true;
        this.teardownLink();
        await this.setup();
      }
    }
  }

  private async withRetries(command: string): Promise<string> {
    let last: BleError | undefined;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        return await this.attempt(command);
      } catch (e) {
        const err = bleErrorFrom(e);
        if (err.code !== "timeout") throw err;
        last = err;
      }
    }
    throw last ?? new BleError("timeout");
  }

  private async attempt(command: string): Promise<string> {
    const w = waiter();
    this.buffer = "";
    this.pending = w;
    const timer = setTimeout(
      () =>
        w.reject(
          new BleError("timeout", `No reply to "${command.split(" ")[0]}"`),
        ),
      this.timeoutMs,
    );
    try {
      await Promise.race([this.writeChunks(command + DELIMITER), w.promise]);
      return await w.promise;
    } finally {
      clearTimeout(timer);
      if (this.pending === w) this.pending = undefined;
    }
  }

  private async writeChunks(data: string): Promise<void> {
    const epoch = this.epoch;
    const pending = this.pending;
    const bytes = new TextEncoder().encode(data);
    for (let off = 0; off < bytes.length; off += MAX_CHUNK_BYTES) {
      if (off > 0) await this.sleep(this.chunkDelayMs);
      // Stop if this attempt timed out or the link dropped meanwhile.
      if (epoch !== this.epoch || pending !== this.pending) return;
      const ch = this.characteristic;
      if (!ch)
        throw new BleError("disconnected", "Bluetooth connection dropped");
      const chunk = bytes.slice(off, off + MAX_CHUNK_BYTES);
      if (ch.properties?.writeWithoutResponse && ch.writeValueWithoutResponse) {
        await ch.writeValueWithoutResponse(chunk);
      } else {
        await ch.writeValue(chunk);
      }
    }
  }

  /** Connects GATT, gets the characteristic, attaches the single listener and starts notifications. */
  private async setup(): Promise<void> {
    const gatt = this.device.gatt;
    if (!gatt) throw new BleError("gatt", "Device has no GATT server");
    const server = await gatt.connect();
    const service = await server.getPrimaryService(ANOVA_SERVICE_UUID);
    const ch = await service.getCharacteristic(ANOVA_CHARACTERISTIC_UUID);
    this.buffer = "";
    this.decoder = new TextDecoder();
    ch.addEventListener("characteristicvaluechanged", this.onValue);
    this.characteristic = ch;
    await ch.startNotifications();
  }

  private onValue = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic | null)
      ?.value;
    if (!value) return;
    this.buffer += this.decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = this.buffer.search(/[\r\n]/)) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      const w = this.pending;
      if (w) {
        this.pending = undefined;
        w.resolve(line);
      }
      // Lines with no waiter (late replies) are dropped.
    }
  };

  private onDisconnected = (): void => {
    this.epoch++;
    this.detachCharacteristic();
    const w = this.pending;
    this.pending = undefined;
    w?.reject(new BleError("disconnected", "Bluetooth connection dropped"));
  };

  private detachCharacteristic(): void {
    this.characteristic?.removeEventListener(
      "characteristicvaluechanged",
      this.onValue,
    );
    this.characteristic = undefined;
    this.buffer = "";
  }

  /** Drops the current GATT link (used before a reconnect). */
  private teardownLink(): void {
    this.epoch++;
    const ch = this.characteristic;
    this.detachCharacteristic();
    if (ch && this.device.gatt?.connected)
      ch.stopNotifications().catch(() => {});
    try {
      if (this.device.gatt?.connected) this.device.gatt.disconnect();
    } catch {
      // ignore
    }
  }

  private close(): void {
    this.open = false;
    this.device.removeEventListener(
      "gattserverdisconnected",
      this.onDisconnected,
    );
    const w = this.pending;
    this.pending = undefined;
    this.teardownLink();
    w?.reject(new BleError("disconnected", "Disconnected"));
  }
}
