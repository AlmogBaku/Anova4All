import { Loader2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <p
      role="status"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2Icon
        aria-hidden
        className="size-4 animate-spin motion-reduce:animate-none"
      />
      {label}
    </p>
  );
}

export function ErrorAlert({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <Alert variant="destructive" role="alert">
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function Notice({
  title,
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <Alert role="status">
      {title && <AlertTitle>{title}</AlertTitle>}
      {children && <AlertDescription>{children}</AlertDescription>}
    </Alert>
  );
}
