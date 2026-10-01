// Cook screen logic, framework-free. Idle-draft rule (api.md): while idle,
// edits are a local draft and Start sends all of it; while heating, each edit
// becomes a debounced PATCH. Server updates never overwrite pending edits.
import { apiErrorText, isApiError } from "@/lib/api/errors.ts";
import {
  isHeating,
  type DeviceStatus,
  type StartCook,
  type TemperatureUnit,
  type UpdateCook,
} from "@/lib/api/types.ts";

export const TEMP_RANGE: Record<TemperatureUnit, readonly [number, number]> = {
  c: [25, 100],
  f: [77, 211],
};
export const MINUTES_MAX = 6000;
export const EDIT_DEBOUNCE_MS = 1000;
/** How long after an auto-stop the "Stopped automatically" notice stays up. */
export const AUTO_STOP_NOTICE_MS = 60 * 60 * 1000;

export interface CookValues {
  temperature: number;
  unit: TemperatureUnit;
  minutes: number;
  autoStop: boolean;
}

export interface Invalid {
  temperature?: string;
  minutes?: string;
  autoStop?: string;
}

export type CookMode = "loading" | "offline" | "idle" | "heating";

export interface CookView {
  mode: CookMode;
  /** What the inputs show: server values with local edits on top. */
  values: CookValues;
  current?: number;
  /** Start/Stop in flight. */
  busy: boolean;
  /** A PATCH is pending or in flight. */
  saving: boolean;
  invalid: Invalid;
  error: string | null;
  /** The last cook ended by auto-stop and the alarm may still sound. */
  autoStopped: boolean;
  /** ISO time the cooker stops on its own. */
  stopsAt?: string;
}

export interface CookApi {
  start(body: StartCook): Promise<DeviceStatus>;
  update(body: UpdateCook): Promise<DeviceStatus>;
  stop(): Promise<DeviceStatus>;
}

export interface CookControllerOptions {
  debounceMs?: number;
  now?: () => number;
}

const DEFAULTS: CookValues = {
  temperature: 57,
  unit: "c",
  minutes: 0,
  autoStop: false,
};

export function toUnit(
  t: number,
  from: TemperatureUnit,
  to: TemperatureUnit,
): number {
  if (from === to) return t;
  const v = to === "f" ? (t * 9) / 5 + 32 : ((t - 32) * 5) / 9;
  const [min, max] = TEMP_RANGE[to];
  return Math.min(max, Math.max(min, Math.round(v * 10) / 10));
}

export function validate(v: CookValues): Invalid {
  const out: Invalid = {};
  const [min, max] = TEMP_RANGE[v.unit];
  if (
    !Number.isFinite(v.temperature) ||
    v.temperature < min ||
    v.temperature > max
  ) {
    out.temperature = `Enter ${min}–${max} °${v.unit.toUpperCase()}`;
  }
  if (
    !Number.isInteger(v.minutes) ||
    v.minutes < 0 ||
    v.minutes > MINUTES_MAX
  ) {
    out.minutes = `Enter up to ${MINUTES_MAX / 60} hours`;
  }
  if (v.autoStop && !(v.minutes > 0))
    out.autoStop = "Set a timer to stop automatically";
  return out;
}

const isValid = (i: Invalid) => !i.temperature && !i.minutes && !i.autoStop;

function serverValues(s: DeviceStatus | null): CookValues {
  const st = s?.state;
  if (!st) return DEFAULTS;
  return {
    temperature: st.target_temperature,
    unit: st.unit,
    minutes: st.timer_running ? st.timer_value : 0,
    autoStop: !!(s?.cook && !s.cook.ended_at && s.cook.auto_stop),
  };
}

function errorText(e: unknown): string {
  if (isApiError(e, "invalid_input"))
    return e.message || "Check the values and try again.";
  return apiErrorText(e);
}

export class CookController {
  private status: DeviceStatus | null = null;
  /** Idle only: the unsent draft, or null to follow the cooker. */
  private draft: CookValues | null = null;
  /** Heating only: edits not yet confirmed by the server. */
  private pending: UpdateCook = {};
  /** The PATCH in flight; shown until its response replaces it. */
  private sending: UpdateCook = {};
  private timer?: ReturnType<typeof setTimeout>;
  private inFlight = false;
  private busy = false;
  private error: string | null = null;
  private invalid: Invalid = {};
  private silenced = new Set<string>();
  private view: CookView;
  private listeners = new Set<() => void>();
  private readonly debounceMs: number;
  private readonly now: () => number;
  private disposed = false;

