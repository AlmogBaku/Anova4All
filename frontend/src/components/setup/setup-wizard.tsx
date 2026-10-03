import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CheckIcon,
  DotIcon,
  Loader2Icon,
  TriangleAlertIcon,
  UserRoundIcon,
  WifiIcon,
} from "lucide-react";
import { Tabs } from "radix-ui";
import { Field } from "@/components/field.tsx";
import { ErrorAlert } from "@/components/status.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useAuth } from "@/contexts/auth.tsx";
import { validateDeviceName } from "@/lib/devices.ts";
import { cn } from "@/lib/utils.ts";
import {
  CHECKLIST,
  COMMON,
  FIND,
  HELP,
  KEY,
  NAME,
  PAIR,
  PREFLIGHT,
  PREPARE,
  SERVER,
  STEP_PROGRESS,
  STEP_TITLES,
  WIFI,
  WIZARD,
} from "./copy.ts";
import { HelpSheet, Note, Steps, type HelpTab } from "./help-sheet.tsx";
import {
  FindArt,
  KeyArt,
  LateArt,
  NameArt,
  PairRing,
  PreflightArt,
  ReadyArt,
  ServerArt,
  WifiArt,
} from "./illustrations.tsx";
import { STEPS, type SetupState, type StepId } from "./machine.ts";
import { PAIR_TIMEOUT_MS, type SetupRunner } from "./runner.ts";
import "./setup.css";

/** The steps a person sees; "connect" happens on the "find" screen. */
type VisibleStep = keyof typeof CHECKLIST;
const VISIBLE = STEPS.filter(
  (s): s is VisibleStep => s !== "connect" && s !== "done",
);

function visibleIndex(step: StepId): number {
  if (step === "connect") return VISIBLE.indexOf("find");
  if (step === "done") return VISIBLE.length;
  return VISIBLE.indexOf(step);
}

interface Chrome {
  current: number;
  cancel?: ReactNode;
  help: (tab: HelpTab) => void;
}

const ChromeContext = createContext<Chrome>({ current: 0, help: () => {} });

// ---- shared pieces ----

/** The slim copper bar: how far along setup is. */
function Progress({ current }: { current: number }) {
  const shown = Math.min(current + 1, VISIBLE.length);
  return (
    <div
      role="progressbar"
      aria-label={WIZARD.progressLabel}
      aria-valuemin={1}
      aria-valuemax={VISIBLE.length}
      aria-valuenow={shown}
      aria-valuetext={`${shown} of ${VISIBLE.length}`}
      className="h-1 flex-1 overflow-hidden rounded-full bg-hairline"
    >
      <div
        className="h-full rounded-full bg-linear-to-r from-heat-hi to-heat transition-[width] duration-400 ease-[cubic-bezier(.3,.7,.2,1)] motion-reduce:transition-none"
        style={{ width: `${(shown / VISIBLE.length) * 100}%` }}
      />
    </div>
  );
}

