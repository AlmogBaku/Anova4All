// One small line drawing per setup step, each acting out what is happening.
// Decorative: the step's heading and copy carry the meaning.
import type { ReactNode } from "react";
import { SERVER } from "./copy.ts";

const BT = "m7 7 10 10-5 5V2l5 5L7 17";

function Il({
  viewBox = "0 0 260 180",
  children,
}: {
  viewBox?: string;
  children: ReactNode;
}) {
  return (
    <svg aria-hidden className="setup-il" viewBox={viewBox}>
      {children}
    </svg>
  );
}

/** Preflight: a laptop and a phone, with Bluetooth waves. */
export function PreflightArt() {
  return (
    <Il>
      <rect className="il-fill" x="46" y="34" width="140" height="90" rx="8" />
      <path className="il-fill" d="M30 132h172l-9 11H39z" />
      <path d="M106 138h20" />
      <path transform="translate(101 64) scale(1.25)" d={BT} />
      <g className="il-cu">
        <path className="il-wave" d="M132.6 63.4a22 22 0 0 1 0 31.2" />
        <path className="il-wave il-w2" d="M141 55a34 34 0 0 1 0 48" />
        <path className="il-wave" d="M99.4 63.4a22 22 0 0 0 0 31.2" />
        <path className="il-wave il-w2" d="M91 55a34 34 0 0 0 0 48" />
      </g>
      <rect className="il-fill" x="206" y="74" width="36" height="66" rx="8" />
      <path d="M218 81h12" />
    </Il>
  );
}

/** Get ready: the cooker's panel, its Wi-Fi icon pulsing, the cable plugged in. */
export function ReadyArt() {
  return (
    <Il>
      <circle cx="130" cy="86" r="72" />
      <circle
        className="il-rail"
        cx="130"
        cy="86"
        r="66"
        style={{ strokeWidth: 7, strokeDasharray: "1.4 5.5" }}
      />
      <circle className="il-fill" cx="130" cy="86" r="58" />
      <rect x="94" y="56" width="72" height="36" rx="9" />
      <text className="il-lcd" x="130" y="82">
        57.0°
      </text>
      <text x="106" y="120">
        °C
      </text>
      <path d="M151 112.5l7 4.5-7 4.5z" />
      <g className="il-cu">
        <circle className="il-halo il-box" cx="130" cy="116" r="8" />
        <g className="il-blink">
          <path d="M126.3 114.3a5.2 5.2 0 0 1 7.4 0" />
          <path d="M123 111a10 10 0 0 1 14 0" />
          <circle className="il-dot il-cu" cx="130" cy="118.3" r="1.6" />
        </g>
      </g>
      <path d="M150 154c10 16 34 20 52 12" />
      <rect className="il-fill" x="202" y="158" width="18" height="13" rx="3" />
      <path d="M220 161.5h6M220 167.5h6" />
    </Il>
  );
}

/** Find: rings sweep from the phone to the cooker. */
export function FindArt() {
  return (
    <Il>
      <rect className="il-fill" x="24" y="50" width="50" height="90" rx="10" />
      <path d="M41 58h16" />
      <path transform="translate(39 83) scale(.85)" d={BT} />
      <g className="il-cu" transform="translate(84 95)">
        <path className="il-sweep il-sw1 il-box" d="M0-22a30 30 0 0 1 0 44" />
        <path className="il-sweep il-sw2 il-box" d="M0-22a30 30 0 0 1 0 44" />
        <path className="il-sweep il-sw3 il-box" d="M0-22a30 30 0 0 1 0 44" />
      </g>
      <rect className="il-fill" x="196" y="22" width="44" height="50" rx="13" />
      <rect x="205" y="34" width="26" height="15" rx="3" />
      <rect className="il-fill" x="200" y="72" width="36" height="11" rx="3" />
      <path className="il-fill" d="M206 83v76a12 12 0 0 0 24 0V83" />
    </Il>
  );
}

/** Key: a copper key slides into the cooker. */
export function KeyArt() {
  return (
    <Il>
      <g className="il-cu il-key">
        <circle cx="50" cy="80" r="14" />
        <circle cx="50" cy="80" r="4.5" />
        <path d="M64 80h100" />
        <path d="M128 80v10h6v-6h6v6h6v-10" />
      </g>
      <rect className="il-fill" x="150" y="36" width="66" height="80" rx="20" />
      <rect x="165" y="52" width="36" height="20" rx="4" />
      <path d="M150 80h6" />
      <rect className="il-fill" x="156" y="116" width="54" height="12" rx="4" />
      <path d="M166 128v52M200 128v52" />
    </Il>
  );
}

