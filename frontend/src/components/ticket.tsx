// The Ticket Rail: every surface is a paper ticket hanging from a steel rail.
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils.ts";

/** The steel rail tickets hang from. Its children slide out from under it. */
export function Rail({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("relative", className)} {...props}>
      <div
        aria-hidden
        className="relative z-10 h-3 rounded-[2px] bg-linear-to-b from-rail-hi via-rail to-rail shadow-[0_2px_3px_oklch(0.2_0.01_250/0.25)]"
      />
      <div className="-mt-1">{children}</div>
    </div>
  );
}

/** A paper ticket with a torn bottom edge. */
export function Ticket({
  className,
  children,
  ...props
}: ComponentProps<"article">) {
  return (
    <article
      className={cn(
        "relative mb-[6px] flex flex-col bg-paper text-ink shadow-ticket",
        className,
      )}
      {...props}
    >
      <div
        aria-hidden
        className="torn-edge absolute inset-x-0 -bottom-[6px] h-[7px] bg-paper"
      />
      {children}
    </article>
  );
}

export type HeadTone = "idle" | "heat" | "offline";

/**
 * The ticket's head band. Heat floods in from the left when a cook fires and
 * drains when it's bumped; it is the only place the heat colour shows a state.
 */
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
        "group/head relative isolate flex min-h-14 items-center justify-between gap-3 overflow-hidden px-5 pt-1",
        tone === "offline" ? "bg-muted text-ink-soft" : "bg-ink text-paper",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-0 -z-10 bg-heat transition-[clip-path] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] [clip-path:inset(0_100%_0_0)] group-data-[tone=heat]/head:[clip-path:inset(0_0_0_0)]"
      />
      <Title
        id={titleId}
        className="caps min-w-0 truncate text-lg transition-colors duration-300 group-data-[tone=heat]/head:text-heat-ink"
      >
        {title}
      </Title>
      {meta && (
        <span className="caps shrink-0 text-sm transition-colors duration-300 group-data-[tone=heat]/head:text-heat-ink">
          {meta}
        </span>
      )}
    </header>
  );
}

/** A section of the ticket, below a perforation when it isn't the first. */
export function TicketSection({
  className,
  perforated = true,
  ...props
}: ComponentProps<"div"> & { perforated?: boolean }) {
  return (
    <div
      className={cn("px-5 py-5", perforated && "perforation", className)}
      {...props}
    />
  );
}

/** A label/value order line: label in caps on the left, value on the right. */
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
        "flex items-baseline justify-between gap-4 py-1 text-base",
        className,
      )}
    >
      <span className="caps text-sm text-ink-soft">{label}</span>
      <span className="text-right font-semibold tabular-nums">{children}</span>
    </div>
  );
}

/** A single-ticket page: the rail, then one ticket at reading width. */
export function TicketPage({
  className,
  width = "md",
  children,
}: {
  className?: string;
  width?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  return (
    <Rail
      className={cn(
        "mx-auto w-full",
        width === "sm" && "max-w-md",
        width === "md" && "max-w-xl",
        width === "lg" && "max-w-2xl",
        className,
      )}
    >
      <div className="grid gap-6 px-1.5 sm:px-3">{children}</div>
    </Rail>
  );
}
