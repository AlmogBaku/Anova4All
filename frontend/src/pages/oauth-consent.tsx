import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ErrorAlert, Loading, Notice } from "@/components/status.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useAuth } from "@/contexts/auth.tsx";
import { useAction } from "@/hooks/use-action.ts";
import { useAsync } from "@/hooks/use-async.ts";
import { oauth } from "@/lib/data.ts";
import { errorText } from "@/lib/errors.ts";
import { consentChoice, inFrame, redirectHost } from "@/lib/oauth.ts";

/**
 * /oauth/consent?authorization_id=… — Supabase's OAuth server sends AI apps
 * here. The page only ever navigates to the URL Supabase returns.
 */
export function OAuthConsentPage() {
  const [params] = useSearchParams();
  const id = params.get("authorization_id");
  const { user } = useAuth();
  const [framed] = useState(() => inFrame());
  const details = useAsync(id, () => oauth.details(id!));
  const [denied, setDenied] = useState(false);
  const decide = useAction(async (approve: boolean, follow: boolean) => {
    const url = approve ? await oauth.approve(id!) : await oauth.deny(id!);
    if (follow) window.location.assign(url);
    else setDenied(true);
  });

  const choice = details.data ? consentChoice(details.data, framed) : null;
  const redirect =
    details.data?.kind === "redirect" && choice === "follow"
      ? details.data.url
      : null;
  useEffect(() => {
    if (redirect) window.location.assign(redirect);
  }, [redirect]);

  if (!id) {
    return (
      <Page>
        <ErrorAlert>This link is missing its authorization request.</ErrorAlert>
      </Page>
    );
  }
  if ((details.loading && !details.data) || redirect) return <Loading />;
  if (details.error !== undefined || !details.data) {
    return (
      <Page>
        <ErrorAlert title="This request can't be used">
          {errorText(details.error)} Start connecting again from the app.
        </ErrorAlert>
      </Page>
    );
  }
  if (denied) {
    return (
      <Page>
        <Notice title="Request refused">
          Nothing was shared. You can close this tab.
        </Notice>
      </Page>
    );
  }

  const d = details.data;
  const name = d.kind === "consent" ? d.clientName : "This app";
  const host = redirectHost(d.kind === "consent" ? d.redirectUri : d.url);

  return (
    <Page>
      <p>
        <strong className="font-semibold">{name}</strong> wants to use your
        cookers as <span className="font-medium">{user?.email}</span>. It will
        return to <span className="font-mono text-sm">{host}</span>.
      </p>
      <p className="text-sm text-muted-foreground">
        It can see your cookers and start, change or stop a cook. It can't pair,
        rename or share them. Remove it any time from your account.
      </p>
      {choice === "refuse" && (
        <ErrorAlert title="This app can't be approved here">
          {framed
            ? "This page was opened inside another page. Open it in its own tab."
            : `Only Claude, ChatGPT or an app on this computer can connect, and ${host} isn't one of them.`}
        </ErrorAlert>
      )}
      {decide.error && <ErrorAlert>{decide.error}</ErrorAlert>}
      <div className="flex gap-3">
        {choice === "approve" && (
          <Button
            disabled={decide.busy}
            onClick={() => void decide.run(true, true)}
          >
            Approve
          </Button>
        )}
        {d.kind === "consent" && (
          <Button
            variant="outline"
            disabled={decide.busy}
            onClick={() => void decide.run(false, choice === "approve")}
          >
            Deny
          </Button>
        )}
      </div>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid max-w-prose gap-4">
      <h1 className="text-2xl font-semibold">Connect an app</h1>
      {children}
      <Link to="/account" className="text-sm underline">
        Your account
      </Link>
    </div>
  );
}
