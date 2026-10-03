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
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-45 data-[size=default]:h-[1.875rem] data-[size=default]:w-[3.125rem] data-[size=sm]:h-6 data-[size=sm]:w-10 data-[state=checked]:bg-linear-to-br data-[state=checked]:from-heat-hi data-[state=checked]:to-heat data-[state=unchecked]:bg-rail after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] ring-0 transition-transform group-data-[size=default]/switch:size-6 group-data-[size=sm]/switch:size-3.5 data-[state=checked]:translate-x-[1.375rem] data-[state=unchecked]:translate-x-[0.1875rem]",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