/** Desktop: the whole journey as a checklist, so you always see what's left. */
function Checklist({ current }: { current: number }) {
  return (
    <ol
      aria-label={WIZARD.stepsLabel}
      className="grid grid-flow-col grid-cols-2 grid-rows-4 gap-x-4.5 gap-y-0.5"
    >
      {VISIBLE.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li
            key={s}
            aria-current={now ? "step" : undefined}
            className={cn(
              "flex items-center gap-2.5 py-[3px] text-[0.84375rem] text-ink-soft",
              now && "font-medium text-ink",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] border-rail",
                done && "border-ink bg-ink text-paper",
                now && "border-heat ring-3 ring-heat/15",
              )}
            >
              {done && <CheckIcon className="size-3" strokeWidth={2.5} />}
            </span>
            {CHECKLIST[s]}
            {done && <span className="sr-only"> ({WIZARD.done})</span>}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One step's screen. A phone stacks the bar, the drawing, the copy and the
 * keys; from md: up the drawing takes the left pane and the copy the right.
 */
function Screen({
  art,
  title,
  children,
  actions,
  compactArt = false,
}: {
  art: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** A short drawing on a phone, to leave room for a form. */
  compactArt?: boolean;
}) {
  const { current, cancel } = useContext(ChromeContext);
  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-3.5 px-1 md:hidden">
        <span aria-hidden className="size-11 shrink-0" />
        <Progress current={current} />
        <div className="shrink-0">{cancel}</div>
      </div>
      <div
        data-compact={compactArt || undefined}
        className={cn(
          "setup-stage relative min-h-30 flex-1 md:min-h-0 md:bg-well",
          compactArt && "h-26 min-h-26 flex-none md:h-auto",
        )}
      >
        {/* Out of flow, so the drawing takes what's left and never pushes the keys down. */}
        <div className="absolute inset-x-2.5 inset-y-2 mx-auto grid max-w-[270px] grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center md:inset-10 md:max-w-[330px] [&>*]:max-h-full">
          {art}
        </div>
      </div>
      <div className="flex shrink-0 flex-col px-2.5 pb-3 md:min-h-0 md:overflow-y-auto md:px-11 md:py-8.5">
        <div className="absolute top-4 right-4 hidden md:block">{cancel}</div>
        <div className="mb-5.5 hidden pr-8 md:block">
          <Checklist current={current} />
        </div>
        <h2
          id="setup-step"
          tabIndex={-1}
          className="text-[1.625rem] leading-[1.15] font-medium tracking-[-0.03em] text-balance focus:outline-none md:text-[1.875rem]"
        >
          {title}
        </h2>
        {children}
        {actions && (
          <div className="mt-4.5 grid gap-1 md:mt-auto md:pt-4.5">
            {actions}
          </div>
        )}
      </div>
    </>
  );
}

function Intro({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 text-[0.9375rem] leading-[1.45] text-ink-soft [&_b]:font-medium [&_b]:text-ink">
      {children}
    </p>
  );
}

/** The primary key: full width on a phone, a fixed width on desktop. */
function Primary({
  busy,
  disabled,
  children,
  className,
  ...props
}: ComponentProps<typeof Button> & { busy?: boolean }) {
  return (
    <Button
      size="lg"
      className={cn("w-full md:w-auto md:min-w-65 md:self-start", className)}
      disabled={busy || disabled}
      {...props}
    >
      {busy && (
        <Loader2Icon
          aria-hidden
          className="size-4 animate-spin motion-reduce:animate-none"
        />
      )}
      {children}
    </Button>
  );
}

/** Quiet text links under the primary key. */
function Links({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 *:only:mx-auto md:justify-start md:gap-5.5 md:*:only:mx-0">
      {children}
    </div>
  );
}

function TextLink(props: ComponentProps<typeof Button>) {
  return <Button variant="link" className="px-0.5!" {...props} />;
}

function HelpLink({
  tab = "find",
  children = HELP.open,
}: {
  tab?: HelpTab;
  children?: ReactNode;
}) {
  const { help } = useContext(ChromeContext);
  return (
    <TextLink aria-haspopup="dialog" onClick={() => help(tab)}>
      {children}
    </TextLink>
  );
}

function Problems({ state }: { state: SetupState }) {
  if (state.problems.length === 0) return null;
  return (
    <div className="mt-4 grid gap-2">
      {state.problems.map((p) => (
        <ErrorAlert key={p.code} title={p.title}>
          {p.fix}
        </ErrorAlert>
      ))}
    </div>
  );
}

/** Retry resumes at the failed step; start over goes back to "find". */
function FailActions({
  runner,
  startOver = true,
}: {
  runner: SetupRunner;
  startOver?: boolean;
}) {
  return (
    <>
      <Primary onClick={() => void runner.retry()}>{COMMON.retry}</Primary>
      {startOver && (
        <Links>
          <TextLink onClick={() => runner.restart()}>
            {COMMON.startOver}
          </TextLink>
        </Links>
      )}
    </>
  );
}

type RowStatus = "ok" | "working" | "failed" | "unknown";

function StatusDot({ status }: { status: RowStatus }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full",
        status === "ok" && "setup-ok",
        (status === "working" || status === "unknown") &&
          "bg-well text-ink-soft",
        status === "failed" && "bg-destructive/10 text-destructive",
      )}
    >
      {status === "ok" && <CheckIcon className="size-4" strokeWidth={2.25} />}
      {status === "working" && (
        <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
      )}
      {status === "failed" && <TriangleAlertIcon className="size-4" />}
    </span>
  );
}

