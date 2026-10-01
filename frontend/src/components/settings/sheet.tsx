import type { ReactNode } from "react";
import { AlertDialog } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Sheet: slides up from bottom on mobile, centered dialog on desktop.
 * Uses AlertDialog primitives for the base behavior.
 */
export function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </AlertDialog.Root>
  );
}

export function SheetTrigger({
  asChild = true,
  ...props
}: React.ComponentProps<typeof AlertDialog.Trigger> & { asChild?: boolean }) {
  return <AlertDialog.Trigger asChild={asChild} {...props} />;
}

export function SheetContent({
  className,
  children,
  title,
}: {
  className?: string;
  children: ReactNode;
  title: string;
}) {
  return (
    <AlertDialog.Portal>
      <AlertDialog.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-ink/45 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        )}
      />
      <AlertDialog.Content
        className={cn(
          "fixed z-50 w-full max-w-md gap-4 rounded-t-[1.75rem] bg-paper p-6 pb-8 shadow-lg",
          "left-1/2 top-auto bottom-0 -translate-x-1/2",
          "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-full",
          "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-full",
          "sm:rounded-[1.625rem] sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2",
          "sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:slide-in-from-top-[48%]",
          "sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=closed]:slide-out-to-top-[48%]",
          className,
        )}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-hairline sm:hidden" />
        <AlertDialog.Title className="text-[1.375rem] font-medium leading-tight tracking-[-0.02em]">
          {title}
        </AlertDialog.Title>
        <div className="grid gap-4">{children}</div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  );
}
