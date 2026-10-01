// °C | °F, a small segmented pill that sits in the dial's open bottom. It is
// part of the instrument, so it is drawn in well and paper, never copper.
import { RadioGroup } from "radix-ui";
import type { TemperatureUnit } from "@/lib/api/types.ts";
import { cn } from "@/lib/utils.ts";
import { unitOf } from "./dial.ts";

const UNITS = [
  { value: "c", label: "°C", name: "Celsius" },
  { value: "f", label: "°F", name: "Fahrenheit" },
] as const;

export function UnitSwitch({
  unit,
  disabled,
  onChange,
  className,
}: {
  unit: TemperatureUnit;
  disabled?: boolean;
  onChange: (u: TemperatureUnit) => void;
  className?: string;
}) {
  return (
    <RadioGroup.Root
      aria-label="Temperature unit"
      orientation="horizontal"
      loop
      disabled={disabled}
      value={unit}
      onValueChange={(v) => {
        const u = unitOf(v);
        if (u) onChange(u);
      }}
      // The dial drags from the ring around it; a tap here only picks a unit.
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "relative grid h-8 w-24 grid-cols-2 rounded-full bg-well p-0.5 shadow-[inset_0_0_0_1px_var(--rail-hi)] data-disabled:opacity-45",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-full bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.14),0_0_0_0.5px_rgb(0_0_0/0.05)] transition-transform duration-180 ease-out motion-reduce:transition-none dark:bg-rail dark:shadow-[0_1px_2px_rgb(0_0_0/0.5)]",
          unit === "f" && "translate-x-full",
        )}
      />
      {UNITS.map((u) => (
        <RadioGroup.Item
          key={u.value}
          value={u.value}
          aria-label={u.name}
          className="relative cursor-pointer rounded-full text-[0.8125rem] leading-none font-medium tracking-normal text-ink-soft outline-none transition-colors duration-180 before:absolute before:-inset-y-2 before:inset-x-0 hover:text-ink focus-visible:shadow-[0_0_0_2px_var(--paper),0_0_0_4px_var(--heat)] disabled:cursor-not-allowed disabled:hover:text-ink-soft data-[state=checked]:text-ink motion-reduce:transition-none"
        >
          {u.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
