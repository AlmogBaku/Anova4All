import type { ApiClient } from "./client.ts";
import { isApiError } from "./errors.ts";
import { SseParser } from "./sse.ts";
import type { CookEndReason, DeviceStatus } from "./types.ts";

/**
 * - connecting:   first attempt, nothing received yet
 * - live:         the stream is open (the cooker itself may still be offline)
 * - reconnecting: the stream dropped; waiting `retryInMs` before the next try
 * - access_lost:  403 (member removed, unpaired, re-paired): stopped for good
 * - signed_out:   the token was refused even after a refresh
 * - stopped:      stop() was called
 */
export type StreamConnection =
  | "connecting"
  | "live"
  | "reconnecting"
  | "access_lost"
  | "signed_out"
  | "stopped";

export interface StreamSnapshot {
  connection: StreamConnection;
  /** Last status received; kept (stale) while reconnecting. */
  status: DeviceStatus | null;
  /** Last `cook_ended` event; `seq` increases with every event. */
  cookEnded: { reason: CookEndReason; seq: number } | null;
  /** Delay before the next attempt, while reconnecting. */
  retryInMs?: number;
}

/** What the UI shows: stream trouble and an offline cooker are different things. */
export type LinkView =
  | "connecting"
  | "online"
  | "cooker_offline"
  | "stream_down"
  | "access_lost"
  /** 403 before any status: no such cooker, or never a member. */
  | "no_access"
  | "signed_out";

export function linkView(s: StreamSnapshot): LinkView {
  switch (s.connection) {
    case "access_lost":
      return s.status ? "access_lost" : "no_access";
    case "signed_out":
      return s.connection;
    case "live":
      if (!s.status) return "connecting";
      return s.status.online ? "online" : "cooker_offline";
    case "reconnecting":
      return "stream_down";
    default:
      return "connecting";
  }
}

export const BACKOFF_MIN_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;
/** ±20% jitter around the exponential step. */
export const BACKOFF_JITTER = 0.2;

/** Delay before reconnect number `attempt` (0-based): 1 s doubling to 30 s, with jitter, clamped. */
export function backoffDelay(
  attempt: number,
  random: () => number = Math.random,
): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** attempt);
  const jittered = base * (1 - BACKOFF_JITTER + 2 * BACKOFF_JITTER * random());
  return Math.round(
    Math.min(BACKOFF_MAX_MS, Math.max(BACKOFF_MIN_MS, jittered)),
  );
}

export interface DeviceStreamOptions {
  random?: () => number;
  /** No bytes (not even a ping) for this long means a dead link. Default 45 s (3 pings). */
  idleTimeoutMs?: number;
  /** A stream open at least this long resets the backoff. Default 15 s (one ping). */
  healthyAfterMs?: number;
}

/** Live device status over SSE, with reconnects. Framework-agnostic (useSyncExternalStore-friendly). */
export class DeviceStream {
  private readonly opts: Required<DeviceStreamOptions>;
  private snapshot: StreamSnapshot = {
    connection: "connecting",
    status: null,
    cookEnded: null,
  };
  private listeners = new Set<() => void>();
  private running = false;
  private generation = 0;
  private attempt = 0;
  private everLive = false;
  private cookSeq = 0;
  private abort?: AbortController;
  private wake?: () => void;

  constructor(
    private readonly api: Pick<ApiClient, "authorizedFetch">,
    private readonly deviceId: string,
    opts: DeviceStreamOptions = {},
  ) {
    this.opts = {
      random: opts.random ?? Math.random,
      idleTimeoutMs: opts.idleTimeoutMs ?? 45_000,
      healthyAfterMs: opts.healthyAfterMs ?? 15_000,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StreamSnapshot => this.snapshot;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.attempt = 0;
    this.everLive = false;
    const gen = ++this.generation;
    this.set({ connection: "connecting", retryInMs: undefined });
    void this.loop(gen);
  }

  stop(): void {
    if (!this.running) return;
    this.halt("stopped");
  }

  private halt(connection: StreamConnection): void {
    this.running = false;
    this.generation++;
    this.abort?.abort();
    this.abort = undefined;
    this.wake?.();
    this.set({ connection, retryInMs: undefined });
  }

  private alive(gen: number): boolean {
    return this.running && gen === this.generation;
  }

  private async loop(gen: number): Promise<void> {
    while (this.alive(gen)) {
      const ctrl = new AbortController();
      this.abort = ctrl;
      let openedAt: number | null = null;
      try {
        const res = await this.api.authorizedFetch(
          `/api/devices/${encodeURIComponent(this.deviceId)}/events`,
          { headers: { Accept: "text/event-stream" }, signal: ctrl.signal },
        );
        if (!this.alive(gen)) {
          await res.body?.cancel().catch(() => {});
          return;
        }
        if (res.status === 403) {
          await res.body?.cancel().catch(() => {});
          this.halt("access_lost");
          return;
        }
        if (res.ok && res.body) {
          openedAt = Date.now();
          this.everLive = true;
          this.set({ connection: "live", retryInMs: undefined });
          await this.read(res.body, ctrl, gen);
        } else {
          await res.body?.cancel().catch(() => {});
        }
      } catch (e) {
        if (!this.alive(gen)) return;
        if (isApiError(e, "unauthorized")) {
          this.halt("signed_out");
          return;
        }
        // Network errors, aborts by the idle watchdog and read errors are
        // all handled like a dropped stream: back off and reconnect.
      }
      if (!this.alive(gen)) return;

      if (
        openedAt !== null &&
        Date.now() - openedAt >= this.opts.healthyAfterMs
      ) {
        this.attempt = 0;
      }
      const delay = backoffDelay(this.attempt, this.opts.random);
      this.attempt++;
      this.set({
        connection: this.everLive ? "reconnecting" : "connecting",
        retryInMs: delay,
      });
      await this.sleep(delay);
    }
  }

  private async read(
    body: ReadableStream<Uint8Array>,
    ctrl: AbortController,
    gen: number,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    let idle: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(idle);
      idle = setTimeout(() => ctrl.abort(), this.opts.idleTimeoutMs);
    };
    arm();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || !this.alive(gen)) return;
        arm();
        for (const msg of parser.push(
          decoder.decode(value, { stream: true }),
        )) {
          if (msg.kind === "event") this.handle(msg.event, msg.data);
        }
      }
    } finally {
      clearTimeout(idle);
      reader.cancel().catch(() => {});
    }
  }

  private handle(event: string, data: string): void {
    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    if (event === "status" && isStatus(payload)) {
      this.set({ status: payload });
    } else if (event === "cook_ended" && isCookEnded(payload)) {
      this.set({ cookEnded: { reason: payload.reason, seq: ++this.cookSeq } });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(done, ms);
      function done() {
        clearTimeout(t);
        resolve();
      }
      this.wake = done;
    });
  }

  private set(patch: Partial<StreamSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }
}

function isStatus(v: unknown): v is DeviceStatus {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as DeviceStatus).id === "string" &&
    typeof (v as DeviceStatus).online === "boolean"
  );
}

function isCookEnded(v: unknown): v is { reason: CookEndReason } {
  const r = (v as { reason?: unknown } | null)?.reason;
  return r === "auto_stop" || r === "stopped" || r === "manual";
}
