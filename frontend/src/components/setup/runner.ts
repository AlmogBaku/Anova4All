// Side effects of the setup wizard: Bluetooth, the Go API and timers.
// The cooker key and Wi-Fi password live only in this object's memory, only as
// long as needed, and are never put into state, storage or logs.
import { ApiError, apiErrorText, isApiError } from "@/lib/api/errors.ts";
import type { PairResult, ServerInfo } from "@/lib/api/types.ts";
import {
  BleError,
  bleErrorFrom,
  bleGuidance,
  setServerInfoCommand,
  setWifiCommand,
} from "@/lib/client/ble/index.ts";
import { PAIR, PREFLIGHT } from "./copy.ts";
import { generateKey } from "./key.ts";
import {
  initialState,
  reducer,
  type Problem,
  type SetupAction,
  type SetupState,
  type StepId,
} from "./machine.ts";

export const PAIR_INTERVAL_MS = 2_000;
export const PAIR_TIMEOUT_MS = 60_000;

/** The parts of BleClient the wizard uses. */
export interface BleLink {
  connect(): Promise<string>;
  setSecretKey(key: string): Promise<string>;
  setServerInfo(host: string, port: number): Promise<string>;
  setWifi(ssid: string, password: string): Promise<string>;
  disconnect(): Promise<void>;
}

export interface PreflightEnv {
  secureContext: boolean;
  bluetooth: boolean;
  /** navigator.bluetooth.getAvailability(); undefined if unknown. */
  adapterAvailable?: boolean;
  signedIn: boolean;
}

export interface SetupDeps {
  environment(): Promise<PreflightEnv>;
  /** Must be called straight from a click (Web Bluetooth needs a user gesture). */
  requestDevice(): Promise<BluetoothDevice>;
  createLink(device: BluetoothDevice): BleLink;
  serverInfo(): Promise<ServerInfo>;
  pair(idCard: string, key: string, signal: AbortSignal): Promise<PairResult>;
  rename(deviceId: string, name: string): Promise<void>;
  generateKey?: () => string;
}

export function preflightProblems(env: PreflightEnv): Problem[] {
  const problems: Problem[] = [];
  if (!env.secureContext) {
    problems.push({
      code: "insecure_context",
      ...bleGuidance("insecure_context"),
    });
  } else if (!env.bluetooth) {
    problems.push({ code: "unsupported", ...bleGuidance("unsupported") });
  } else if (env.adapterAvailable === false) {
    problems.push({ code: "bluetooth_off", ...PREFLIGHT.bluetoothOff });
  }
  if (!env.signedIn)
    problems.push({ code: "signed_out", ...PREFLIGHT.signedOut });
  return problems;
}

/** Returns an error message, or null if the cooker accepts this Wi-Fi. Reuses the BLE command validation. */
export function validateWifi(ssid: string, password: string): string | null {
  try {
    setWifiCommand(ssid, password);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid Wi-Fi details";
  }
}

function problemFrom(e: unknown, fallbackTitle: string): Problem {
  if (e instanceof BleError || !(e instanceof ApiError)) {
    const err = bleErrorFrom(e);
    return { code: err.code, ...bleGuidance(err.code) };
  }
  return { code: e.code, title: fallbackTitle, fix: apiErrorText(e) };
}

/** Pair errors that mean "not yet": keep polling. */
function pairRetryable(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  return [
    "device_offline",
    "key_mismatch",
    "rate_limited",
    "network",
    "internal",
    "unknown",
  ].includes(e.code);
}

const BLE_STEPS: StepId[] = ["connect", "key", "server", "wifi"];

export class SetupRunner {
  private state: SetupState = initialState;
  private listeners = new Set<() => void>();
  private device?: BluetoothDevice;
  private link?: BleLink;
  /** In memory only, from the key step until pairing succeeds. */
  private key?: string;
  private pairAbort?: AbortController;
  /** A typed server address that replaces the server's own; the port stays the server's. */
  private serverHost?: string;
  /** Bumped by restart/dispose so stale async work stops. */
  private epoch = 0;
  private disposed = false;

  constructor(private readonly deps: SetupDeps) {}

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = (): SetupState => this.state;

  // ---- user actions ----

  async preflight(): Promise<void> {
    this.dispatch({ type: "started", step: "preflight" });
    const env = await this.deps.environment();
    if (this.disposed) return;
    this.dispatch({
      type: "preflight_checked",
      problems: preflightProblems(env),
    });
  }