/** A grouped list: rows split by hairlines, one card with a border. */
function Rows({ children, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      className="mt-4 overflow-hidden rounded-[1.375rem] border border-hairline bg-paper"
      {...props}
    >
      {children}
    </ul>
  );
}

function Row({
  status,
  title,
  detail,
  end,
  truncate = false,
}: {
  status: RowStatus;
  title: ReactNode;
  detail?: ReactNode;
  end?: ReactNode;
  /** One line for the detail, e.g. a long id. */
  truncate?: boolean;
}) {
  return (
    <li className="flex min-h-13 items-center gap-3 border-t border-hairline px-4 py-3 text-[0.9375rem] first:border-t-0">
      <StatusDot status={status} />
      <div className="min-w-0 flex-1">
        {title}
        {status === "working" && (
          <span className="sr-only"> ({PREFLIGHT.checking})</span>
        )}
        {detail && (
          <small
            className={cn(
              "mt-px block text-[0.8125rem] text-ink-soft tabular-nums",
              truncate && "truncate",
            )}
          >
            {detail}
          </small>
        )}
      </div>
      {end && <span className="shrink-0 text-sm text-ink-soft">{end}</span>}
    </li>
  );
}

// ---- steps ----

function PreflightScreen({
  state,
  runner,
  email,
}: {
  state: SetupState;
  runner: SetupRunner;
  email?: string;
}) {
  const failed = state.phase === "failed";
  const problem = (...codes: string[]) =>
    state.problems.find((p) => codes.includes(p.code));
  const browser = problem("insecure_context", "unsupported");
  const bluetooth = problem("bluetooth_off");
  const signedIn = problem("signed_out");
  const status = (p: unknown, blocked = false): RowStatus =>
    !failed ? "working" : p ? "failed" : blocked ? "unknown" : "ok";
  return (
    <Screen
      art={<PreflightArt />}
      title={STEP_TITLES.preflight}
      actions={
        failed && (
          <Primary onClick={() => void runner.retry()}>
            {PREFLIGHT.checkAgain}
          </Primary>
        )
      }
    >
      <Intro>{PREFLIGHT.intro}</Intro>
      <Rows aria-busy={!failed}>
        <Row
          status={status(browser)}
          title={browser?.title ?? PREFLIGHT.checks.browser}
          detail={browser?.fix}
        />
        <Row
          status={status(bluetooth, !!browser)}
          title={bluetooth?.title ?? PREFLIGHT.checks.bluetooth}
          detail={bluetooth?.fix}
        />
        <Row
          status={status(signedIn)}
          title={signedIn?.title ?? PREFLIGHT.checks.signedIn}
          detail={signedIn?.fix ?? email}
        />
      </Rows>
      <p
        className={cn(
          "mt-3 text-[0.8125rem] leading-[1.45] text-ink-soft",
          // A phone gives the room to the fixes.
          failed && "max-md:hidden",
        )}
      >
        {PREFLIGHT.independent}
      </p>
    </Screen>
  );
}

function PrepareScreen({
  runner,
  illustration,
}: {
  runner: SetupRunner;
  illustration?: ReactNode;
}) {
  return (
    <Screen
      art={illustration ?? <ReadyArt />}
      title={STEP_TITLES.prepare}
      actions={
        <>
          <Primary onClick={() => runner.prepared()}>{PREPARE.next}</Primary>
          <Links>
            <HelpLink />
          </Links>
        </>
      }
    >
      <Steps items={PREPARE.steps} className="mt-3.5" />
    </Screen>
  );
}

