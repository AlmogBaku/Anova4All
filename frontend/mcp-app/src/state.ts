// What the cooker card shows, derived from the MCP tool results (internal/mcp/tools.go).
import type {
  CookerStatus,
  DeviceStatus,
  TemperatureUnit,
} from "../../src/lib/api/types.ts";

export type { DeviceStatus, TemperatureUnit };

/** A tool error (tools.go ErrorInfo). */
export interface ToolError {
  code: string;
  message: string;
  retry_after_seconds?: number;
}

/** Every tool's structuredContent (tools.go Result). */
export interface ToolResult {
  devices?: DeviceStatus[];
  error?: ToolError;
}

/** How long after an auto-stop the card keeps offering Silence (as the web app). */
export const AUTO_STOP_NOTICE_MS = 60 * 60 * 1000;

export const LIMITS = {
  c: { min: 25, max: 100 },
  f: { min: 77, max: 211 },
  minutes: { min: 0, max: 6000 },
} as const;

/** What the card knows: the last good device list and the last error. */
export interface CardData {
  /** null until the first tool result arrives. */
  devices: DeviceStatus[] | null;
  error: ToolError | null;
  /** The cooker this card is for, once known. */
  deviceId: string | null;
  /** Auto-stopped cooks the user already silenced from the card. */
  silenced: ReadonlySet<string>;
}

export type View =
  | { kind: "loading" }
  | { kind: "no_cookers"; message: string }
  | { kind: "device_required"; devices: DeviceStatus[]; message: string }
  | { kind: "error"; message: string }
  | { kind: "offline"; device: DeviceStatus; lastSeenAt: string | null }
  | {
      kind: "idle";
      device: DeviceStatus;
      water: number;
      target: number;
      unit: TemperatureUnit;
      /** Set for statuses that need attention (low water, heater error, …). */
      alert: string | null;
      notice: string | null;
    }
  | {
      kind: "heating";
      device: DeviceStatus;
      water: number;
      target: number;
      unit: TemperatureUnit;
      timerRunning: boolean;
      /** Minutes left when the timer runs, else the set length (0 = none). */
      timerMinutes: number;
      /** The timer is set but waiting for the water to reach the target. */
      timerWaiting: boolean;
      autoStop: boolean;
      stopsAt: string | null;
      notice: string | null;
    }
  | {
      kind: "auto_stopped";
      device: DeviceStatus;
      water: number;
      target: number;
      unit: TemperatureUnit;
      endedAt: string;
      notice: string | null;
    };

const ALERTS: Partial<Record<CookerStatus, string>> = {
  "low water": "Low water. Add water to the pot.",
  "heater error": "Heater error. Check the cooker.",
  "power loss": "The cooker lost power.",
};

/** Merges a tool result into the card data. */
export function applyResult(data: CardData, result: ToolResult): CardData {
  const devices = result.devices ?? null;
  let deviceId = data.deviceId;
  if (!deviceId && devices?.length === 1 && !result.error) {
    deviceId = devices[0].id;
  }
  if (result.error) {
    return {
      ...data,
      deviceId,
      error: result.error,
      // device_required lists the choices; other errors keep what we had.
      devices: devices && devices.length > 0 ? devices : data.devices,
    };
  }
  if (!devices) return { ...data, deviceId, error: null };
  // A single-device result updates that device in the list.
  const merged =
    devices.length === 1 && data.devices && data.devices.length > 1
      ? data.devices.map((d) => (d.id === devices[0].id ? devices[0] : d))
      : devices;
  return { ...data, deviceId, devices: merged, error: null };
}

/** Pure: the view for the card data at `now` (ms). */
export function deriveView(data: CardData, now: number): View {
  const { devices, error, deviceId } = data;
  if (devices === null && error === null) return { kind: "loading" };
  if (error?.code === "no_cookers" || (devices?.length === 0 && !error)) {
    return {
      kind: "no_cookers",
      message:
        error?.message ??
        "You have no cookers yet. Pair one in the Anova4All web app first.",
    };
  }
  const device = deviceId
    ? devices?.find((d) => d.id === deviceId)
    : devices?.length === 1
      ? devices[0]
      : undefined;
  if (!device) {
    if (devices && devices.length > 1) {
      return {
        kind: "device_required",
        devices,
        message: "Pick a cooker to show.",
      };
    }
    return { kind: "error", message: error?.message ?? "Cooker not found." };
  }
  const notice = error && error.code !== "rate_limited" ? error.message : null;
  const st = device.state;
  if (!device.online || !st) {
    return { kind: "offline", device, lastSeenAt: device.last_seen_at ?? null };
  }
  const base = {
    device,
    water: st.current_temperature,
    target: st.target_temperature,
    unit: st.unit,
    notice,
  };
  const cook = device.cook;
  if (st.status === "running") {
    const open = cook && !cook.ended_at ? cook : undefined;
    return {
      kind: "heating",
      ...base,
      timerRunning: st.timer_running,
      timerMinutes: st.timer_value,
      timerWaiting: !!open?.timer_waiting,
      autoStop: !!open?.auto_stop,
      stopsAt: open?.stops_at ?? null,
    };
  }
  if (
    cook?.end_reason === "auto_stop" &&
    cook.ended_at &&
    cook.alarm &&
    !data.silenced.has(cook.id) &&
    now - Date.parse(cook.ended_at) < AUTO_STOP_NOTICE_MS
  ) {
    return { kind: "auto_stopped", ...base, endedAt: cook.ended_at };
  }
  return { kind: "idle", ...base, alert: ALERTS[st.status] ?? null };
}

export function emptyData(): CardData {
  return { devices: null, error: null, deviceId: null, silenced: new Set() };
}

export function unitLabel(unit: TemperatureUnit): string {
  return unit === "f" ? "°F" : "°C";
}

export function formatTemp(t: number, unit: TemperatureUnit): string {
  return `${Number.isInteger(t) ? t : t.toFixed(1)} ${unitLabel(unit)}`;
}

/** "HH:MM" in the viewer's local time. */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min} min`;
  return min === 0 ? `${h} h` : `${h} h ${min} min`;
}

export function clampTemp(t: number, unit: TemperatureUnit): number {
  const { min, max } = LIMITS[unit];
  return Math.min(max, Math.max(min, t));
}

export function clampMinutes(m: number): number {
  return Math.min(LIMITS.minutes.max, Math.max(LIMITS.minutes.min, m));
}
