import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * iOS-style grouped list container: rounded corners, paper background with
 * hairline border. Items inside are separated by hairline borders.
 */
export function GroupedList({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.375rem] border border-hairline bg-paper",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Section header: small uppercase label with ink-soft color, positioned above
 * a grouped list.
 */
export function SectionHeader({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <h2
      id={id}
      className={cn(
        "px-2 pt-[1.125rem] text-[0.8125rem] font-medium text-ink-soft",
        className,
      )}
    >
      {children}
    </h2>
  );
}

/**
 * A list item row: 44px min height, flex layout, hairline border on top except
 * first child. Supports left content (avatar, icon), main content (grows), and
 * right content (value, chevron, button).
 */
export function ListItem({
  className,
  children,
  onClick,
  role,
  "aria-label": ariaLabel,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  role?: string;
  "aria-label"?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      role={role}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "flex min-h-[2.75rem] items-center gap-3 border-t border-hairline px-4 py-[0.8125rem] text-[0.9375rem] first:border-t-0",
        onClick &&
          "w-full cursor-pointer text-left transition-colors hover:bg-well active:scale-[0.99]",
        className,
      )}
    >
      {children}
    </Comp>
  );
}

/**
 * Avatar circle: small colored circle with initials, used in member lists.
 */
export function Avatar({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid size-[1.875rem] shrink-0 place-items-center rounded-full bg-well text-xs font-semibold text-ink-soft",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * ListItem content area that grows to fill available space.
 */
export function ListItemContent({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("min-w-0 flex-1", className)}>{children}</div>;
}

/**
 * ListItem secondary text (small, soft color).
 */
export function ListItemSecondary({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn("mt-0.5 block text-[0.8125rem] text-ink-soft", className)}
    >
      {children}
    </span>
  );
}

/**
 * ListItem end section: right-aligned content (value, chevron, etc).
 */
export function ListItemEnd({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "ml-auto flex shrink-0 items-center gap-1.5 text-sm text-ink-soft",
        className,
      )}
    >
      {children}
    </div>
  );
}
