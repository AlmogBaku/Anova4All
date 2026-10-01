import type { ComponentProps, FormEvent, ReactNode } from "react";
import { Link } from "react-router";
import {
  Ticket,
  TicketHead,
  TicketPage,
  TicketSection,
} from "@/components/ticket.tsx";
import { cn } from "@/lib/utils.ts";

/** A quiet secondary link: ink underline at full tap height. */
export function QuietLink({
  className,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center text-ink underline decoration-[1.5px] underline-offset-4 hover:decoration-2",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Page shell for the auth forms: one ticket with the title in the head band,
 * an optional intro, the fields, the primary key and quiet links, each below
 * a perforation.
 */
export function AuthCard({
  title,
  description,
  onSubmit,
  children,
  action,
  footer,
}: {
  title: string;
  description?: ReactNode;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  children?: ReactNode;
  /** The primary key, in its own section at the bottom of the form. */
  action?: ReactNode;
  footer?: ReactNode;
}) {
  const sections = (
    <>
      {children && (
        <TicketSection perforated={!!description} className="grid gap-4">
          {children}
        </TicketSection>
      )}
      {action && (
        <TicketSection
          perforated={!!(description || children)}
          className="grid gap-3 pt-4"
        >
          {action}
        </TicketSection>
      )}
    </>
  );
  return (
    <TicketPage width="sm">
      <Ticket>
        <TicketHead titleAs="h1" title={title} />
        {description && (
          <TicketSection
            perforated={false}
            className="grid gap-2 leading-relaxed"
          >
            {description}
          </TicketSection>
        )}
        {onSubmit ? (
          <form noValidate onSubmit={onSubmit} className="contents">
            {sections}
          </form>
        ) : (
          sections
        )}
        {footer && (
          <TicketSection className="flex flex-col items-start py-3 text-sm text-ink-soft">
            {footer}
          </TicketSection>
        )}
      </Ticket>
    </TicketPage>
  );
}
