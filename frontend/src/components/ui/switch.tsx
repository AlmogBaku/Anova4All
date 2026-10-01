"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Switch as SwitchPrimitive } from "radix-ui";

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-sm border-2 border-ink transition-colors disabled:cursor-not-allowed disabled:opacity-45 data-[size=default]:h-8 data-[size=default]:w-14 data-[size=sm]:h-6 data-[size=sm]:w-10 data-[state=checked]:bg-ink data-[state=unchecked]:bg-transparent after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-[1px] ring-0 transition-transform group-data-[size=default]/switch:size-5 group-data-[size=sm]/switch:size-3.5 data-[state=checked]:translate-x-[calc(100%+0.625rem)] data-[state=checked]:bg-paper data-[state=unchecked]:translate-x-1 data-[state=unchecked]:bg-ink-soft/70",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
