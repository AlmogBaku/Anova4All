// Pure geometry and value math for the temperature dial. Angles are in
// degrees, clockwise from +x in screen space (y grows down).
import type { TemperatureUnit } from "@/lib/api/types.ts";
import { TEMP_RANGE } from "./controller.ts";

/** The ring starts at the bottom-left… */
export const ARC_START = 135;
/** …and sweeps 270° clockwise to the bottom-right, open at the bottom. */
export const ARC_SWEEP = 270;

export const stepFor = (unit: TemperatureUnit) => (unit === "c" ? 0.5 : 1);

/** A point `fraction` of the way along the ring. */
export function pointAt(
  fraction: number,
  cx: number,
  cy: number,
  r: number,
): [number, number] {
  const a = ((ARC_START + ARC_SWEEP * fraction) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** How far along the ring (0–1) a pointer at (dx, dy) from the centre is. The bottom gap clamps to the nearer end. */
export function fractionAt(dx: number, dy: number): number {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const rel = (((deg - ARC_START) % 360) + 360) % 360;
  if (rel <= ARC_SWEEP) return rel / ARC_SWEEP;
  return rel < ARC_SWEEP + (360 - ARC_SWEEP) / 2 ? 1 : 0;
}

/** Whether a pointer at (dx, dy) from the centre points into the ring's open bottom, where the unit switch sits. */
export function inGap(dx: number, dy: number): boolean {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const rel = (((deg - ARC_START) % 360) + 360) % 360;
  return rel > ARC_SWEEP;
}

/** The ring band, in ring radii from the centre, that answers a press. */
export const RING_BAND = [0.72, 1.3] as const;

/**
 * What a pointer press on the dial does: grab the knob where it is, jump the
 * knob to the pressed point on the ring, or nothing. The numbers in the
 * middle, the open bottom (the unit switch) and other controls never move it.
 */
export function pressAction(p: {
  disabled: boolean;
  button: number;
  /** The press landed on the knob. */
  onKnob: boolean;
  /** The press landed on another control inside the dial (the unit switch). */
  onControl: boolean;
  dx: number;
  dy: number;
  /** Distance from the centre in ring radii. */
  dist: number;
}): "ignore" | "grab" | "jump" {
  if (p.disabled || p.button !== 0 || p.onControl) return "ignore";
  if (p.onKnob) return "grab";
  if (p.dist < RING_BAND[0] || p.dist > RING_BAND[1]) return "ignore";
  if (inGap(p.dx, p.dy)) return "ignore";
  return "jump";
}

/** fractionAt for a drag in progress: a jump of more than half the ring means the pointer crossed the bottom gap, so stay at the end it came from. */
export function dragFraction(
  dx: number,
  dy: number,
  prev: number | undefined,
): number {
  const f = fractionAt(dx, dy);
  if (prev === undefined || Math.abs(f - prev) <= 0.5) return f;
  return prev > 0.5 ? 1 : 0;
}

/** Round to the unit's step and keep within the cooker's range. */
export function snap(v: number, unit: TemperatureUnit): number {
  const [lo, hi] = TEMP_RANGE[unit];
  const step = stepFor(unit);
  const n = Math.round(v / step) * step;
  return Math.min(hi, Math.max(lo, Number(n.toFixed(1))));
}

export function fractionOf(v: number, unit: TemperatureUnit): number {
  const [lo, hi] = TEMP_RANGE[unit];
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
}

export function valueAt(fraction: number, unit: TemperatureUnit): number {
  const [lo, hi] = TEMP_RANGE[unit];
  return snap(lo + (hi - lo) * fraction, unit);
}

/** The value a slider key moves to, or null for keys the dial ignores. */
export function keyValue(
  key: string,
  v: number,
  unit: TemperatureUnit,
): number | null {
  const [lo, hi] = TEMP_RANGE[unit];
  const step = stepFor(unit);
  switch (key) {
    case "ArrowUp":
    case "ArrowRight":
      return snap(v + step, unit);
    case "ArrowDown":
    case "ArrowLeft":
      return snap(v - step, unit);
    case "PageUp":
      return snap(v + step * 10, unit);
    case "PageDown":
      return snap(v - step * 10, unit);
    case "Home":
      return lo;
    case "End":
      return hi;
    default:
      return null;
  }
}

export type HeatState = "heating" | "at" | "cooling" | "unknown";

/** Where the water is relative to the target, within one step. */
export function heatState(
  current: number | undefined,
  target: number,
  unit: TemperatureUnit,
): HeatState {
  if (current === undefined) return "unknown";
  const tol = stepFor(unit);
  if (current < target - tol) return "heating";
  if (current > target + tol) return "cooling";
  return "at";
}

/** A water reading shown in another unit, to 0.1°. Not clamped: it is a measurement, not a setting. */
export function readingIn(
  t: number,
  from: TemperatureUnit,
  to: TemperatureUnit,
): number {
  if (from === to) return t;
  const v = to === "f" ? (t * 9) / 5 + 32 : ((t - 32) * 5) / 9;
  return Math.round(v * 10) / 10;
}

/** The unit a radio value stands for, or null for anything else. */
export function unitOf(value: string): TemperatureUnit | null {
  return value === "c" || value === "f" ? value : null;
}
