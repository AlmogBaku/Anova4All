import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Field } from "@/components/field.tsx";
import { Confirm } from "@/components/confirm.tsx";
import { ErrorAlert, Loading } from "@/components/status.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Separator } from "@/components/ui/separator.tsx";
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
      <p className="text-sm text-muted-foreground">
        No apps are connected to your account.
      </p>
    );
  return (
    <div className="grid gap-2">
      {revoke.error && <ErrorAlert>{revoke.error}</ErrorAlert>}
      <ul className="grid gap-2">
        {apps.data.map((a) => (
          <li
            key={a.clientId}
            className="flex items-center justify-between gap-4"
          >
            <span>
              {a.name}
              <span className="text-sm text-muted-foreground">
                {" "}
                · since {new Date(a.grantedAt).toLocaleDateString()}
              </span>
            </span>
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
    <form noValidate onSubmit={onSubmit} className="grid gap-3">
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
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={save.busy}>
          {save.busy ? "Saving…" : "Change password"}
        </Button>
        <span aria-live="polite" className="text-sm text-muted-foreground">
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
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Account</h1>
      <section className="grid gap-1" aria-labelledby="account-email">
        <h2 id="account-email" className="text-lg font-semibold">
          Email
        </h2>
        <p>{user?.email}</p>
      </section>

      <Separator />
      <section className="grid gap-3" aria-labelledby="account-password">
        <h2 id="account-password" className="text-lg font-semibold">
          Password
        </h2>
        <PasswordForm />
      </section>

      <Separator />
      <section className="grid gap-3" aria-labelledby="account-theme">
        <h2 id="account-theme" className="text-lg font-semibold">
          Appearance
        </h2>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby="account-theme"
          value={theme}
          onValueChange={(v) => v && setTheme(v as Theme)}
        >
          <ToggleGroupItem value="system">System</ToggleGroupItem>
          <ToggleGroupItem value="light">Light</ToggleGroupItem>
          <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
        </ToggleGroup>
      </section>

      <Separator />
      <section className="grid gap-2" aria-labelledby="account-apps">
        <h2 id="account-apps" className="text-lg font-semibold">
          Connected apps
        </h2>
        <ConnectedApps />
      </section>

      <Separator />
      {out.error && <ErrorAlert>{out.error}</ErrorAlert>}
      <div>
        <Button
          variant="outline"
          disabled={out.busy}
          onClick={() =>
            void out
              .run()
              .then((ok) => ok && navigate("/login", { replace: true }))
          }
        >
          Log out
        </Button>
      </div>
    </div>
  );
}
