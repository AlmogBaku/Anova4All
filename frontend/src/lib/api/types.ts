// Types of the Go API (internal/rest/api.md).

export type TemperatureUnit = "c" | "f";

export type CookerStatus =
  | "running"
  | "stopped"
  | "low water"
  | "heater error"
  | "power loss"
  | "user change parameter";

export interface CookerState {
  status: CookerStatus;
  current_temperature: number;
  target_temperature: number;
  timer_running: boolean;
  /** Minutes left. */
  timer_value: number;
  unit: TemperatureUnit;
  speaker_status: boolean;
}

export type CookEndReason = "auto_stop" | "stopped" | "manual";

export interface Cook {
  id: string;
  started_at: string;
  auto_stop: boolean;
  /** Only while open, auto_stop on and the timer running. */
  stops_at?: string;
  /** The timer is set but waiting for the water to reach the target temperature before starting. Open cooks only. */
  timer_waiting?: boolean;
  /** Closed cooks only. */
  ended_at?: string;
  end_reason?: CookEndReason;
  /** Ended by auto-stop and nobody silenced the alarm yet (server-side, shared). */
  alarm?: boolean;
}

export interface DeviceStatus {
  id: string;
  name: string;
  is_owner: boolean;
  online: boolean;
  last_seen_at?: string;
  /** Omitted while the cooker is offline. */
  state?: CookerState;
  /** Open cook, else the last one; omitted if none ever. */
  cook?: Cook;
}

export interface ServerInfo {
  host: string;
  port: number;
}

export interface PairResult {
  id: string;
  name: string;
}

export interface StartCook {
  temperature: number;
  unit: TemperatureUnit;
  minutes?: number;
  auto_stop?: boolean;
}

export interface UpdateCook {
  temperature?: number;
  unit?: TemperatureUnit;
  minutes?: number;
  auto_stop?: boolean;
}

/** A cook is active exactly when the cooker reports heating. */
export function isHeating(status: DeviceStatus | null | undefined): boolean {
  return status?.state?.status === "running";
}
