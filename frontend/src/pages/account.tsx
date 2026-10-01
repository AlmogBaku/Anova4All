import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Field } from "@/components/field.tsx";
import { Confirm } from "@/components/confirm.tsx";
import { ErrorAlert, Loading } from "@/components/status.tsx";
import {
  OrderLine,
  Ticket,
  TicketHead,
  TicketPage,
  TicketSection,
} from "@/components/ticket.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { useAuth } from "@/contexts/auth.tsx";
import { useTheme, type Theme } from "@/contexts/theme.tsx";
import { useAction } from "@/hooks/use-action.ts";
import { useAsync } from "@/hooks/use-async.ts";
import { signOut, updatePassword, validatePassword } from "@/lib/auth.ts";
import { oauth } from "@/lib/data.ts";
import { errorText } from "@/lib/errors.ts";

/** AI apps the user approved on the consent page; revoking stops their refresh at once. */
function ConnectedApps() {
  const apps = useAsync("apps", () => oauth.apps());
  const revoke = useAction(async (clientId: string) => {
    await oauth.revoke(clientId);
    return true;
  });
  if (apps.loading && !apps.data) return <Loading />;
  if (apps.error !== undefined)
    return <ErrorAlert>{errorText(apps.error)}</ErrorAlert>;
  if (!apps.data?.length)
    return (
      <p className="text-ink-soft">No apps are connected to your account.</p>
    );
  return (
    <div className="grid gap-2">
      {revoke.error && <ErrorAlert>{revoke.error}</ErrorAlert>}
      <ul className="grid">
        {apps.data.map((a) => (
          <li key={a.clientId}>
            <OrderLine
              className="items-center [&>span:first-child]:min-w-0 [&>span:first-child]:break-words"
              label={
                <>
                  {a.name}
                  <span className="mt-0.5 block font-sans text-sm font-normal tracking-normal text-ink-soft normal-case [font-stretch:100%]">
                    Since {new Date(a.grantedAt).toLocaleDateString()}
                  </span>
                </>
              }
            >
              <Confirm
                trigger={
                  <Button variant="outline" size="sm" disabled={revoke.busy}>
                    Revoke
                  </Button>
                }
                title={`Revoke ${a.name}?`}
                description="It can't start new sessions. One already open stops working within an hour."
                action="Revoke"
                onConfirm={() =>
                  void revoke.run(a.clientId).then((ok) => ok && apps.reload())
                }
              />
            </OrderLine>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PasswordForm() {
  const [password, setPassword] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useAction(async (p: string) => {
    await updatePassword(p);
    return true;
  });
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const err = validatePassword(password);
    setInvalid(err);
    if (!err && (await save.run(password))) {
      setPassword("");
      setSaved(true);
    }
  };
  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-4">
      {save.error && <ErrorAlert>{save.error}</ErrorAlert>}
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={invalid}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="grid gap-2">
        <Button type="submit" size="lg" className="w-full" disabled={save.busy}>
          {save.busy ? "Saving…" : "Change password"}
        </Button>
        <span aria-live="polite" className="text-center text-sm text-ink-soft">
          {saved ? "Password changed" : ""}
        </span>
      </div>
    </form>
  );
}

export function AccountPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const out = useAction(async () => {
    await signOut();
    return true;
  });

  return (
    <TicketPage>
      <Ticket>
        <TicketHead titleAs="h1" title="Account" />
        <TicketSection perforated={false}>
          <OrderLine label="Email">
            <span className="break-all">{user?.email}</span>
          </OrderLine>
        </TicketSection>

        <Section id="account-password" title="Password">
          <PasswordForm />
        </Section>

        <Section id="account-theme" title="Appearance">
          <ToggleGroup
            type="single"
            variant="outline"
            aria-labelledby="account-theme"
            value={theme}
            onValueChange={(v) => v && setTheme(v as Theme)}
            className="grid w-full grid-cols-3"
          >
            <ToggleGroupItem value="system">System</ToggleGroupItem>
            <ToggleGroupItem value="light">Light</ToggleGroupItem>
            <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
          </ToggleGroup>
        </Section>

        <Section id="account-apps" title="Connected apps">
          <ConnectedApps />
        </Section>

        <TicketSection className="grid gap-3">
          {out.error && <ErrorAlert>{out.error}</ErrorAlert>}
          <Button
            variant="outline"
            className="w-full"
            disabled={out.busy}
            onClick={() =>
              void out
                .run()
                .then((ok) => ok && navigate("/login", { replace: true }))
            }
          >
            Log out
          </Button>
        </TicketSection>
      </Ticket>
    </TicketPage>
  );
}

/** A perforated ticket section with a caps heading. */
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <TicketSection>
      <section className="grid gap-4" aria-labelledby={id}>
        <h2 id={id} className="caps text-sm text-ink-soft">
          {title}
        </h2>
        {children}
      </section>
    </TicketSection>
  );
}
