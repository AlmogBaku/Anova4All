import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { LoaderCircleIcon, MinusIcon, PlusIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  runAction,
  statusCall,
  type Action,
  type CardHost,
} from "./actions.ts";
import { domVisibility, Poller, type PollOutcome } from "./poller.ts";
import {
  applyResult,
  clampMinutes,
  clampTemp,
  deriveView,
  emptyData,
  formatClock,
  formatMinutes,
  LIMITS,
  unitLabel,
  type CardData,
  type DeviceStatus,
  type TemperatureUnit,
  type ToolResult,
  type View,
} from "./state.ts";

const TEMP_STEP = 0.5;
const TIMER_STEP = 15;
const NOW_TICK_MS = 30_000;

function resultOf(structured: unknown): ToolResult {
  return (structured ?? {}) as ToolResult;
}

export function CookerCard() {
  const [data, setData] = useState<CardData>(emptyData);
  const [hostContext, setHostContext] = useState<McpUiHostContext>();

  const { app, error } = useApp({
    appInfo: { name: "Anova4All cooker", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (a) => {
      a.ontoolinput = (params) => {
        const id = params.arguments?.device_id;
        if (typeof id === "string" && id) {
          setData((d) => (d.deviceId ? d : { ...d, deviceId: id }));
        }
      };
      a.ontoolresult = (result) => {
        setData((d) => applyResult(d, resultOf(result.structuredContent)));
      };
      a.onhostcontextchanged = (ctx) =>
        setHostContext((prev) => ({ ...prev, ...ctx }));
      a.onteardown = async () => ({});
    },
  });
  useHostStyles(app, app?.getHostContext());

  const insets = { ...app?.getHostContext(), ...hostContext }.safeAreaInsets;
  return (
    <main
      className="card"
      style={{
        paddingTop: insets?.top,
        paddingRight: insets?.right,
        paddingBottom: insets?.bottom,
        paddingLeft: insets?.left,
      }}
    >
      {error ? (
        <p className="line">Can't reach the host: {error.message}</p>
      ) : !app ? (
        <p className="line muted">Loading…</p>
      ) : (
        <Connected app={app} data={data} setData={setData} />
      )}
    </main>
  );
}

function Connected({
  app,
  data,
  setData,
}: {
  app: App;
  data: CardData;
  setData: Dispatch<SetStateAction<CardData>>;
}) {
  const host = app as unknown as CardHost;
  const rootRef = useRef<HTMLDivElement>(null);
  const actionSeq = useRef(0);
  const [busy, setBusy] = useState(false);
  const deviceId = data.deviceId;

  useEffect(() => {
    if (!deviceId || !rootRef.current) return;
    const poller = new Poller({
      visibility: domVisibility(rootRef.current),
      poll: async (): Promise<PollOutcome> => {
        const seq = actionSeq.current;
        const res = await host.callServerTool(statusCall(deviceId));
        const result = resultOf(res.structuredContent);
        if (result.error?.code === "rate_limited") {
          return {
            rateLimited: true,
            retryAfterSeconds: result.error.retry_after_seconds,
          };
        }
        // Drop a poll that started before an action changed the cooker.
        if (seq === actionSeq.current) setData((d) => applyResult(d, result));
        return { rateLimited: false };
      },
    });
    poller.start();
    return () => poller.stop();
  }, [host, deviceId, setData]);

  const act = useCallback(
    async (action: Action, device: DeviceStatus) => {
      actionSeq.current++;
      setBusy(true);
      const result = await runAction(host, action, device);
      actionSeq.current++;
      setBusy(false);
      setData((d) => {
        const next = applyResult(d, result);
        if (action.type === "silence" && !result.error && device.cook) {
          next.silenced = new Set([...d.silenced, device.cook.id]);
        }
        return next;
      });
    },
    [host, setData],
  );

  const pick = useCallback(
    (id: string) => setData((d) => ({ ...d, deviceId: id, error: null })),
    [setData],
  );

  const now = useNow(data);
  const view = deriveView(data, now);
  return (
    <div ref={rootRef}>
      <CardView view={view} busy={busy} act={act} pick={pick} />
    </div>
  );
}

/** The time of the last data change, refreshed every 30 s (for the auto-stop notice). */
function useNow(data: CardData): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, [data]);
  return now;
}

interface ViewProps {
  view: View;
  busy: boolean;
  act: (action: Action, device: DeviceStatus) => Promise<void>;
  pick: (id: string) => void;
}

const STATE_WORD: Record<View["kind"], string> = {
  loading: "",
  no_cookers: "",
  device_required: "",
  error: "",
  offline: "Offline",
  idle: "Idle",
  heating: "Heating",
  auto_stopped: "Idle",
};

