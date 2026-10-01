import { useState, type FormEvent, type ReactNode } from "react";
import { Field } from "@/components/field.tsx";
import { ErrorAlert, Loading } from "@/components/status.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useAuth } from "@/contexts/auth.tsx";
import { validateDeviceName } from "@/lib/devices.ts";
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
} from "./copy.ts";
import { STEPS, type SetupState, type StepId } from "./machine.ts";
import { PAIR_TIMEOUT_MS, type SetupRunner } from "./runner.ts";

const VISIBLE: readonly StepId[] = STEPS.filter((s) => s !== "done");

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

function WifiStep({ runner }: { runner: SetupRunner }) {
  const [change, setChange] = useState(false);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!change) {
    return (
      <div className="grid gap-4">
        <p>{WIFI.intro}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void runner.keepWifi()}>{WIFI.keep}</Button>
          <Button variant="outline" onClick={() => setChange(true)}>
            {WIFI.change}
          </Button>
        </div>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(await runner.submitWifi(ssid, password));
  };

  return (
    <form noValidate className="grid gap-4" onSubmit={onSubmit}>
      <p>{WIFI.intro}</p>
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit">{WIFI.submit}</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setChange(false)}
        >
          {WIFI.keep}
        </Button>
      </div>
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
    <form noValidate className="grid gap-4" onSubmit={onSubmit}>
      <p>{NAME.intro}</p>
      <Problems state={state} />
      <Field
        label={NAME.label}
        maxLength={40}
        error={error}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={working}>
          {working ? STEP_PROGRESS.name : NAME.save}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={working}
          onClick={() => runner.skipName()}
        >
          {NAME.skip}
        </Button>
      </div>
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
      <div className="grid gap-4">
        {state.pairTimedOut ? (
          <ErrorAlert title={PAIR.timeoutTitle}>
            <ul className="list-disc pl-5">
              {PAIR.troubleshooting.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </ErrorAlert>
        ) : (
          <Problems state={state} />
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void runner.retry()}>
            {PAIR.keepWaiting}
          </Button>
          <Button variant="outline" onClick={() => runner.restart()}>
            {PAIR.redo}
          </Button>
        </div>
      </div>
    );
  }
  const seconds = Math.round((state.pair?.elapsedMs ?? 0) / 1000);
  const last = state.pair?.lastCode;
  return (
    <div className="grid gap-2">
      <p role="status">{PAIR.waiting(seconds)}</p>
      <progress
        className="w-full"
        max={PAIR_TIMEOUT_MS / 1000}
        value={seconds}
        aria-label="Waiting for the cooker"
      />
      {last && (
        <p className="text-sm text-muted-foreground">
          {last === "device_offline" || last === "key_mismatch"
            ? PAIR.lastStatus[last]
            : PAIR.lastStatus.other}
        </p>
      )}
    </div>
  );
}

/**
 * Thin view over SetupRunner. `illustration` fills the slot on the
 * "get the cooker ready" step.
 */
export function SetupWizard({
  state,
  runner,
  illustration,
}: {
  state: SetupState;
  runner: SetupRunner;
  illustration?: ReactNode;
}) {
  const { step, phase } = state;
  const { user } = useAuth();
  const index = VISIBLE.indexOf(step);
  let body: ReactNode;

  if (step === "pair") {
    body = <PairStep runner={runner} state={state} />;
  } else if (step === "name") {
    body = <NameStep runner={runner} state={state} />;
  } else if (phase === "working") {
    body = <Loading label={STEP_PROGRESS[step]} />;
  } else if (phase === "failed") {
    body = (
      <div className="grid gap-4">
        {step === "preflight" && <p>{PREFLIGHT.intro}</p>}
        <Problems state={state} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void runner.retry()}>
            {step === "preflight" ? PREFLIGHT.checkAgain : COMMON.retry}
          </Button>
          {step !== "preflight" && step !== "find" && (
            <Button variant="outline" onClick={() => runner.restart()}>
              {COMMON.startOver}
            </Button>
          )}
        </div>
      </div>
    );
  } else if (step === "prepare") {
    body = (
      <div className="grid gap-4">
        <div data-slot="illustration">{illustration}</div>
        <ol className="list-decimal space-y-1 pl-5">
          {PREPARE.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <div>
          <Button onClick={() => runner.prepared()}>{PREPARE.next}</Button>
        </div>
      </div>
    );
  } else if (step === "find") {
    body = (
      <div className="grid gap-4">
        <p>{FIND.intro}</p>
        {user?.email && (
          <p className="text-sm text-muted-foreground">
            {FIND.account(user.email)}
          </p>
        )}
        <div>
          {/* requestDevice runs synchronously inside this click (user gesture). */}
          <Button onClick={() => void runner.find()}>{FIND.action}</Button>
        </div>
      </div>
    );
  } else if (step === "wifi") {
    body = <WifiStep runner={runner} />;
  } else {
    body = <Loading label={STEP_PROGRESS[step]} />;
  }

  return (
    <section aria-labelledby="setup-step" className="grid gap-4">
      {index >= 0 && (
        <p className="text-sm text-muted-foreground">
          Step {index + 1} of {VISIBLE.length}
        </p>
      )}
      <h2 id="setup-step" className="text-xl font-semibold" tabIndex={-1}>
        {STEP_TITLES[step]}
      </h2>
      {body}
    </section>
  );
}
