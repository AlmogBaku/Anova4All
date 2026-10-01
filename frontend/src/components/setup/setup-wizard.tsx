import { useState, type FormEvent, type ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import { Field } from "@/components/field.tsx";
import { ErrorAlert, Loading } from "@/components/status.tsx";
import { Ticket, TicketHead, TicketSection } from "@/components/ticket.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useAuth } from "@/contexts/auth.tsx";
import { validateDeviceName } from "@/lib/devices.ts";
import { cn } from "@/lib/utils.ts";
import {
  COMMON,
  FIND,
  NAME,
  PAIR,
  PREFLIGHT,
  PREPARE,
  STEP_PROGRESS,
  STEP_TITLES,
  WIFI,
  WIZARD,
} from "./copy.ts";
import { STEPS, type SetupState, type StepId } from "./machine.ts";
import { PAIR_TIMEOUT_MS, type SetupRunner } from "./runner.ts";

const VISIBLE: readonly StepId[] = STEPS.filter((s) => s !== "done");

/** The bump-bar keys under a step: one full-width primary, then the rest. */
function Keys({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 pt-1">{children}</div>;
}

/** The order lines: done steps are checked, the current one is printed in ink. */
function StepList({ current }: { current: number }) {
  return (
    <ol aria-label={WIZARD.stepsLabel} className="grid">
      {VISIBLE.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li
            key={s}
            aria-current={now ? "step" : undefined}
            className={cn(
              "caps -mx-2 flex items-center gap-3 px-2 py-0.5 text-sm",
              done && "text-ink",
              now && "bg-ink py-1 text-paper",
              !done && !now && "text-ink-soft",
            )}
          >
            <span aria-hidden className="grid size-4 place-items-center">
              {done ? (
                <CheckIcon className="size-4" strokeWidth={3} />
              ) : (
                <span
                  className={cn(
                    "size-2",
                    now ? "bg-paper" : "border-[1.5px] border-current",
                  )}
                />
              )}
            </span>
            <span>
              {STEP_TITLES[s]}
              {done && <span className="sr-only"> ({WIZARD.done})</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The phone's stand-in for the step list: one slim segment per step, filled up
 * to the current one. The head band already reads "Step N of 9" and the step's
 * name is printed right under it, so this stays decorative.
 */
function StepStrip({ current }: { current: number }) {
  return (
    <div aria-hidden className="flex gap-1 sm:hidden">
      {VISIBLE.map((s, i) => (
        <span
          key={s}
          className={cn("h-1.5 flex-1", i <= current ? "bg-ink" : "bg-ink/15")}
        />
      ))}
    </div>
  );
}

/**
 * The "get the cooker ready" diagram: the circulator's silhouette (after
 * public/logo.svg) clipped to the wall of a pot, its cable running to a plug.
 */
function CookerDiagram() {
  return (
    <svg
      role="img"
      aria-label={PREPARE.diagram.label}
      viewBox="0 0 340 218"
      className="h-auto w-full max-w-[300px] text-ink"
    >
      {/* Cable from the cooker's head to the plug. */}
      <path
        d="M142 44C96 44 60 62 50 112S40 160 40 166"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="29" y="164" width="22" height="16" rx="2" fill="currentColor" />
      <path
        d="M35 180v9M45 180v9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* 17 units renders at 14 px or more down to a 360 px wide phone. */}
      <text x="20" y="212" fill="currentColor" className="caps text-[17px]">
        {PREPARE.diagram.plug}
      </text>
      <g transform="translate(20 0)">
        {/* Water and pot. */}
        <rect
          x="111"
          y="112"
          width="186"
          height="77"
          rx="6"
          className="fill-ink/8"
        />
        <line
          x1="111"
          y1="112"
          x2="297"
          y2="112"
          strokeWidth="2"
          strokeDasharray="6 5"
          className="stroke-ink-soft"
        />
        <path
          d="M108 86V182a8 8 0 0 0 8 8H292a8 8 0 0 0 8-8V86"
          fill="none"
          strokeWidth="3"
          strokeLinecap="square"
          className="stroke-ink-soft"
        />
        {/* The circulator: head, body, collar, skirt, then the tube in the water. */}
        <g fill="currentColor">
          <ellipse cx="140" cy="22" rx="21" ry="13" />
          <path d="M121 32H159L156 80H124Z" />
          <rect x="119" y="78" width="42" height="16" rx="3" />
          <rect x="121" y="94" width="38" height="13" rx="1.5" />
          <path d="M125 107H155V170a6 6 0 0 1-6 6H131a6 6 0 0 1-6-6Z" />
          {/* The clamp over the pot's rim. */}
          <path d="M120 80H102V106H107V86H120Z" />
        </g>
        <ellipse cx="140" cy="21" rx="16" ry="9" className="fill-paper" />
        <path d="M165 22H190" strokeWidth="1.5" className="stroke-ink-soft" />
        <text x="196" y="28" fill="currentColor" className="caps text-[17px]">
          {PREPARE.diagram.cooker}
        </text>
      </g>
    </svg>
  );
}

function Problems({ state }: { state: SetupState }) {
  return (
    <>
      {state.problems.map((p) => (
        <ErrorAlert key={p.code} title={p.title}>
          {p.fix}
        </ErrorAlert>
      ))}
    </>
  );
}

function FindStep({ runner, email }: { runner: SetupRunner; email?: string }) {
  const [host, setHost] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-5">
      <p className="leading-relaxed">{FIND.intro}</p>
      {email && (
        <p className="text-sm leading-relaxed text-ink-soft">
          {FIND.account(email)}
        </p>
      )}
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-ink-soft">
          {FIND.serverToggle}
        </summary>
        <div className="pt-2">
          <Field
            label={FIND.serverLabel}
            hint={FIND.serverHint}
            error={error}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="url"
            value={host}
            onChange={(e) => {
              setHost(e.target.value);
              setError(runner.setServerHost(e.target.value));
            }}
          />
        </div>
      </details>
      <Keys>
        {/* requestDevice runs synchronously inside this click (user gesture). */}
        <Button
          size="lg"
          className="w-full"
          disabled={!!error}
          onClick={() => void runner.find()}
        >
          {FIND.action}
        </Button>
      </Keys>
    </div>
  );
}

function WifiStep({ runner }: { runner: SetupRunner }) {
  const [change, setChange] = useState(false);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!change) {
    return (
      <div className="grid gap-5">
        <p className="leading-relaxed">{WIFI.intro}</p>
        <Keys>
          <Button
            size="lg"
            className="w-full"
            onClick={() => void runner.keepWifi()}
          >
            {WIFI.keep}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setChange(true)}
          >
            {WIFI.change}
          </Button>
        </Keys>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(await runner.submitWifi(ssid, password));
  };

  return (
    <form noValidate className="grid gap-5" onSubmit={onSubmit}>
      <p className="leading-relaxed">{WIFI.intro}</p>
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <Field
        label={WIFI.ssidLabel}
        autoComplete="off"
        value={ssid}
        onChange={(e) => setSsid(e.target.value)}
      />
      <Field
        label={WIFI.passwordLabel}
        type="password"
        autoComplete="off"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Keys>
        <Button type="submit" size="lg" className="w-full">
          {WIFI.submit}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setChange(false)}
        >
          {WIFI.keep}
        </Button>
      </Keys>
    </form>
  );
}

function NameStep({
  runner,
  state,
}: {
  runner: SetupRunner;
  state: SetupState;
}) {
  const [name, setName] = useState(state.device?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const working = state.phase === "working";
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const invalid = validateDeviceName(name);
    setError(invalid);
    if (!invalid) void runner.name(name.trim());
  };
  return (
    <form noValidate className="grid gap-5" onSubmit={onSubmit}>
      <p className="leading-relaxed">{NAME.intro}</p>
      <Problems state={state} />
      <Field
        label={NAME.label}
        maxLength={40}
        error={error}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Keys>
        <Button type="submit" size="lg" className="w-full" disabled={working}>
          {working ? STEP_PROGRESS.name : NAME.save}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={working}
          onClick={() => runner.skipName()}
        >
          {NAME.skip}
        </Button>
      </Keys>
    </form>
  );
}

function PairStep({
  runner,
  state,
}: {
  runner: SetupRunner;
  state: SetupState;
}) {
  if (state.phase === "failed") {
    return (
      <div className="grid gap-5">
        {state.pairTimedOut ? (
          <ErrorAlert title={PAIR.timeoutTitle}>
            <ul className="list-disc space-y-1 pl-5">
              {PAIR.troubleshooting.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </ErrorAlert>
        ) : (
          <Problems state={state} />
        )}
        <Keys>
          <Button
            size="lg"
            className="w-full"
            onClick={() => void runner.retry()}
          >
            {PAIR.keepWaiting}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => runner.restart()}
          >
            {PAIR.redo}
          </Button>
        </Keys>
      </div>
    );
  }
  const seconds = Math.round((state.pair?.elapsedMs ?? 0) / 1000);
  const last = state.pair?.lastCode;
  return (
    <div className="grid gap-2">
      <Loading label={PAIR.waiting(seconds, PAIR_TIMEOUT_MS / 1000)} />
      {last && (
        <p className="text-sm text-ink-soft">
          {last === "device_offline" || last === "key_mismatch"
            ? PAIR.lastStatus[last]
            : PAIR.lastStatus.other}
        </p>
      )}
    </div>
  );
}

/**
 * Thin view over SetupRunner: one ticket whose order lines are the steps.
 * `illustration` replaces the diagram on the "get the cooker ready" step;
 * `cancel` is the way out, printed at the foot of the ticket.
 */
export function SetupWizard({
  state,
  runner,
  illustration,
  cancel,
}: {
  state: SetupState;
  runner: SetupRunner;
  illustration?: ReactNode;
  cancel?: ReactNode;
}) {
  const { step, phase } = state;
  const { user } = useAuth();
  const index = VISIBLE.indexOf(step);
  const current = step === "done" ? VISIBLE.length : index;
  let body: ReactNode;

  if (step === "pair") {
    body = <PairStep runner={runner} state={state} />;
  } else if (step === "name") {
    body = <NameStep runner={runner} state={state} />;
  } else if (step === "preflight") {
    body = (
      <div className="grid gap-5">
        <p className="leading-relaxed">{PREFLIGHT.intro}</p>
        <p className="text-sm leading-relaxed text-ink-soft">
          {PREFLIGHT.independent}
        </p>
        {phase === "failed" ? (
          <>
            <Problems state={state} />
            <Keys>
              <Button
                size="lg"
                className="w-full"
                onClick={() => void runner.retry()}
              >
                {PREFLIGHT.checkAgain}
              </Button>
            </Keys>
          </>
        ) : (
          <Loading label={STEP_PROGRESS.preflight} />
        )}
      </div>
    );
  } else if (phase === "working") {
    body = <Loading label={STEP_PROGRESS[step]} />;
  } else if (phase === "failed") {
    body = (
      <div className="grid gap-5">
        <Problems state={state} />
        <Keys>
          <Button
            size="lg"
            className="w-full"
            onClick={() => void runner.retry()}
          >
            {COMMON.retry}
          </Button>
          {step !== "find" && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => runner.restart()}
            >
              {COMMON.startOver}
            </Button>
          )}
        </Keys>
      </div>
    );
  } else if (step === "prepare") {
    body = (
      <div className="grid gap-5">
        <div data-slot="illustration" className="flex justify-center">
          {illustration ?? <CookerDiagram />}
        </div>
        <ol className="list-decimal space-y-2 pl-5 leading-relaxed marker:font-semibold">
          {PREPARE.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <Keys>
          <Button
            size="lg"
            className="w-full"
            onClick={() => runner.prepared()}
          >
            {PREPARE.next}
          </Button>
        </Keys>
      </div>
    );
  } else if (step === "find") {
    body = <FindStep runner={runner} email={user?.email} />;
  } else if (step === "wifi") {
    body = <WifiStep runner={runner} />;
  } else {
    body = <Loading label={STEP_PROGRESS[step]} />;
  }

  return (
    <Ticket aria-labelledby="setup-title">
      <TicketHead
        titleAs="h1"
        titleId="setup-title"
        title={WIZARD.title}
        meta={
          index >= 0 ? WIZARD.progress(index + 1, VISIBLE.length) : undefined
        }
      />
      {/* The full list from sm: up; a phone gets the strip so the key stays in view. */}
      <TicketSection perforated={false} className="hidden pb-4 sm:block">
        <StepList current={current} />
      </TicketSection>
      <TicketSection
        role="group"
        aria-labelledby="setup-step"
        perforated={false}
        className="grid gap-4 pt-4 pb-6 sm:perforation sm:pt-5"
      >
        <StepStrip current={current} />
        <h2
          id="setup-step"
          tabIndex={-1}
          className="font-condensed text-3xl leading-none font-extrabold tracking-[-0.01em] uppercase"
        >
          {STEP_TITLES[step]}
        </h2>
        {body}
      </TicketSection>
      {cancel && (
        <TicketSection className="flex min-h-11 items-center justify-end py-1">
          {cancel}
        </TicketSection>
      )}
    </Ticket>
  );
}