/** "find" and "connect": picking the cooker, then connecting, on one screen. */
function FindScreen({
  state,
  runner,
  email,
}: {
  state: SetupState;
  runner: SetupRunner;
  email?: string;
}) {
  const [showServer, setShowServer] = useState(false);
  const [host, setHost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const serverId = useId();
  const { step, phase } = state;
  const working = phase === "working";
  const failed = phase === "failed";
  return (
    <Screen
      art={<FindArt />}
      title={STEP_TITLES.find}
      actions={
        failed ? (
          <FailActions runner={runner} startOver={step !== "find"} />
        ) : (
          <>
            {/* requestDevice runs synchronously inside this click (user gesture). */}
            <Primary
              busy={working}
              disabled={!!error}
              onClick={() => void runner.find()}
            >
              {!working
                ? FIND.action
                : step === "connect"
                  ? FIND.connecting
                  : FIND.picking}
            </Primary>
            <Links>
              <TextLink
                aria-expanded={showServer}
                aria-controls={serverId}
                disabled={working}
                onClick={() => setShowServer((v) => !v)}
              >
                {FIND.serverToggle}
              </TextLink>
              <HelpLink />
            </Links>
          </>
        )
      }
    >
      <Intro>
        {FIND.intro} <b>{FIND.deviceName}</b>.
      </Intro>
      {email && (
        <p className="mt-3 flex items-center gap-1.5 text-[0.8125rem] text-ink-soft">
          <UserRoundIcon aria-hidden className="size-4 shrink-0" />
          {FIND.account(email)}
        </p>
      )}
      {working && (
        <p role="status" className="sr-only">
          {STEP_PROGRESS[step]}
        </p>
      )}
      <Problems state={state} />
      {showServer && !failed && (
        <div id={serverId} className="mt-4">
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
      )}
    </Screen>
  );
}

/** "key" and "server" run on their own; the screen shows what's being written. */
function WritingScreen({
  state,
  runner,
}: {
  state: SetupState;
  runner: SetupRunner;
}) {
  const isKey = state.step === "key";
  const failed = state.phase === "failed";
  return (
    <Screen
      art={isKey ? <KeyArt /> : <ServerArt />}
      title={STEP_TITLES[state.step]}
      actions={failed && <FailActions runner={runner} />}
    >
      <Intro>{isKey ? KEY.intro : SERVER.intro}</Intro>
      {failed ? (
        <Problems state={state} />
      ) : (
        <Rows role="status">
          <Row
            status="working"
            title={`${isKey ? KEY.row : SERVER.row}…`}
            detail={isKey ? state.idCard : undefined}
            truncate
          />
        </Rows>
      )}
    </Screen>
  );
}

/** A form input with its label printed inside the box, on the left. */
function InlineField({
  label,
  ...input
}: { label: string } & ComponentProps<typeof Input>) {
  const id = useId();
  return (
    <div className="mt-2 flex h-13 items-center gap-2.5 rounded-2xl border border-hairline bg-paper px-3.5 transition-[border-color] focus-within:border-ink focus-within:ring-4 focus-within:ring-ink/20">
      <label
        htmlFor={id}
        className="w-[4.625rem] shrink-0 text-[0.8125rem] text-ink-soft"
      >
        {label}
      </label>
      <Input
        id={id}
        className="h-full rounded-none border-0 bg-transparent px-0 focus-visible:ring-0"
        {...input}
      />
    </div>
  );
}

const SEG_TAB =
  "min-h-11 flex-1 rounded-[0.625rem] text-sm text-ink-soft data-[state=active]:bg-paper data-[state=active]:font-medium data-[state=active]:text-ink data-[state=active]:shadow-[0_1px_2px_rgb(0_0_0/0.08)]";

function WifiScreen({
  state,
  runner,
}: {
  state: SetupState;
  runner: SetupRunner;
}) {
  const [mode, setMode] = useState<"keep" | "change">("keep");
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const formId = useId();
  const working = state.phase === "working";
  const failed = state.phase === "failed";
  const change = mode === "change";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(await runner.submitWifi(ssid, password));
  };

  return (
    <Screen
      art={
        <WifiArt network={change ? ssid.trim() || undefined : WIFI.current} />
      }
      title={STEP_TITLES.wifi}
      compactArt={change}
      actions={
        failed ? (
          <FailActions runner={runner} />
        ) : change ? (
          <Primary type="submit" form={formId} busy={working}>
            {working ? WIFI.sending : WIFI.submit}
          </Primary>
        ) : (
          <Primary busy={working} onClick={() => void runner.keepWifi()}>
            {WIFI.continue}
          </Primary>
        )
      }
    >
      <Problems state={state} />
      <Tabs.Root
        value={mode}
        onValueChange={(v) => setMode(v as "keep" | "change")}
      >
        <Tabs.List
          aria-label={WIFI.modesLabel}
          className="mt-4 flex rounded-[0.875rem] bg-well p-1"
        >
          <Tabs.Trigger value="keep" className={SEG_TAB} disabled={working}>
            {WIFI.keepTab}
          </Tabs.Trigger>
          <Tabs.Trigger value="change" className={SEG_TAB} disabled={working}>
            {WIFI.changeTab}
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="keep">
          <Intro>{WIFI.intro}</Intro>
        </Tabs.Content>
        <Tabs.Content value="change">
          <form
            id={formId}
            noValidate
            className="mt-3"
            onSubmit={(e) => void onSubmit(e)}
          >
            {error && <ErrorAlert>{error}</ErrorAlert>}
            <InlineField
              label={WIFI.ssidLabel}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
            />
            <InlineField
              label={WIFI.passwordLabel}
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <ul aria-label={WIFI.rulesLabel} className="mt-3 grid gap-1.5">
              {WIFI.rules.map((r, i) => (
                <li
                  key={r}
                  className="flex gap-2 text-[0.8125rem] leading-[1.4] text-ink-soft"
                >
                  {i === 0 ? (
                    <WifiIcon
                      aria-hidden
                      className="mt-0.5 size-[15px] shrink-0 text-ink"
                    />
                  ) : (
                    <DotIcon
                      aria-hidden
                      className="mt-0.5 size-[15px] shrink-0 text-ink"
                      strokeWidth={4}
                    />
                  )}
                  {r}
                </li>
              ))}
            </ul>
          </form>
        </Tabs.Content>
      </Tabs.Root>
    </Screen>
  );
}

