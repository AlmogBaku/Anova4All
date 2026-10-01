/// <reference types="web-bluetooth" />
// Hand-written fake Web Bluetooth GATT for tests. Synthetic data only.

/** What the fake cooker does when it receives a full command line. */
export type FakeReply = string[] | "none" | "drop";
export type Responder = (command: string, count: number) => FakeReply;

export type LogEntry =
  | { kind: "write"; chunk: string }
  | { kind: "sleep"; ms: number };

export class FakeCharacteristic extends EventTarget {
  value?: DataView;
  properties = {
    writeWithoutResponse: true,
    write: true,
    notify: true,
  } as BluetoothCharacteristicProperties;
  notifying = false;
  startCount = 0;
  listenerCount = 0;
  chunks: string[] = [];
  private rx = "";

  constructor(private server: FakeServer) {
    super();
  }

  override addEventListener(
    type: string,
    cb: EventListenerOrEventListenerObject | null,
    o?: AddEventListenerOptions | boolean,
  ) {
    if (type === "characteristicvaluechanged") this.listenerCount++;
    super.addEventListener(type, cb, o);
  }

  override removeEventListener(
    type: string,
    cb: EventListenerOrEventListenerObject | null,
    o?: EventListenerOptions | boolean,
  ) {
    if (type === "characteristicvaluechanged")
      this.listenerCount = Math.max(0, this.listenerCount - 1);
    super.removeEventListener(type, cb, o);
  }

  async startNotifications() {
    if (!this.server.connected)
      throw new DOMException("GATT Server is disconnected.", "NetworkError");
    if (this.server.failStartNotifications)
      throw new DOMException("GATT operation failed.", "NetworkError");
    this.startCount++;
    this.notifying = true;
    return this;
  }

  async stopNotifications() {
    this.notifying = false;
    return this;
  }

  async writeValueWithoutResponse(buf: BufferSource) {
    return this.writeValue(buf);
  }

  async writeValue(buf: BufferSource) {
    if (!this.server.connected)
      throw new DOMException("GATT Server is disconnected.", "NetworkError");
    const bytes =
      buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
    const chunk = new TextDecoder().decode(bytes);
    this.chunks.push(chunk);
    this.server.device.log.push({ kind: "write", chunk });
    this.rx += chunk;
    let idx: number;
    while ((idx = this.rx.indexOf("\r")) >= 0) {
      const cmd = this.rx.slice(0, idx);
      this.rx = this.rx.slice(idx + 1);
      this.server.device.received.push(cmd);
      const count = this.server.device.received.filter((c) => c === cmd).length;
      const reply = this.server.device.responder(cmd, count);
      // Deliver asynchronously like a real notification.
      void Promise.resolve().then(() => {
        if (reply === "drop") this.server.drop();
        else if (reply !== "none") reply.forEach((part) => this.notify(part));
      });
    }
  }

  notify(text: string) {
    if (!this.notifying || !this.server.connected) return;
    const bytes = new TextEncoder().encode(text);
    this.value = new DataView(bytes.buffer);
    this.dispatchEvent(new Event("characteristicvaluechanged"));
  }

  resetRx() {
    this.rx = "";
  }
}

export class FakeServer {
  connected = false;
  connectCount = 0;
  failConnect = 0;
  failService = false;
  failStartNotifications = false;
  readonly characteristic: FakeCharacteristic;

  constructor(readonly device: FakeDevice) {
    this.characteristic = new FakeCharacteristic(this);
  }

  async connect() {
    this.connectCount++;
    if (this.failConnect > 0) {
      this.failConnect--;
      throw new DOMException("Connection attempt failed.", "NetworkError");
    }
    this.connected = true;
    return this;
  }

  disconnect() {
    if (!this.connected) return;
    this.connected = false;
    this.characteristic.notifying = false;
    this.characteristic.resetRx();
    this.device.dispatchEvent(new Event("gattserverdisconnected"));
  }

  /** Simulates the cooker dropping the link. */
  drop() {
    this.disconnect();
  }

  async getPrimaryService(uuid: string) {
    if (!this.connected)
      throw new DOMException("GATT Server is disconnected.", "NetworkError");
    if (this.failService)
      throw new DOMException(
        `No Services matching UUID ${uuid} found in Device.`,
        "NotFoundError",
      );
    return {
      getCharacteristic: async () => this.characteristic,
    };
  }
}

export class FakeDevice extends EventTarget {
  id = "fake-device";
  name = "Anova";
  log: LogEntry[] = [];
  received: string[] = [];
  forgetCalls = 0;
  deviceListeners = 0;
  readonly gatt: FakeServer;

  constructor(public responder: Responder) {
    super();
    this.gatt = new FakeServer(this);
  }

  override addEventListener(
    type: string,
    cb: EventListenerOrEventListenerObject | null,
    o?: AddEventListenerOptions | boolean,
  ) {
    if (type === "gattserverdisconnected") this.deviceListeners++;
    super.addEventListener(type, cb, o);
  }

  override removeEventListener(
    type: string,
    cb: EventListenerOrEventListenerObject | null,
    o?: EventListenerOptions | boolean,
  ) {
    if (type === "gattserverdisconnected")
      this.deviceListeners = Math.max(0, this.deviceListeners - 1);
    super.removeEventListener(type, cb, o);
  }

  async forget() {
    this.forgetCalls++;
  }

  asDevice(): BluetoothDevice {
    return this as unknown as BluetoothDevice;
  }
}

export const ID_CARD_REPLY = "anova f00000000000000000000000";
export const ID_CARD = "f00000000000000000000000";

/** Default cooker: answers id card, "ok" to setters, echoes server para. */
export function cooker(overrides: Record<string, Responder> = {}): Responder {
  return (cmd, count) => {
    for (const [prefix, r] of Object.entries(overrides)) {
      if (cmd.startsWith(prefix)) return r(cmd, count);
    }
    if (cmd === "get id card") return [ID_CARD_REPLY + "\r"];
    if (cmd.startsWith("server para "))
      return [cmd.slice("server para ".length) + "\r"];
    return ["ok\r"];
  };
}
