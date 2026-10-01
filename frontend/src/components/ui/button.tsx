import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm text-[0.9375rem] font-semibold whitespace-nowrap transition-[background-color,color,border-color] disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper hover:bg-ink/85",
        heat: "bg-heat text-heat-ink hover:bg-heat/85",
        destructive:
          "border-2 border-destructive bg-transparent text-destructive hover:bg-destructive hover:text-paper",
        outline: "border-2 border-ink bg-transparent text-ink hover:bg-ink/8",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "text-ink hover:bg-ink/8",
        link: "h-auto min-h-11 px-0! text-ink underline decoration-[1.5px] underline-offset-4 hover:decoration-2",
      },
      size: {
        default: "h-11 px-5 has-[>svg]:px-4",
        xs: "h-11 gap-1 px-3 text-sm",
        sm: "h-11 gap-1.5 px-3.5 text-sm",
        lg: "h-14 px-6 text-base caps",
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