function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="panel">
      <p className="line">{children}</p>
    </section>
  );
}

function CardView({ view, busy, act, pick }: ViewProps) {
  switch (view.kind) {
    case "loading":
      return (
        <Panel>
          <span className="muted">Loading…</span>
        </Panel>
      );
    case "no_cookers":
      return <Panel>{view.message}</Panel>;
    case "error":
      return (
        <section className="panel">
          <p className="line danger" role="alert">
            {view.message}
          </p>
        </section>
      );
    case "device_required":
      return (
        <section className="panel">
          <p className="line">{view.message}</p>
          <ul className="choices">
            {view.devices.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => pick(d.id)}>
                  <span className="dot" data-tone={d.online ? "idle" : "off"} />
                  <span className="choice-name">{d.name}</span>
                  <span className="muted small">
                    {d.online ? "Online" : "Offline"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      );
  }
  const device = view.device;
  const tone =
    view.kind === "heating" ? "heat" : view.kind === "offline" ? "off" : "idle";
  return (
    <section
      className="panel cooker"
      aria-labelledby="cooker-name"
      aria-busy={busy || undefined}
    >
      <header className="head">
        <span className="dot" data-tone={tone} aria-hidden />
        <h1 id="cooker-name">{device.name}</h1>
        <span className="sr-only">, {STATE_WORD[view.kind]}</span>
        {busy && (
          <LoaderCircleIcon
            className="spinner"
            aria-label="Working"
            strokeWidth={1.75}
          />
        )}
      </header>
      {view.kind === "idle" ? (
        <IdleBody
          key={device.id}
          view={view}
          busy={busy}
          onStart={(a) => void act(a, device)}
        />
      ) : (
        <div className="body">
          <Ring view={view} />
          <div className="controls">
            {view.kind === "offline" && (
              <div className="well-note" role="status">
                <p>
                  <strong>The cooker is offline.</strong>{" "}
                  <span className="muted">
                    {view.lastSeenAt
                      ? `Last seen ${formatSeen(view.lastSeenAt)}.`
                      : "Not seen yet."}{" "}
                    Check that it's plugged in and on Wi-Fi.
                  </span>
                </p>
              </div>
            )}
            {view.kind === "heating" && (
              <Heating view={view} busy={busy} act={act} />
            )}
            {view.kind === "auto_stopped" && (
              <div className="well-note split" role="status">
                <p>
                  <strong>Stopped automatically</strong>{" "}
                  <span className="muted">
                    at {formatClock(view.endedAt)}. It may still be beeping.
                  </span>
                </p>
                <button
                  type="button"
                  className="pill outline"
                  disabled={busy}
                  onClick={() => void act({ type: "silence" }, device)}
                >
                  Silence
                </button>
              </div>
            )}
            {"notice" in view && view.notice && (
              <p className="alert" role="alert">
                {view.notice}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// A 270° ring open at the bottom, spanning the cooker's temperature range.
// r = 88 in a 200 box, rotated so the arc starts at the lower left.
const R = 88;
const C = 2 * Math.PI * R;
const ARC = C * 0.75;

type CookerView = Exclude<
  View,
  { kind: "loading" | "no_cookers" | "device_required" | "error" }
>;

/** A quick roll up into place, for numbers that just changed unit. */
function useRollOnChange(unit: TemperatureUnit) {
  const root = useRef<HTMLDivElement>(null);
  const shown = useRef(unit);
  useEffect(() => {
    if (shown.current === unit) return;
    shown.current = unit;
    if (!root.current || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    for (const el of root.current.querySelectorAll("[data-roll]")) {
      el.animate(
        [
          { transform: "translateY(0.35em)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }
  }, [unit]);
  return root;
}

function Ring({
  view,
  shownUnit,
  unitSwitch,
}: {
  view: CookerView;
  /** The unit to show the water in, when it differs from the cooker's. */
  shownUnit?: TemperatureUnit;
  /** Sits in the ring's open bottom, in place of the caption. */
  unitSwitch?: ReactNode;
}) {
  const online = view.kind !== "offline";
  const heating = view.kind === "heating";
  const unit = online ? (shownUnit ?? view.unit) : "c";
  const water = online ? readingIn(view.water, view.unit, unit) : 0;
  const centre = useRollOnChange(unit);
  const { min, max } = LIMITS[unit];
  const frac = (t: number) => Math.min(1, Math.max(0, (t - min) / (max - min)));
  const fill = online ? frac(water) : 0;
  const knob = heating ? frac(view.target) * 1.5 * Math.PI : 0;
  const caption = heating
    ? ["Heating", view.stopsAt && `Stops ${formatClock(view.stopsAt)}`]
        .filter(Boolean)
        .join(" · ")
    : online
      ? "Not heating"
      : "Offline";
  return (
    <div
      className="ring"
      data-tone={heating ? "heat" : online ? "idle" : "off"}
    >
      <svg viewBox="0 0 200 200" aria-hidden>
        <defs>
          <linearGradient id="ring-heat" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--heat-hi)" />
            <stop offset="1" stopColor="var(--heat)" />
          </linearGradient>
        </defs>
        <g transform="rotate(135 100 100)">
          <circle
            className="track"
            cx="100"
            cy="100"
            r={R}
            strokeDasharray={`${ARC} ${C}`}
          />
          {fill > 0 && (
            <circle
              className="fill"
              cx="100"
              cy="100"
              r={R}
              strokeDasharray={`${ARC * fill} ${C}`}
            />
          )}
          {heating && (
            <circle
              className="knob"
              cx={100 + R * Math.cos(knob)}
              cy={100 + R * Math.sin(knob)}
              r="7"
            />
          )}
        </g>
      </svg>
      <div className="ring-center" ref={centre}>
        <p className="reading" data-roll>
          {online ? formatNumber(water) : "--"}
          {online && <span className="unit">{unitLabel(unit)}</span>}
          <span className="sr-only"> water temperature</span>
        </p>
        {heating && (
          <p className="set">
            <span className="knob-mark" aria-hidden />
            Set {formatNumber(view.target)}°
          </p>
        )}
        {unitSwitch && <p className="set">{caption}</p>}
      </div>
      {unitSwitch ?? <p className="caption">{caption}</p>}
    </div>
  );
}

/** A water reading in another unit, to 0.1°. Not clamped: it is a measurement. */
function readingIn(t: number, from: TemperatureUnit, to: TemperatureUnit) {
  if (from === to) return t;
  const v = to === "f" ? (t * 9) / 5 + 32 : ((t - 32) * 5) / 9;
  return Math.round(v * 10) / 10;
}

/** °C | °F: a small segmented pill in the ring's open bottom. */
function UnitSwitch(props: {
  unit: TemperatureUnit;
  disabled: boolean;
  onChange: (u: TemperatureUnit) => void;
}) {
  const units = ["c", "f"] as const;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const pick = (u: TemperatureUnit) => {
    props.onChange(u);
    refs.current[units.indexOf(u)]?.focus();
  };
  return (
    <div
      className="unit-switch"
      role="radiogroup"
      aria-label="Temperature unit"
      aria-disabled={props.disabled || undefined}
      data-unit={props.unit}
    >
      <span className="unit-thumb" aria-hidden />
      {units.map((u) => (
        <button
          key={u}
          ref={(el) => {
            refs.current[units.indexOf(u)] = el;
          }}
          type="button"
          role="radio"
          aria-checked={props.unit === u}
          aria-label={u === "c" ? "Celsius" : "Fahrenheit"}
          tabIndex={props.unit === u ? 0 : -1}
          disabled={props.disabled}
          onClick={() => pick(u)}
          onKeyDown={(e) => {
            const dir =
              e.key === "ArrowRight" || e.key === "ArrowDown"
                ? 1
                : e.key === "ArrowLeft" || e.key === "ArrowUp"
                  ? -1
                  : 0;
            if (!dir) return;
            e.preventDefault();
            pick(units[(units.indexOf(props.unit) + dir + 2) % 2]);
          }}
        >
          {unitLabel(u)}
        </button>
      ))}
    </div>
  );
}

/** Idle: the ring and the start form share the unit being set. */
function IdleBody({
  view,
  busy,
  onStart,
}: {
  view: Extract<View, { kind: "idle" }>;
  busy: boolean;
  onStart: (a: Action) => void;
}) {
  const [unit, setUnit] = useState<TemperatureUnit>(view.unit);
  const [temp, setTemp] = useState(String(clampTemp(view.target, view.unit)));
  const pickUnit = (next: TemperatureUnit) => {
    if (next === unit) return;
    const t = Number(temp);
    if (Number.isFinite(t)) setTemp(String(convert(t, unit, next)));
    setUnit(next);
  };
  return (
    <div className="body">
      <Ring
        view={view}
        shownUnit={unit}
        unitSwitch={
          <UnitSwitch unit={unit} disabled={busy} onChange={pickUnit} />
        }
      />
      <div className="controls">
        {view.alert && (
          <p className="alert" role="alert">
            {view.alert}
          </p>
        )}
        <StartForm
          unit={unit}
          temp={temp}
          setTemp={setTemp}
          target={view.target}
          busy={busy}
          onStart={onStart}
        />
        {view.notice && (
          <p className="alert" role="alert">
            {view.notice}
          </p>
        )}
      </div>
    </div>
  );
}

/** The water temperature without its unit, which is set as a superscript. */
function formatNumber(t: number): string {
  return Number.isInteger(t) ? String(t) : t.toFixed(1);
}

function formatSeen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return `at ${formatClock(iso)}`;
  return `on ${d.toLocaleDateString()} at ${formatClock(iso)}`;
}

interface Draft {
  target: number;
  minutes: number;
  autoStop: boolean;
}

function Heating({
  view,
  busy,
  act,
}: {
  view: Extract<View, { kind: "heating" }>;
  busy: boolean;
  act: ViewProps["act"];
}) {
  const server: Draft = {
    target: view.target,
    minutes: view.timerMinutes,
    autoStop: view.autoStop,
  };
  // Only the fields the user touched, so the running timer keeps counting.
  const [draft, setDraft] = useState<Partial<Draft> | null>(null);
  const shown: Draft = { ...server, ...draft };
  const changed: Action & { type: "update" } = { type: "update" };
  if (draft?.target !== undefined && draft.target !== server.target) {
    changed.temperature = draft.target;
    changed.unit = view.unit;
  }
  if (draft?.minutes !== undefined && draft.minutes !== server.minutes) {
    changed.minutes = draft.minutes;
  }
  if (
    draft?.autoStop !== undefined &&
    draft.autoStop !== server.autoStop &&
    shown.minutes > 0
  ) {
    changed.autoStop = draft.autoStop;
  }
  const dirty = Object.keys(changed).length > 1;
  const edit = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  const apply = async () => {
    await act(changed, view.device);
    setDraft(null);
  };

  const timerLeft = draft?.minutes === undefined && view.timerRunning;
  return (
    <>
      <Stepper
        label="target"
        caption="Target"
        disabled={busy}
        onDown={() =>
          edit({ target: clampTemp(shown.target - TEMP_STEP, view.unit) })
        }
        onUp={() =>
          edit({ target: clampTemp(shown.target + TEMP_STEP, view.unit) })
        }
      >
        <output className="value">
          {formatNumber(shown.target)}
          <span className="value-unit sup">{unitLabel(view.unit)}</span>
        </output>
      </Stepper>
      <Stepper
        label="timer"
        caption={shown.minutes > 0 && timerLeft ? "Timer left" : "Timer"}
        disabled={busy}
        onDown={() =>
          edit({
            minutes: clampMinutes(shown.minutes - TIMER_STEP),
            ...(shown.minutes - TIMER_STEP <= 0 ? { autoStop: false } : {}),
          })
        }
        onUp={() => edit({ minutes: clampMinutes(shown.minutes + TIMER_STEP) })}
      >
        <output className="value">
          {shown.minutes === 0 ? "None" : formatMinutes(shown.minutes)}
        </output>
      </Stepper>
      <AutoStop
        checked={shown.autoStop && shown.minutes > 0}
        disabled={busy || shown.minutes === 0}
        noTimer={shown.minutes === 0}
        onChange={(on) => edit({ autoStop: on })}
      />
      {dirty && (
        <div className="pair">
          <button
            type="button"
            className="pill ink"
            disabled={busy}
            onClick={() => void apply()}
          >
            Apply
          </button>
          <button
            type="button"
            className="pill outline"
            disabled={busy}
            onClick={() => setDraft(null)}
          >
            Cancel
          </button>
        </div>
      )}
      <button
        type="button"
        className="pill heat big-pill"
        disabled={busy}
        onClick={() => void act({ type: "stop" }, view.device)}
      >
        Stop
      </button>
    </>
  );
}

/** − value + in a soft well, with paper keys. */
function Stepper(props: {
  label: string;
  caption?: string;
  disabled: boolean;
  onDown: () => void;
  onUp: () => void;
  children: ReactNode;
}) {
  return (
    <div className="stepper" data-disabled={props.disabled || undefined}>
      <button
        type="button"
        className="key"
        aria-label={`Lower ${props.label}`}
        disabled={props.disabled}
        onClick={props.onDown}
      >
        <MinusIcon strokeWidth={1.5} aria-hidden />
      </button>
      <span className="stepper-value">
        {props.children}
        {props.caption && (
          <span className="stepper-caption">{props.caption}</span>
        )}
      </span>
      <button
        type="button"
        className="key"
        aria-label={`Raise ${props.label}`}
        disabled={props.disabled}
        onClick={props.onUp}
      >
        <PlusIcon strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  );
}

function AutoStop(props: {
  checked: boolean;
  disabled: boolean;
  noTimer: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="check">
      <span className="check-text">
        <span className="check-title">Auto-stop</span>
        <span className="muted small">
          {props.noTimer
            ? "Set a timer first"
            : "Stop heating when the timer ends"}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    </label>
  );
}

/** A width that fits the typed value, so the unit sits right after it. */
function fit(text: string): string {
  return `${Math.min(6, Math.max(2, text.length)) + 0.25}ch`;
}

function convert(t: number, from: TemperatureUnit, to: TemperatureUnit) {
  if (from === to) return t;
  const v = to === "f" ? (t * 9) / 5 + 32 : ((t - 32) * 5) / 9;
  return clampTemp(Math.round(v * 2) / 2, to);
}

function StartForm(props: {
  unit: TemperatureUnit;
  temp: string;
  setTemp: (t: string) => void;
  target: number;
  busy: boolean;
  onStart: (a: Action) => void;
}) {
  const { unit, temp, setTemp } = props;
  const [minutes, setMinutes] = useState("");
  const [autoStop, setAutoStop] = useState(false);

  const t = Number(temp);
  const m = minutes.trim() === "" ? 0 : Number(minutes);
  const { min, max } = LIMITS[unit];
  const tempOk =
    temp.trim() !== "" && Number.isFinite(t) && t >= min && t <= max;
  const minOk =
    Number.isInteger(m) && m >= LIMITS.minutes.min && m <= LIMITS.minutes.max;
  const problem = !tempOk
    ? `Temperature must be ${min}–${max} ${unitLabel(unit)}.`
    : !minOk
      ? `Timer must be 0–${LIMITS.minutes.max} whole minutes.`
      : null;

  const stepTemp = (dir: -1 | 1) => {
    const base = Number.isFinite(t) ? t : props.target;
    setTemp(String(clampTemp(base + dir * TEMP_STEP, unit)));
  };
  const stepMinutes = (dir: -1 | 1) => {
    const base = Number.isFinite(m) ? m : 0;
    const next = clampMinutes(
      (Math.round(base / TIMER_STEP) + dir) * TIMER_STEP,
    );
    setMinutes(next === 0 ? "" : String(next));
  };
  return (
    <form
      className="start"
      onSubmit={(e) => {
        e.preventDefault();
        if (problem) return;
        props.onStart({
          type: "start",
          temperature: t,
          unit,
          minutes: m > 0 ? m : undefined,
          autoStop: m > 0 && autoStop,
        });
      }}
    >
      <Stepper
        label="temperature"
        disabled={props.busy}
        onDown={() => stepTemp(-1)}
        onUp={() => stepTemp(1)}
      >
        <label className="value">
          <span className="sr-only">Temperature ({unitLabel(unit)})</span>
          <input
            type="number"
            inputMode="decimal"
            step={TEMP_STEP}
            min={min}
            max={max}
            value={temp}
            style={{ width: fit(temp) }}
            disabled={props.busy}
            aria-invalid={!tempOk || undefined}
            onChange={(e) => setTemp(e.target.value)}
          />
          <span className="value-unit sup" aria-hidden>
            {unitLabel(unit)}
          </span>
        </label>
      </Stepper>
      <Stepper
        label="timer"
        disabled={props.busy}
        onDown={() => stepMinutes(-1)}
        onUp={() => stepMinutes(1)}
      >
        <label className="value">
          <span className="sr-only">Timer (minutes)</span>
          <input
            type="number"
            inputMode="numeric"
            step={1}
            min={0}
            max={LIMITS.minutes.max}
            placeholder="No timer"
            value={minutes}
            style={{ width: fit(minutes) }}
            disabled={props.busy}
            aria-invalid={!minOk || undefined}
            onChange={(e) => setMinutes(e.target.value)}
          />
          {minutes.trim() !== "" && (
            <span className="value-unit" aria-hidden>
              min
            </span>
          )}
        </label>
      </Stepper>
      <AutoStop
        checked={autoStop && m > 0}
        disabled={props.busy || !(m > 0)}
        noTimer={!(m > 0)}
        onChange={setAutoStop}
      />
      {problem && (
        <p className="alert" role="alert">
          {problem}
        </p>
      )}
      <button
        type="submit"
        className="pill ink big-pill"
        disabled={props.busy || !!problem}
      >
        Start
      </button>
    </form>
  );
}