  constructor(
    private readonly api: CookApi,
    opts: CookControllerOptions = {},
  ) {
    this.debounceMs = opts.debounceMs ?? EDIT_DEBOUNCE_MS;
    this.now = opts.now ?? Date.now;
    this.view = this.compute();
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = (): CookView => this.view;

  /** Latest status from the stream or a command response. */
  setStatus(s: DeviceStatus | null): void {
    const wasHeating = isHeating(this.status);
    this.status = s;
    const heating = isHeating(s);
    if (wasHeating && !heating) {
      // The cook ended (here or elsewhere): drop unsent edits.
      this.clearPending();
    } else if (!wasHeating && heating) {
      // Someone started it: the draft no longer applies.
      this.draft = null;
    }
    this.emit();
  }

  editTemperature(t: number): void {
    this.edit({ temperature: t });
  }

  /** Switching units converts the shown temperature. */
  editUnit(unit: TemperatureUnit): void {
    const v = this.view.values;
    if (unit === v.unit) return;
    this.edit({ unit, temperature: toUnit(v.temperature, v.unit, unit) });
  }

  editMinutes(minutes: number): void {
    // 0 stops the timer, which also turns auto-stop off (api.md).
    this.edit(minutes === 0 ? { minutes, autoStop: false } : { minutes });
  }

  editAutoStop(autoStop: boolean): void {
    this.edit({ autoStop });
  }

  async start(): Promise<void> {
    if (this.busy || this.view.mode !== "idle") return;
    const v = this.view.values;
    const invalid = validate(v);
    if (!isValid(invalid)) {
      this.invalid = invalid;
      this.emit();
      return;
    }
    const body: StartCook = { temperature: v.temperature, unit: v.unit };
    if (v.minutes > 0) {
      body.minutes = v.minutes;
      body.auto_stop = v.autoStop;
    }
    await this.command(
      () => this.api.start(body),
      () => {
        this.draft = null;
      },
    );
  }

  /** Stop heating; also silences the alarm after an auto-stop. */
  async stop(): Promise<void> {
    if (this.busy) return;
    const cookId = this.status?.cook?.id;
    this.clearPending();
    await this.command(
      () => this.api.stop(),
      () => {
        if (cookId) this.silenced.add(cookId);
      },
    );
  }

  dismissError(): void {
    this.error = null;
    this.emit();
  }

  /** For a React effect: (re)activates and returns the cleanup (StrictMode-safe). */
  attach(): () => void {
    this.disposed = false;
    return () => this.dispose();
  }

  /** Drops unsent edits and stops timers. */
  dispose(): void {
    this.disposed = true;
    this.clearPending();
  }

  // ---- internals ----

  private edit(change: Partial<CookValues>): void {
    const mode = this.view.mode;
    if (mode === "heating") {
      const p: UpdateCook = { ...this.pending };
      if (change.temperature !== undefined || change.unit !== undefined) {
        // Temperature and unit always travel together.
        p.temperature = change.temperature ?? this.view.values.temperature;
        p.unit = change.unit ?? this.view.values.unit;
      }
      if (change.minutes !== undefined) {
        p.minutes = change.minutes;
        if (change.minutes === 0) delete p.auto_stop;
      }
      if (change.autoStop !== undefined && !(change.minutes === 0))
        p.auto_stop = change.autoStop;
      this.pending = p;
      this.error = null;
      this.invalid = validate(this.overlay());
      this.schedule();
    } else {
      this.draft = { ...this.view.values, ...change };
      this.error = null;
      this.invalid = validate(this.draft);
    }
    this.emit();
  }

  private overlay(): CookValues {
    const base = serverValues(this.status);
    const p = { ...this.sending, ...this.pending };
    if (this.pending.minutes === 0) delete p.auto_stop;
    const minutes = p.minutes ?? base.minutes;
    return {
      temperature: p.temperature ?? base.temperature,
      unit: p.unit ?? base.unit,
      minutes,
      autoStop:
        p.minutes === 0
          ? false
          : (p.auto_stop ?? (minutes > 0 && base.autoStop)),
    };
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  private async flush(): Promise<void> {
    this.timer = undefined;
    if (
      this.disposed ||
      this.inFlight ||
      Object.keys(this.pending).length === 0
    )
      return;
    if (!isHeating(this.status)) {
      this.clearPending();
      this.emit();
      return;
    }
    const invalid = validate(this.overlay());
    if (!isValid(invalid)) {
      // Keep the edit on screen with its message; nothing is sent.
      this.invalid = invalid;
      this.emit();
      return;
    }
    const body = this.pending;
    this.pending = {};
    this.sending = body;
    this.inFlight = true;
    this.emit();
    try {
      const s = await this.api.update(body);
      if (this.disposed) return;
      this.inFlight = false;
      this.sending = {};
      this.setStatus(s);
    } catch (e) {
      if (this.disposed) return;
      this.inFlight = false;
      this.sending = {};
      this.error = errorText(e);
      this.emit();
    }
    // Edits made while the request was in flight.
    if (Object.keys(this.pending).length > 0 && !this.timer) this.schedule();
  }

  private async command(
    run: () => Promise<DeviceStatus>,
    onOk: () => void,
  ): Promise<void> {
    this.busy = true;
    this.error = null;
    this.invalid = {};
    this.emit();
    try {
      const s = await run();
      if (this.disposed) return;
      onOk();
      this.busy = false;
      this.setStatus(s);
    } catch (e) {
      if (this.disposed) return;
      this.busy = false;
      this.error = errorText(e);
      this.emit();
    }
  }

  private clearPending(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = {};
    this.sending = {};
    this.invalid = {};
  }

  private compute(): CookView {
    const s = this.status;
    const mode: CookMode = !s
      ? "loading"
      : !s.online || !s.state
        ? "offline"
        : isHeating(s)
          ? "heating"
          : "idle";
    const values =
      mode === "heating" ? this.overlay() : (this.draft ?? serverValues(s));
    const cook = s?.cook;
    const autoStopped =
      mode !== "heating" &&
      !!cook &&
      cook.end_reason === "auto_stop" &&
      !!cook.ended_at &&
      !this.silenced.has(cook.id) &&
      this.now() - Date.parse(cook.ended_at) < AUTO_STOP_NOTICE_MS;
    return {
      mode,
      values,
      current: s?.state?.current_temperature,
      busy: this.busy,
      saving: this.inFlight || Object.keys(this.pending).length > 0,
      invalid: this.invalid,
      error: this.error,
      autoStopped,
      stopsAt: mode === "heating" ? cook?.stops_at : undefined,
    };
  }

  private emit(): void {
    if (this.disposed) return;
    this.view = this.compute();
    for (const l of this.listeners) l();
  }
}