  prepared(): void {
    if (this.state.step === "prepare") this.dispatch({ type: "prepared" });
  }

  /** Overrides the address the cooker dials ("" for the server's own). Returns a validation message, or null. */
  setServerHost(host: string): string | null {
    const h = host.trim();
    if (h) {
      try {
        setServerInfoCommand(h, 1);
      } catch (e) {
        return e instanceof Error ? e.message : "Invalid server address";
      }
    }
    this.serverHost = h || undefined;
    return null;
  }

  /** Call directly from the click handler. */
  async find(): Promise<void> {
    if (this.state.phase === "working") return;
    // First thing, synchronously: Web Bluetooth needs the user gesture.
    const picking = this.deps.requestDevice();
    const epoch = this.epoch;
    this.dispatch({ type: "started", step: "find" });
    let device: BluetoothDevice;
    try {
      device = await picking;
    } catch (e) {
      if (this.stale(epoch)) return;
      this.fail("find", e, "Couldn't find the cooker");
      return;
    }
    if (this.stale(epoch)) return;
    await this.closeLink();
    this.device = device;
    this.key = undefined;
    await this.connectThen("key", epoch);
  }

  /** Wi-Fi step: send a new network. Returns a validation message, or null when accepted. */
  async submitWifi(ssid: string, password: string): Promise<string | null> {
    const invalid = validateWifi(ssid, password);
    if (invalid) return invalid;
    if (
      this.state.step !== "wifi" ||
      this.state.phase === "working" ||
      !this.link
    )
      return null;
    const epoch = this.epoch;
    this.dispatch({ type: "started", step: "wifi" });
    try {
      await this.link.setWifi(ssid, password);
    } catch (e) {
      if (this.stale(epoch)) return null;
      this.fail("wifi", e, "Couldn't send the Wi-Fi details");
      return null;
    }
    if (this.stale(epoch)) return null;
    await this.closeLink();
    void this.pairLoop(epoch);
    return null;
  }

  /** Wi-Fi step: keep the cooker's current network (no `wifi para`). */
  async keepWifi(): Promise<void> {
    if (this.state.step !== "wifi" || this.state.phase === "working") return;
    const epoch = this.epoch;
    await this.closeLink();
    void this.pairLoop(epoch);
  }

  /** Retry resumes at the failed step. */
  async retry(): Promise<void> {
    const { resume } = this.state;
    if (this.state.phase !== "failed" || !resume) return;
    const epoch = this.epoch;
    switch (resume) {
      case "preflight":
        return this.preflight();
      case "find":
        return this.find();
      case "connect":
      case "key":
      case "server":
      case "wifi":
        if (!this.device) {
          this.restart();
          return;
        }
        return this.connectThen(resume === "connect" ? "key" : resume, epoch);
      case "pair":
        return this.pairLoop(epoch);
      default:
        this.dispatch({ type: "ready", step: resume });
    }
  }

  /** Back to "find": drops the link, the device and the key. */
  restart(): void {
    this.epoch++;
    this.pairAbort?.abort();
    void this.closeLink();
    this.device = undefined;
    this.key = undefined;
    this.dispatch({ type: "restart" });
  }

  async name(name: string): Promise<void> {
    const device = this.state.device;
    if (this.state.step !== "name" || !device || this.state.phase === "working")
      return;
    const epoch = this.epoch;
    this.dispatch({ type: "started", step: "name" });
    try {
      await this.deps.rename(device.id, name);
    } catch (e) {
      if (this.stale(epoch)) return;
      const message = e instanceof Error ? e.message : "Couldn't save the name";
      this.dispatch({
        type: "failed",
        step: "name",
        problem: {
          code: "rename",
          title: "Couldn't save the name",
          fix: message,
        },
      });
      return;
    }
    if (this.stale(epoch)) return;
    this.dispatch({ type: "named", name });
  }

  skipName(): void {
    if (this.state.step === "name") this.dispatch({ type: "named" });
  }

  /**
   * For a React effect: (re)activates the runner and returns the cleanup.
   * Safe under StrictMode's mount → unmount → mount.
   */
  attach(): () => void {
    this.disposed = false;
    return () => this.dispose();
  }

