import { useState, type FormEvent } from "react";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";
import { Field } from "@/components/field.tsx";
import { Confirm } from "@/components/confirm.tsx";
import { ErrorAlert, Loading } from "@/components/status.tsx";
import {
  Avatar,
  GroupedList,
  ListItem,
  ListItemContent,
  ListItemEnd,
  ListItemSecondary,
  SectionHeader,
} from "@/components/settings/grouped-list.tsx";
import { Sheet, SheetContent } from "@/components/settings/sheet.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { useAuth } from "@/contexts/auth.tsx";
import { useTheme, type Theme } from "@/contexts/theme.tsx";
import { useAction } from "@/hooks/use-action.ts";
import { useAsync } from "@/hooks/use-async.ts";
import { signOut, updatePassword, validatePassword } from "@/lib/auth.ts";
import { oauth } from "@/lib/data.ts";
import { errorText } from "@/lib/errors.ts";

function PasswordSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setPassword("");
          setInvalid(null);
          setSaved(false);
        }
      }}
    >
      <SheetContent title="Change password">
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
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={save.busy}
          >
            {save.busy ? "Saving…" : "Change password"}
          </Button>
          <span
            aria-live="polite"
            className="text-center text-sm text-ink-soft"
          >
            {saved ? "Password changed" : ""}
          </span>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ConnectedAppsSheet({
  open,
  onOpenChange,
  apps,
  onReload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apps: ReturnType<typeof useAsync<Awaited<ReturnType<typeof oauth.apps>>>>;
  onReload: () => void;
}) {
  const revoke = useAction(async (clientId: string) => {
    await oauth.revoke(clientId);
    return true;
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Connected apps">
        {apps.loading && !apps.data && <Loading />}
        {apps.error !== undefined && (
          <ErrorAlert>{errorText(apps.error)}</ErrorAlert>
        )}
        {!apps.loading && !apps.data?.length && (
          <p className="text-sm text-ink-soft">
            No apps are connected to your account.
          </p>
        )}
        {apps.data && apps.data.length > 0 && (
          <div className="grid gap-3">
            {revoke.error && <ErrorAlert>{revoke.error}</ErrorAlert>}
            <GroupedList>
              {apps.data.map((a) => (
                <ListItem key={a.clientId}>
                  <ListItemContent>
                    <div className="font-medium">{a.name}</div>
                    <ListItemSecondary>
                      Since {new Date(a.grantedAt).toLocaleDateString()}
                    </ListItemSecondary>
                  </ListItemContent>
                  <ListItemEnd>
                    <Confirm
                      trigger={
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={revoke.busy}
                        >
                          Revoke
                        </Button>
                      }
                      title={`Revoke ${a.name}?`}
                      description="It can't start new sessions. One already open stops working within an hour."
                      action="Revoke"
                      onConfirm={() =>
                        void revoke
                          .run(a.clientId)
                          .then((ok) => ok && onReload())
                      }
                    />
                  </ListItemEnd>
                </ListItem>
              ))}
            </GroupedList>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function AccountPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const apps = useAsync("apps", () => oauth.apps());
  const out = useAction(async () => {
    await signOut();
    return true;
  });

  const appsCount = apps.data?.length ?? 0;
  const appsText =
    appsCount === 0 ? "None" : `${appsCount} app${appsCount === 1 ? "" : "s"}`;

  return (
    <div className="mx-auto grid w-full max-w-xl gap-5 px-6 pb-8 pt-6">
      <h1 className="px-1 text-[1.875rem] font-medium leading-[1.15] tracking-[-0.03em]">
        Account
      </h1>

      <section aria-label="User" className="grid gap-2">
        <GroupedList>
          <ListItem>
            <Avatar>{user?.email?.charAt(0).toUpperCase() ?? "?"}</Avatar>
            <ListItemContent>
              <div className="break-all font-medium">{user?.email}</div>
              <ListItemSecondary>Logged in</ListItemSecondary>
            </ListItemContent>
          </ListItem>
        </GroupedList>
      </section>

      <section aria-labelledby="account-preferences" className="grid gap-2">
        <SectionHeader id="account-preferences">Preferences</SectionHeader>
        <GroupedList>
          <ListItem className="items-center justify-between">
            <ListItemContent>Appearance</ListItemContent>
            <ToggleGroup
              type="single"
              variant="outline"
              aria-labelledby="account-preferences"
              value={theme}
              onValueChange={(v) => v && setTheme(v as Theme)}
              className="ml-auto w-auto shrink-0 gap-0 p-1"
              style={{ marginTop: 0, marginBottom: 0 }}
            >
              <ToggleGroupItem
                value="system"
                className="h-8 px-3 text-[0.8125rem]"
              >
                Auto
              </ToggleGroupItem>
              <ToggleGroupItem
                value="light"
                className="h-8 px-3 text-[0.8125rem]"
              >
                Light
              </ToggleGroupItem>
              <ToggleGroupItem
                value="dark"
                className="h-8 px-3 text-[0.8125rem]"
              >
                Dark
              </ToggleGroupItem>
            </ToggleGroup>
          </ListItem>
        </GroupedList>
      </section>

      <section aria-labelledby="account-security" className="grid gap-2">
        <SectionHeader id="account-security">Security</SectionHeader>
        <GroupedList>
          <ListItem
            onClick={() => setPasswordOpen(true)}
            role="button"
            aria-label="Change password"
          >
            <ListItemContent>Change password</ListItemContent>
            <ListItemEnd>
              <ChevronRight className="size-3.5 text-hairline" />
            </ListItemEnd>
          </ListItem>
          <ListItem
            onClick={() => setAppsOpen(true)}
            role="button"
            aria-label={`Connected apps: ${appsText}`}
          >
            <ListItemContent>Connected apps</ListItemContent>
            <ListItemEnd>
              {appsText}
              <ChevronRight className="size-3.5 text-hairline" />
            </ListItemEnd>
          </ListItem>
        </GroupedList>
      </section>

      <section aria-label="Actions" className="grid gap-2">
        <GroupedList>
          {out.error && (
            <div className="px-4 py-3">
              <ErrorAlert>{out.error}</ErrorAlert>
            </div>
          )}
          <Confirm
            trigger={
              <ListItem
                role="button"
                aria-label="Log out"
                className="text-destructive"
              >
                <ListItemContent>Log out</ListItemContent>
              </ListItem>
            }
            title="Log out?"
            description="You'll need to log in again to use Anova4All."
            action="Log out"
            onConfirm={() =>
              void out
                .run()
                .then((ok) => ok && navigate("/login", { replace: true }))
            }
          />
        </GroupedList>
      </section>

      <PasswordSheet open={passwordOpen} onOpenChange={setPasswordOpen} />
      <ConnectedAppsSheet
        open={appsOpen}
        onOpenChange={setAppsOpen}
        apps={apps}
        onReload={() => apps.reload()}
      />
    </div>
  );
}
