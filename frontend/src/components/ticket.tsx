// Copper Ring surfaces. The names are the app's original vocabulary: a Ticket
// is a card, a TicketHead its title row, a TicketSection a hairline-split part.
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils.ts";

/** A plain wrapper kept for layout; cards sit directly on the ground. */
export function Rail({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("relative", className)} {...props}>
      {children}
    </div>
  );
}

/** A soft white card with a hairline border. */
export function Ticket({
  className,
  children,
  ...props
}: ComponentProps<"article">) {
  return (
    <article
      className={cn(
        "relative flex flex-col rounded-[1.75rem] bg-paper text-ink shadow-ticket",
        className,
      )}
      {...props}
    >
      {children}
    </article>
  );
}

export type HeadTone = "idle" | "heat" | "offline";

/** The card's title row, with a quiet state on the right. Copper means heating. */
export function TicketHead({
  tone = "idle",
  title,
  meta,
  className,
  titleAs: Title = "h2",
  titleId,
}: {
  tone?: HeadTone;
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
  titleAs?: "h1" | "h2" | "h3";
  titleId?: string;
}) {
  return (
    <header
      data-tone={tone}
      className={cn(
        "flex min-h-12 items-center justify-between gap-3 px-5 pt-4 sm:px-6",
        className,
      )}
    >
      <Title
        id={titleId}
        className="min-w-0 truncate text-[1.0625rem] font-medium tracking-[-0.01em]"
      >
        {title}
      </Title>
      {meta && (
        <span
          className={cn(
            "flex shrink-0 items-center gap-2 text-[0.8125rem] font-medium",
            tone === "heat" ? "text-heat" : "text-ink-soft",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              tone === "heat"
                ? "bg-heat shadow-[0_0_0_4px_var(--glow)]"
                : tone === "offline"
                  ? "bg-rail"
                  : "bg-ink-soft/60",
            )}
          />
          {meta}
        </span>
      )}
    </header>
  );
}

/** A part of the card, below a hairline when it isn't the first. */
export function TicketSection({
  className,
  perforated = true,
  ...props
}: ComponentProps<"div"> & { perforated?: boolean }) {
  return (
    <div
      className={cn(
        "px-5 py-4 sm:px-6 sm:py-5",
        perforated && "perforation",
        className,
      )}
      {...props}
    />
  );
}

/** A label/value line: a quiet label on the left, the value on the right. */
export function OrderLine({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-1 text-[0.9375rem]",
        className,
      )}
    >
      <span className="text-ink-soft">{label}</span>
      <span className="text-right font-medium tabular-nums">{children}</span>
    </div>
  );
}

/** A single-card page at reading width. */
export function TicketPage({
  className,
  width = "md",
  children,
}: {
  className?: string;
  width?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto grid w-full gap-4",
        width === "sm" && "max-w-md",
        width === "md" && "max-w-xl",
        width === "lg" && "max-w-2xl",
        width === "xl" && "max-w-4xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