  /** Every exit path: stops polling and disconnects Bluetooth. Safe to call twice. */
  dispose(): void {
    this.disposed = true;
    this.epoch++;
    this.pairAbort?.abort();
    this.key = undefined;
    this.device = undefined;
    void this.closeLink();
  }

  // ---- steps ----

  /** Connects (step 4), then runs from `from` (key/server/wifi) onwards. */
  private async connectThen(from: StepId, epoch: number): Promise<void> {
    const device = this.device;
    if (!device) return;
    this.dispatch({ type: "started", step: "connect" });
    await this.closeLink();
    const link = this.deps.createLink(device);
    this.link = link;
    let idCard: string;
    try {
      idCard = await link.connect();
    } catch (e) {
      if (this.stale(epoch)) return;
      this.fail("connect", e, "Couldn't connect to the cooker");
      return;
    }
    if (this.stale(epoch)) return;
    // A different cooker than before: its key must be written again.
    if (this.state.idCard && this.state.idCard !== idCard) {
      this.key = undefined;
      from = "key";
    }
    this.dispatch({ type: "connected", idCard });

    const order: StepId[] = ["key", "server", "wifi"];
    for (const step of order.slice(order.indexOf(from))) {
      if (step === "wifi") {
        this.dispatch({ type: "ready", step: "wifi" });
        return;
      }
      this.dispatch({ type: "started", step });
      try {
        if (step === "key") {
          const key = (this.deps.generateKey ?? generateKey)();
          await link.setSecretKey(key);
          this.key = key;
        } else {
          const info = await this.deps.serverInfo();
          if (this.stale(epoch)) return;
          await link.setServerInfo(this.serverHost ?? info.host, info.port);
        }
      } catch (e) {
        if (this.stale(epoch)) return;
        this.fail(
          step,
          e,
          step === "server"
            ? "Couldn't get the server address"
            : "Couldn't write the key",
        );
        return;
      }
      if (this.stale(epoch)) return;
    }
  }

  /** Step 8: POST /pair every 2 s for up to 60 s. */
  private async pairLoop(epoch: number): Promise<void> {
    const idCard = this.state.idCard;
    const key = this.key;
    if (!idCard || !key) {
      this.restart();
      return;
    }
    this.pairAbort?.abort();
    const ctrl = new AbortController();
    this.pairAbort = ctrl;
    const done = () => ctrl.signal.aborted || this.stale(epoch);

    this.dispatch({ type: "started", step: "pair" });
    const t0 = Date.now();
    let attempts = 0;
    let lastCode: string | undefined;
    for (;;) {
      if (Date.now() - t0 >= PAIR_TIMEOUT_MS) {
        this.dispatch({
          type: "pair_timeout",
          problem: {
            code: "pair_timeout",
            title: PAIR.timeoutTitle,
            fix: PAIR.troubleshooting.join(" "),
          },
        });
        return;
      }
      attempts++;
      try {
        const result = await this.deps.pair(idCard, key, ctrl.signal);
        if (done()) return;
        this.key = undefined;
        this.dispatch({
          type: "paired",
          device: { id: result.id, name: result.name },
        });
        return;
      } catch (e) {
        if (done()) return;
        if (!pairRetryable(e)) {
          this.fail("pair", e, "Couldn't pair the cooker");
          return;
        }
        lastCode = isApiError(e) ? e.code : undefined;
      }
      this.dispatch({
        type: "pair_progress",
        progress: { elapsedMs: Date.now() - t0, attempts, lastCode },
      });
      await sleep(PAIR_INTERVAL_MS, ctrl.signal);
      if (done()) return;
    }
  }

  // ---- helpers ----

  private fail(step: StepId, e: unknown, title: string): void {
    // Always disconnect after a Bluetooth failure; Retry reconnects.
    if (BLE_STEPS.includes(step) || step === "find") void this.closeLink();
    this.dispatch({ type: "failed", step, problem: problemFrom(e, title) });
  }

  private async closeLink(): Promise<void> {
    const link = this.link;
    this.link = undefined;
    if (link) await link.disconnect().catch(() => {});
  }

  private stale(epoch: number): boolean {
    return this.disposed || epoch !== this.epoch;
  }

  private dispatch(action: SetupAction): void {
    if (this.disposed) return;
    this.state = reducer(this.state, action);
    for (const l of this.listeners) l();
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}
