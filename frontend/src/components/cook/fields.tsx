// Inputs for the cook screen. While a field has focus it shows what the user
// typed, so live status updates never overwrite an edit in progress.
import { useId, useState } from "react";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import type { TemperatureUnit } from "@/lib/api/types.ts";
import {
  digitsToMinutes,
  formatDigits,
  minutesToDigits,
  normalizeDigits,
} from "./duration.ts";

function Message({
  id,
  error,
  hint,
}: {
  id: string;
  error?: string;
  hint?: string;
}) {
  if (error) {
    return (
      <p id={id} className="text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className="text-sm text-muted-foreground">
        {hint}
      </p>
    );
  }
  return null;
}

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
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Target temperature (°{unit.toUpperCase()})</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.1"
        className="w-32"
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
      <Message id={`${id}-msg`} error={error} />
    </div>
  );
}

export function UnitField({
  unit,
  disabled,
  onChange,
}: {
  unit: TemperatureUnit;
  disabled?: boolean;
  onChange: (u: TemperatureUnit) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium" id="unit-label">
        Unit
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        aria-labelledby="unit-label"
        disabled={disabled}
        value={unit}
        onValueChange={(v) => v && onChange(v as TemperatureUnit)}
      >
        <ToggleGroupItem value="c" aria-label="Celsius">
          °C
        </ToggleGroupItem>
        <ToggleGroupItem value="f" aria-label="Fahrenheit">
          °F
        </ToggleGroupItem>
      </ToggleGroup>
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
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className="w-32 tabular-nums"
        disabled={disabled}
        value={formatDigits(digits ?? minutesToDigits(minutes))}
        aria-invalid={!!error || undefined}
        aria-describedby={`${id}-msg`}
        onFocus={() => setDigits(minutesToDigits(minutes))}
        onBlur={() => setDigits(null)}
        onChange={(e) => {
          const d = normalizeDigits(e.target.value);
          setDigits(d);
          onChange(digitsToMinutes(d));
        }}
      />
      <Message
        id={`${id}-msg`}
        error={error}
        hint="Hours:minutes. 00:00 means no timer."
      />
    </div>
  );
}

export function AutoStopField({
  checked,
  disabled,
  error,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  error?: string;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-3">
        <Switch
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onChange}
          aria-describedby={`${id}-msg`}
        />
        <Label htmlFor={id}>Stop heating when the timer ends</Label>
      </div>
      <Message
        id={`${id}-msg`}
        error={error}
        hint={disabled ? "Set a timer first." : undefined}
      />
    </div>
  );
}