/** Seconds left of the pairing minute, counted from when this mounts. */
function useSecondsLeft(totalMs: number): number {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.ceil((totalMs - (now - start)) / 1000));
}

function PairWaiting({ state }: { state: SetupState }) {
  const total = PAIR_TIMEOUT_MS / 1000;
  const left = useSecondsLeft(PAIR_TIMEOUT_MS);
  const last = state.pair?.lastCode;
  return (
    <Screen
      art={
        <PairRing
          left={left}
          total={total}
          label={PAIR.timerLabel(left)}
          unit={PAIR.secondsLeft}
        />
      }
      title={STEP_TITLES.pair}
      actions={
        <Links>
          <HelpLink tab="reset">{PAIR.tooLong}</HelpLink>
        </Links>
      }
    >
      <Intro>{PAIR.intro}</Intro>
      <Note live>
        {last === "device_offline" || last === "key_mismatch"
          ? PAIR.lastStatus[last]
          : last
            ? PAIR.lastStatus.other
            : STEP_PROGRESS.pair}
      </Note>
    </Screen>
  );
}

function PairScreen({
  state,
  runner,
}: {
  state: SetupState;
  runner: SetupRunner;
}) {
  if (state.phase !== "failed") return <PairWaiting state={state} />;
  const actions = (
    <>
      <Primary onClick={() => void runner.retry()}>{PAIR.keepWaiting}</Primary>
      <Links>
        <TextLink onClick={() => runner.restart()}>{PAIR.redo}</TextLink>
      </Links>
    </>
  );
  if (!state.pairTimedOut) {
    return (
      <Screen
        art={<LateArt icon={<TriangleAlertIcon className="size-8.5" />} />}
        title={STEP_TITLES.pair}
        actions={actions}
      >
        <Problems state={state} />
      </Screen>
    );
  }
  return (
    <Screen
      art={
        <LateArt
          icon={
            <TriangleAlertIcon
              aria-hidden
              className="size-8.5"
              strokeWidth={1.5}
            />
          }
        />
      }
      title={PAIR.timeoutTitle}
      actions={actions}
    >
      <div role="alert">
        <Steps
          className="mt-3.5"
          items={PAIR.troubleshooting.map((text, i) => ({
            text,
            detail: PAIR.troubleshootingDetail[i],
          }))}
        />
      </div>
    </Screen>
  );
}

