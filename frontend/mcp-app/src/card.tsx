import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
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
  formatTemp,
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
  idle: "Not heating",
  heating: "Heating",
  auto_stopped: "Auto-stopped",
};

function CardView({ view, busy, act, pick }: ViewProps) {
  switch (view.kind) {
    case "loading":
      return <p className="line muted">Loading…</p>;
    case "no_cookers":
      return <p className="line">{view.message}</p>;
    case "error":
      return (
        <p className="line danger" role="alert">
          {view.message}
        </p>
      );
    case "device_required":
      return (
        <section>
          <p className="line">{view.message}</p>
          <ul className="choices">
            {view.devices.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => pick(d.id)}>
                  {d.name}
                  <span className="muted">
                    {" "}
                    · {d.online ? "online" : "offline"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      );
  }
  const device = view.device;
  return (
    <section>
      <header className="head">
        <h1>{device.name}</h1>
        <span className="state">{STATE_WORD[view.kind]}</span>
      </header>
      {view.kind === "offline" && (
        <p className="line muted">
          {view.lastSeenAt
            ? `Last seen ${formatSeen(view.lastSeenAt)}.`
            : "Not seen yet."}
        </p>
      )}
      {view.kind !== "offline" && (
        <p className="temps">
          <span className="big">{formatTemp(view.water, view.unit)}</span>
          <span className="muted"> water</span>
        </p>
      )}
      {view.kind === "heating" && <Heating view={view} busy={busy} act={act} />}
      {view.kind === "auto_stopped" && (
        <>
          <p className="line">
            Stopped by the timer at {formatClock(view.endedAt)}. The alarm may
            still be sounding.
          </p>
          <div className="row">
            <button
              type="button"
              disabled={busy}
              onClick={() => void act({ type: "silence" }, device)}
            >
              Silence
            </button>
          </div>
        </>
      )}
      {view.kind === "idle" && (
        <>
          {view.alert && (
            <p className="line danger" role="alert">
              {view.alert}
            </p>
          )}
          <StartForm
            key={device.id}
            unit={view.unit}
            target={view.target}
            busy={busy}
            onStart={(a) => void act(a, device)}
          />
        </>
      )}
      {"notice" in view && view.notice && (
        <p className="line danger" role="alert">
          {view.notice}
        </p>
      )}
    </section>
  );
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

  return (
    <>
      <dl className="facts">
        <dt>Target</dt>
        <dd>{formatTemp(view.target, view.unit)}</dd>
        <dt>Timer</dt>
        <dd>
          {view.timerMinutes === 0
            ? "None"
            : view.timerRunning
              ? `${formatMinutes(view.timerMinutes)} left`
              : `${formatMinutes(view.timerMinutes)}, not running`}
        </dd>
        {view.stopsAt && (
          <>
            <dt>Auto-stop</dt>
            <dd>Stops at {formatClock(view.stopsAt)}</dd>
          </>
        )}
      </dl>
      <div className="edit">
        <Stepper
          label="Target"
          value={formatTemp(shown.target, view.unit)}
          disabled={busy}
          onDown={() =>
            edit({ target: clampTemp(shown.target - TEMP_STEP, view.unit) })
          }
          onUp={() =>
            edit({ target: clampTemp(shown.target + TEMP_STEP, view.unit) })
          }
        />
        <Stepper
          label="Timer"
          value={shown.minutes === 0 ? "None" : formatMinutes(shown.minutes)}
          disabled={busy}
          onDown={() =>
            edit({
              minutes: clampMinutes(shown.minutes - TIMER_STEP),
              ...(shown.minutes - TIMER_STEP <= 0 ? { autoStop: false } : {}),
            })
          }
          onUp={() =>
            edit({ minutes: clampMinutes(shown.minutes + TIMER_STEP) })
          }
        />
        <label className="check">
          <input
            type="checkbox"
            checked={shown.autoStop && shown.minutes > 0}
            disabled={busy || shown.minutes === 0}
            onChange={(e) => edit({ autoStop: e.target.checked })}
          />
          Stop heating when the timer ends
        </label>
      </div>
      <div className="row">
        {dirty && (
          <>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void apply()}
            >
              Apply
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              Cancel
            </button>
          </>
        )}
        <button
          type="button"
          className="stop"
          disabled={busy}
          onClick={() => void act({ type: "stop" }, view.device)}
        >
          Stop
        </button>
      </div>
    </>
  );
}

function Stepper(props: {
  label: string;
  value: string;
  disabled: boolean;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <div className="stepper">
      <span className="muted">{props.label}</span>
      <button
        type="button"
        aria-label={`Lower ${props.label.toLowerCase()}`}
        disabled={props.disabled}
        onClick={props.onDown}
      >
        −
      </button>
      <output>{props.value}</output>
      <button
        type="button"
        aria-label={`Raise ${props.label.toLowerCase()}`}
        disabled={props.disabled}
        onClick={props.onUp}
      >
        +
      </button>
    </div>
  );
}

function convert(t: number, from: TemperatureUnit, to: TemperatureUnit) {
  if (from === to) return t;
  const v = to === "f" ? (t * 9) / 5 + 32 : ((t - 32) * 5) / 9;
  return clampTemp(Math.round(v * 2) / 2, to);
}

function StartForm(props: {
  unit: TemperatureUnit;
  target: number;
  busy: boolean;
  onStart: (a: Action) => void;
}) {
  const [unit, setUnit] = useState<TemperatureUnit>(props.unit);
  const [temp, setTemp] = useState(String(clampTemp(props.target, props.unit)));
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
      <label>
        <span className="muted">Temperature</span>
        <input
          type="number"
          inputMode="decimal"
          step={TEMP_STEP}
          min={min}
          max={max}
          value={temp}
          onChange={(e) => setTemp(e.target.value)}
        />
      </label>
      <label>
        <span className="muted">Unit</span>
        <select
          value={unit}
          onChange={(e) => {
            const next = e.target.value as TemperatureUnit;
            if (Number.isFinite(t)) setTemp(String(convert(t, unit, next)));
            setUnit(next);
          }}
        >
          <option value="c">°C</option>
          <option value="f">°F</option>
        </select>
      </label>
      <label>
        <span className="muted">Timer (min)</span>
        <input
          type="number"
          inputMode="numeric"
          step={1}
          min={0}
          max={LIMITS.minutes.max}
          placeholder="None"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={autoStop && m > 0}
          disabled={!(m > 0)}
          onChange={(e) => setAutoStop(e.target.checked)}
        />
        Stop heating when the timer ends
      </label>
      {problem && <p className="line danger">{problem}</p>}
      <div className="row">
        <button
          type="submit"
          className="primary"
          disabled={props.busy || !!problem}
        >
          Start
        </button>
      </div>
    </form>
  );
}
