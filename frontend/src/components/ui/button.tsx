import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full text-[0.9375rem] font-medium whitespace-nowrap transition-[background-color,color,border-color] disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper hover:bg-ink/88",
        heat: "bg-linear-to-br from-heat-hi to-heat text-heat-ink hover:brightness-105",
        destructive:
          "border border-destructive/40 bg-transparent text-destructive hover:bg-destructive/8",
        outline: "border border-rail bg-paper text-ink hover:bg-well",
        secondary: "bg-well text-ink hover:bg-rail-hi",
        ghost: "text-ink hover:bg-well",
        link: "h-auto min-h-11 px-0! text-ink-soft underline decoration-rail decoration-1 underline-offset-4 hover:text-ink hover:decoration-ink-soft",
      },
      size: {
        default: "h-11 px-5 has-[>svg]:px-4",
        xs: "h-11 gap-1 px-3 text-sm",
        sm: "h-11 gap-1.5 px-3.5 text-sm",
        lg: "h-14 px-7 text-base",
        icon: "size-11",
        "icon-xs": "size-11 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-11",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