function NameScreen({
  state,
  runner,
}: {
  state: SetupState;
  runner: SetupRunner;
}) {
  const [name, setName] = useState(state.device?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const formId = useId();
  const errorId = `${formId}-error`;
  const working = state.phase === "working";
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const invalid = validateDeviceName(name);
    setError(invalid);
    if (!invalid) void runner.name(name.trim());
  };
  return (
    <Screen
      art={<NameArt name={name} />}
      title={STEP_TITLES.name}
      actions={
        <>
          <Primary type="submit" form={formId} busy={working}>
            {working ? STEP_PROGRESS.name : NAME.save}
          </Primary>
          <Links>
            <TextLink disabled={working} onClick={() => runner.skipName()}>
              {NAME.skip}
            </TextLink>
          </Links>
        </>
      }
    >
      <Intro>{NAME.intro}</Intro>
      <Problems state={state} />
      <form id={formId} noValidate onSubmit={onSubmit}>
        <Input
          aria-label={NAME.label}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? errorId : undefined}
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-4.5 h-14 rounded-[1.125rem] px-4 text-[1.0625rem]"
        />
        {error && (
          <p id={errorId} className="mt-1.5 text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
      <div
        role="group"
        aria-label={NAME.suggestionsLabel}
        className="mt-2.5 flex flex-wrap gap-2"
      >
        {NAME.suggestions.map((s) => (
          <Button
            key={s}
            type="button"
            variant="secondary"
            size="sm"
            aria-pressed={name === s}
            disabled={working}
            className="font-normal aria-pressed:bg-ink aria-pressed:text-paper"
            onClick={() => {
              setName(s);
              setError(null);
            }}
          >
            {s}
          </Button>
        ))}
      </div>
    </Screen>
  );
}

/**
 * Thin view over SetupRunner: renders the machine's state, one step per screen.
 * `illustration` replaces the drawing on the "get the cooker ready" step;
 * `cancel` is the way out, printed in the top bar.
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
  const { step } = state;
  const { user } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTab, setHelpTab] = useState<HelpTab>("find");
  const chrome: Chrome = {
    current: visibleIndex(step),
    cancel,
    help: (tab) => {
      setHelpTab(tab);
      setHelpOpen(true);
    },
  };

  // Each new step moves focus to its heading, so it is announced.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.getElementById("setup-step")?.focus({ preventScroll: true });
  }, [step]);

  let screen: ReactNode;
  switch (step) {
    case "preflight":
      screen = (
        <PreflightScreen state={state} runner={runner} email={user?.email} />
      );
      break;
    case "prepare":
      screen = <PrepareScreen runner={runner} illustration={illustration} />;
      break;
    case "find":
    case "connect":
      screen = <FindScreen state={state} runner={runner} email={user?.email} />;
      break;
    case "key":
    case "server":
      screen = <WritingScreen state={state} runner={runner} />;
      break;
    case "wifi":
      screen = <WifiScreen state={state} runner={runner} />;
      break;
    case "pair":
      screen = <PairScreen state={state} runner={runner} />;
      break;
    case "name":
      screen = <NameScreen state={state} runner={runner} />;
      break;
    case "done":
      screen = (
        <Screen
          art={<NameArt name={state.device?.name ?? ""} />}
          title={STEP_TITLES.done}
        />
      );
      break;
  }

  return (
    <ChromeContext value={chrome}>
      <section
        aria-labelledby="setup-step"
        className="flex flex-1 flex-col md:relative md:my-auto md:grid md:h-176 md:max-h-full md:flex-none md:grid-cols-2 md:overflow-hidden md:rounded-[1.875rem] md:bg-paper md:shadow-ticket"
      >
        <h1 className="sr-only">{WIZARD.title}</h1>
        {screen}
      </section>
      <HelpSheet
        open={helpOpen}
        onOpenChange={setHelpOpen}
        tab={helpTab}
        onTabChange={setHelpTab}
      />
    </ChromeContext>
  );
}
