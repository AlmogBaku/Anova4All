import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Toggle as TogglePrimitive } from "radix-ui";

const toggleVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm text-[0.9375rem] font-semibold whitespace-nowrap transition-colors outline-none hover:bg-ink/8 disabled:pointer-events-none disabled:opacity-45 data-[state=on]:bg-ink data-[state=on]:text-paper [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border-2 border-ink bg-transparent",
      },
      size: {
        default: "h-11 min-w-12 px-3",
        sm: "h-11 min-w-11 px-2",
        lg: "h-12 min-w-12 px-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
