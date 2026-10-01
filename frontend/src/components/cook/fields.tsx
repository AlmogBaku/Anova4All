// Inputs for the cook screen. While a field has focus it shows what the user
// typed, so live status updates never overwrite an edit in progress.
import { MinusIcon, PlusIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import type { TemperatureUnit } from "@/lib/api/types.ts";
import { cn } from "@/lib/utils.ts";
import { MINUTES_MAX, TEMP_RANGE } from "./controller.ts";
import {
  digitsToMinutes,
  formatDigits,
  minutesToDigits,
  normalizeDigits,
  restingTimer,
} from "./duration.ts";

function Message({ id, error }: { id: string; error?: string }) {
  if (error) {
    return (
      <p id={id} className="px-1 text-[0.8125rem] text-destructive">
        {error}
      </p>
    );
  }
  return null;
}

/** − value + in a soft well. The value stays a typeable input. */
function Stepper({
  label,
  disabled,
  onStep,
  children,
}: {
  label: string;
  disabled?: boolean;
  onStep: (dir: -1 | 1) => void;
  children: ReactNode;
}) {
  const btn =
    "grid size-11 shrink-0 cursor-pointer place-items-center rounded-[0.9rem] border border-hairline bg-paper text-ink disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div
      className={cn(
        "flex h-14 min-w-0 flex-1 items-center justify-between gap-1 rounded-[1.1rem] bg-well p-1.5",
        disabled && "opacity-60",
      )}
    >
      <button
        type="button"
        className={btn}
        disabled={disabled}
        aria-label={`Lower ${label}`}
        onClick={() => onStep(-1)}
      >
        <MinusIcon className="size-4" strokeWidth={1.5} />
      </button>
      {children}
      <button
        type="button"
        className={btn}
        disabled={disabled}
        aria-label={`Raise ${label}`}
        onClick={() => onStep(1)}
      >
        <PlusIcon className="size-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}

const valueInput =
  "w-full min-w-0 bg-transparent text-center text-[1.625rem] leading-none font-light tracking-[-0.03em] tabular-nums outline-none disabled:cursor-not-allowed";

export function TemperatureField({
  value,
  unit,
  error,
  disabled,
  onChange,
}: {
  value: number;
  unit: TemperatureUnit;
  error?: string;
  disabled?: boolean;
  onChange: (t: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  const [lo, hi] = TEMP_RANGE[unit];
  const step = unit === "c" ? 0.5 : 1;
  return (
    <div className="grid min-w-0 flex-1 gap-1">
      <Label htmlFor={id} className="sr-only">
        Target temperature (°{unit.toUpperCase()})
      </Label>
      <Stepper
        label="target temperature"
        disabled={disabled}
        onStep={(dir) => {
          const next = Math.round((value + dir * step) / step) * step;
          onChange(Math.min(hi, Math.max(lo, Number(next.toFixed(1)))));
        }}
      >
        <span className="flex min-w-0 items-start justify-center">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            step="0.1"
            className={cn(
              valueInput,
              "text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
            )}
            // As wide as the number, so the unit sits right against it.
            style={{
              width: `${Math.max(2, (text ?? String(value)).length)}ch`,
            }}
            disabled={disabled}
            value={text ?? String(value)}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? `${id}-msg` : undefined}
            onFocus={() => setText(String(value))}
            onBlur={() => setText(null)}
            onChange={(e) => {
              setText(e.target.value);
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n)) onChange(n);
            }}
          />
          {/* Set high, at cap height, like the dial's unit. */}
          <span
            aria-hidden
            className="ml-[0.1em] pt-[0.25rem] text-[0.8125rem] leading-none text-ink-soft"
          >
            °{unit.toUpperCase()}
          </span>
        </span>
      </Stepper>
      <Message id={`${id}-msg`} error={error} />
    </div>
  );
}

/** HH:MM timer; digits shift in from the right. 0 = no timer. */
export function DurationField({
  minutes,
  error,
  disabled,
  label,
  onChange,
}: {
  minutes: number;
  error?: string;
  disabled?: boolean;
  label: string;
  onChange: (minutes: number) => void;
}) {
  const id = useId();
  const [digits, setDigits] = useState<string | null>(null);
  const resting = restingTimer(minutes);
  return (
    <div className="grid min-w-0 flex-1 gap-1">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Stepper
        label="timer"
        disabled={disabled}
        onStep={(dir) => {
          const next = (Math.round(minutes / 15) + dir) * 15;
          onChange(Math.min(MINUTES_MAX, Math.max(0, next)));
        }}
      >
        <span className="flex min-w-0 items-baseline justify-center">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className={cn(valueInput, "w-[4.3ch] text-right")}
            disabled={disabled}
            value={digits === null ? resting.value : formatDigits(digits)}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? `${id}-msg` : undefined}
            onFocus={() => setDigits(minutesToDigits(minutes))}
            onBlur={() => setDigits(null)}
            onChange={(e) => {
              const d = normalizeDigits(e.target.value);
              setDigits(d);
              onChange(digitsToMinutes(d));
            }}
          />
          <span className="ml-[0.15em] text-[0.8125rem] text-ink-soft">
            {digits === null ? resting.unit : "h"}
          </span>
        </span>
      </Stepper>
      <Message id={`${id}-msg`} error={error} />
    </div>
  );
}

export function AutoStopField({
  checked,
  disabled,
  noTimer,
  error,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  /** No timer is set, so auto-stop has nothing to wait for. */
  noTimer?: boolean;
  error?: string;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <div className="flex min-h-11 items-center justify-between gap-3 px-1">
        <Label htmlFor={id} className="grid gap-0.5 font-normal">
          <span className="text-[0.9375rem] font-medium">Auto-stop</span>
          <span className="text-[0.8125rem] text-ink-soft">
            {noTimer ? "Set a timer first" : "Stop heating when the timer ends"}
          </span>
        </Label>
        <Switch
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onChange}
          aria-describedby={error ? `${id}-msg` : undefined}
        />
      </div>
      <Message id={`${id}-msg`} error={error} />
    </div>
  );
}
