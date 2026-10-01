// The temperature dial: one 270° scale over the cooker's range. The copper arc
// is the water temperature; the knob is the target, and it can be dragged.
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { TemperatureUnit } from "@/lib/api/types.ts";
import { cn } from "@/lib/utils.ts";
import {
  dragFraction,
  fractionOf,
  heatState,
  keyValue,
  pressAction,
  pointAt,
  readingIn,
  valueAt,
} from "./dial.ts";
import { UnitSwitch } from "./unit-switch.tsx";

const R = 88;
const C = 2 * Math.PI * R;
const ARC = C * 0.75;

/** An SVG arc along the ring from fraction a to b. */
function arcPath(a: number, b: number) {
  const [x0, y0] = pointAt(a, 100, 100, R);
  const [x1, y1] = pointAt(b, 100, 100, R);
  const large = (b - a) * 270 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
}

const deg = (v: number) => `${v}°`;

/** A quick roll up into place, for numbers that just changed unit. */
function rollIn(root: HTMLElement | null) {
  if (!root || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const el of root.querySelectorAll("[data-roll]")) {
    el.animate(
      [
        { transform: "translateY(0.35em)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }
}

export function Dial({
  current: reading,
  readingUnit,
  target,
  unit,
  heating,
  fresh,
  live,
  modeLabel,
  stopsAt,
  disabled,
  onChange,
  onUnitChange,
}: {
  current?: number;
  /** The unit the cooker reports the water in; the dial shows it in `unit`. */
  readingUnit?: TemperatureUnit;
  target: number;
  unit: TemperatureUnit;
  heating: boolean;
  fresh: boolean;
  /** The cooker is reachable (idle or heating). */
  live: boolean;
  /** Shown instead of the target line while not live. */
  modeLabel: string;
  stopsAt?: string;
  disabled: boolean;
  onChange: (t: number) => void;
  onUnitChange: (u: TemperatureUnit) => void;
}) {
  const [dragging, setDragging] = useState(false);
  // A drag only counts while the dial is enabled.
  const active = dragging && !disabled;
  const knob = useRef<HTMLDivElement>(null);
  const center = useRef<HTMLDivElement>(null);
  const shownUnit = useRef(unit);
  useEffect(() => {
    if (shownUnit.current === unit) return;
    shownUnit.current = unit;
    rollIn(center.current);
  }, [unit]);
  const current =
    reading === undefined
      ? undefined
      : readingIn(reading, readingUnit ?? unit, unit);
  const last = useRef<{ f: number; v: number } | undefined>(undefined);
  const sym = `°${unit.toUpperCase()}`;
  const tf = fractionOf(target, unit);
  const cf = current === undefined ? 0 : fractionOf(current, unit);
  const state = heatState(current, target, unit);
  const [kx, ky] = pointAt(tf, 100, 100, R);
  const [hx, hy] = pointAt(cf, 100, 100, R);

  const set = (v: number) => {
    if (v === target) return;
    onChange(v);
    navigator.vibrate?.(5);
  };

  const track = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    return { dx, dy, dist: Math.hypot(dx, dy) / ((box.width / 200) * R) };
  };
  const moveTo = (dx: number, dy: number) => {
    const f = dragFraction(dx, dy, last.current?.f);
    const v = valueAt(f, unit);
    last.current = { f, v };
    set(v);
  };

  const line = !live
    ? modeLabel
    : !heating
      ? `Not heating · Set ${deg(target)}`
      : state === "heating"
        ? `Heating to ${deg(target)}`
        : state === "cooling"
          ? `Cooling to ${deg(target)}`
          : state === "at"
            ? `At temperature · ${deg(target)}`
            : `Set ${deg(target)}`;

  return (
    <div
      className={cn(
        "relative mx-auto aspect-square w-full -mb-5 max-w-[14.5rem] touch-none select-none sm:mb-0 sm:max-w-[22rem]",
        !disabled && "cursor-pointer",
      )}
      onPointerDown={(e) => {
        const { dx, dy, dist } = track(e);
        const el = e.target as HTMLElement;
        const action = pressAction({
          disabled,
          button: e.button,
          onKnob: !!el.closest("[role=slider]"),
          onControl: !!el.closest("[role=radiogroup]"),
          dx,
          dy,
          dist,
        });
        if (action === "ignore") return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        knob.current?.focus({ preventScroll: true });
        last.current = { f: tf, v: target };
        setDragging(true);
        if (action === "jump") moveTo(dx, dy);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        // Disabled mid-drag (e.g. the cooker went offline): let go.
        if (disabled) {
          setDragging(false);
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          return;
        }
        const { dx, dy } = track(e);
        moveTo(dx, dy);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onLostPointerCapture={() => setDragging(false)}
    >
      <svg viewBox="0 0 200 200" aria-hidden className="size-full">
        <defs>
          <linearGradient id="dial-heat" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--heat)" />
            <stop offset="1" stopColor="var(--heat-hi)" />
          </linearGradient>
        </defs>
        {/* Track, and the stretch up to the target in a faint rail tint. */}
        <g transform="rotate(135 100 100)">
          <circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke="var(--rail-hi)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${ARC} ${C}`}
          />
          <circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke="var(--rail)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${ARC * tf} ${C}`}
          />
        </g>
        {/* The gap still to close: dashed copper while heating. */}
        {heating && current !== undefined && state !== "at" && (
          <path
            d={cf < tf ? arcPath(cf, tf) : arcPath(tf, cf)}
            fill="none"
            stroke="var(--heat)"
            strokeOpacity="0.55"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="0.5 5"
          />
        )}
        {/* Water temperature. */}
        {cf > 0 && (
          <g transform="rotate(135 100 100)">
            <circle
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={heating ? "url(#dial-heat)" : "var(--ink-soft)"}
              strokeOpacity={heating ? 1 : 0.35}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${ARC * cf} ${C}`}
              className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
            />
          </g>
        )}
        {cf > 0 && (
          <circle
            cx={hx}
            cy={hy}
            r="2"
            fill="var(--paper)"
            className={cn(!heating && "opacity-0")}
          />
        )}
      </svg>

      <div
        ref={knob}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Target temperature"
        aria-valuemin={valueAt(0, unit)}
        aria-valuemax={valueAt(1, unit)}
        aria-valuenow={target}
        aria-valuetext={`${target} ${sym}`}
        aria-disabled={disabled || undefined}
        className="group absolute grid size-11 -translate-1/2 place-items-center rounded-full outline-none"
        style={{ left: `${kx / 2}%`, top: `${ky / 2}%` }}
        onKeyDown={(e) => {
          if (disabled) return;
          const v = keyValue(e.key, target, unit);
          if (v === null) return;
          e.preventDefault();
          set(v);
        }}
      >
        <span
          className={cn(
            // One ring, no drop shadow; copper only while heating.
            "size-6 rounded-full border-[3px] bg-paper transition-[box-shadow,scale] group-focus-visible:shadow-[0_0_0_3px_var(--paper),0_0_0_5px_var(--ink)] motion-reduce:transition-none",
            disabled ? "border-rail" : heating ? "border-heat" : "border-ink",
            active && "scale-110",
          )}
        />
      </div>

      <div
        ref={center}
        className="pointer-events-none absolute inset-0 grid place-content-center pb-4 text-center"
      >
        <p className="text-[0.6875rem] font-medium tracking-[0.08em] text-ink-soft uppercase">
          {active ? "Set to" : "Water"}
        </p>
        <p
          data-roll
          className={cn(
            "text-[4rem] leading-none font-extralight tracking-[-0.04em] tabular-nums sm:text-[6rem]",
            active ? "text-heat" : !fresh && "text-ink-soft",
          )}
        >
          {active ? target : (current ?? "--")}
          <span className="align-top text-[0.32em] font-light tracking-normal text-ink-soft">
            {sym}
          </span>
          <span className="sr-only">
            {active ? " target temperature" : " water temperature"}
          </span>
        </p>
        <p
          data-roll
          className="mt-2 text-[0.8125rem] text-ink-soft tabular-nums"
        >
          {line}
        </p>
        <p className="min-h-[1.2em] text-[0.8125rem] text-ink-soft tabular-nums">
          {stopsAt ? `Stops ${stopsAt}` : ""}
        </p>
      </div>

      {/* In the ring's open bottom, between the two ends of the knob's travel. */}
      <UnitSwitch
        unit={unit}
        disabled={disabled}
        onChange={onUnitChange}
        className="absolute top-[84%] left-1/2 -translate-1/2"
      />
    </div>
  );
}
