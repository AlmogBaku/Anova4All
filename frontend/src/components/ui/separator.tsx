"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Separator as SeparatorPrimitive } from "radix-ui";

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 data-[orientation=horizontal]:w-full data-[orientation=horizontal]:border-t-2 data-[orientation=horizontal]:border-dashed data-[orientation=horizontal]:border-border data-[orientation=vertical]:bg-border data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
