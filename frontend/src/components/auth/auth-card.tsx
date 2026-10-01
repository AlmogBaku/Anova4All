import type { FormEvent, ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";

/** Page shell for the auth forms. */
export function AuthCard({
  title,
  description,
  onSubmit,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const body = <CardContent className="grid gap-4">{children}</CardContent>;
  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle>
          <h1>{title}</h1>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {onSubmit ? (
        <form noValidate onSubmit={onSubmit} className="grid gap-6">
          {body}
        </form>
      ) : (
        body
      )}
      {footer && (
        <CardFooter className="flex-col items-start gap-2 text-sm">
          {footer}
        </CardFooter>
      )}
    </Card>
  );
}