/** Server: a pulse runs from the cooker through the router to the server. */
export function ServerArt() {
  const route = "M56 70C84 70 94 100 130 100S178 96 196 96";
  return (
    <Il viewBox="18 36 232 124">
      <path className="il-rail" d={route} style={{ strokeDasharray: "2 5" }} />
      <path className="il-cu il-pulse" pathLength={100} d={route} />
      <rect className="il-fill" x="32" y="52" width="24" height="28" rx="8" />
      <path className="il-fill" d="M38 80v42a6 6 0 0 0 12 0V80" />
      <path d="M116 92l-6-16M144 92l6-16" />
      <rect className="il-fill" x="106" y="92" width="48" height="20" rx="6" />
      <circle className="il-dot" cx="118" cy="102" r="1.6" />
      <circle className="il-dot" cx="125" cy="102" r="1.6" />
      {[64, 86, 108].map((y) => (
        <g key={y}>
          <rect
            className="il-fill"
            x="196"
            y={y}
            width="42"
            height="18"
            rx="4"
          />
          <circle className="il-dot" cx="205" cy={y + 9} r="1.6" />
        </g>
      ))}
      <text x="44" y="146">
        {SERVER.labels.cooker}
      </text>
      <text x="130" y="146">
        {SERVER.labels.router}
      </text>
      <text x="217" y="146">
        {SERVER.labels.server}
      </text>
    </Il>
  );
}

const ARCS = [
  "M108.8 130.8a30 30 0 0 1 42.4 0",
  "M89 111a58 58 0 0 1 82 0",
  "M69.2 91.2a86 86 0 0 1 121.6 0",
];

/** Wi-Fi: the arcs fill. `network` is printed under the dot when known. */
export function WifiArt({ network }: { network?: string }) {
  return (
    <Il>
      {ARCS.map((d) => (
        <path key={d} className="il-rail il-arc" d={d} />
      ))}
      <g className="il-cu">
        {ARCS.map((d, i) => (
          <path
            key={d}
            className={`il-arc il-fillarc${i ? ` il-f${i + 1}` : ""}`}
            d={d}
          />
        ))}
      </g>
      <circle className="il-dot" cx="130" cy="150" r="5" />
      {network && (
        <text x="130" y="175">
          {network}
        </text>
      )}
    </Il>
  );
}

/** Pair: a ring that drains over the minute, with the seconds left in it. */
export function PairRing({
  left,
  total,
  label,
  unit,
}: {
  left: number;
  total: number;
  label: string;
  unit: string;
}) {
  const drained = ((total - left) / total) * 100;
  return (
    <div className="relative grid aspect-square h-[min(220px,100%)] max-w-full place-items-center">
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="absolute inset-0 size-full -scale-y-100 -rotate-90"
      >
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="var(--rail-hi)"
          strokeWidth="2"
        />
        <circle
          className="setup-ring-drain"
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="var(--heat)"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100 100"
          style={{ strokeDashoffset: drained }}
        />
      </svg>
      <div role="timer" aria-label={label} className="text-center">
        <span
          aria-hidden
          className="block text-[4.25rem] leading-none font-extralight tracking-[-0.04em] tabular-nums"
        >
          {left}
        </span>
        <span aria-hidden className="text-[0.8125rem] text-ink-soft">
          {unit}
        </span>
      </div>
    </div>
  );
}

/** Timed out: the empty ring with a warning in it. */
export function LateArt({ icon }: { icon: ReactNode }) {
  return (
    <div className="relative grid aspect-square h-[min(150px,100%)] max-w-full place-items-center text-ink-soft">
      <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0">
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="var(--rail)"
          strokeWidth="2"
        />
      </svg>
      {icon}
    </div>
  );
}

/** Name: the cooker's display, showing whatever is typed. */
export function NameArt({ name }: { name: string }) {
  return (
    <Il>
      <rect
        className="il-fill"
        x="40"
        y="22"
        width="180"
        height="120"
        rx="40"
      />
      <rect x="66" y="48" width="128" height="56" rx="12" />
      <path className="il-soft" d="M122.5 124.5a10 10 0 0 1 15 0" />
      <circle className="il-dot il-soft" cx="130" cy="129" r="1.6" />
      <path className="il-soft" d="M156 120l7 4.5-7 4.5z" />
      <text x="100" y="128">
        °C
      </text>
      <rect className="il-fill" x="52" y="148" width="156" height="14" rx="7" />
      <path
        className="il-rail"
        d="M62 155h136"
        style={{ strokeDasharray: "1.4 5" }}
      />
      {/* The display: HTML inside, so a long name ends in an ellipsis. */}
      <foreignObject x="66" y="48" width="128" height="56">
        <div className="flex h-full items-center justify-center px-2 text-[20px] font-light tracking-[-0.02em] text-ink">
          <span className="truncate">{name}</span>
          <span className="setup-caret ml-0.5 h-[1.1em] w-[1.5px] shrink-0 bg-heat" />
        </div>
      </foreignObject>
    </Il>
  );
}
