import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { QuietLink } from "@/components/auth/auth-card.tsx";
import { ErrorAlert, Loading, Notice } from "@/components/status.tsx";
import {
  OrderLine,
  Ticket,
  TicketHead,
  TicketPage,
  TicketSection,
} from "@/components/ticket.tsx";
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
        <TicketSection perforated={false}>
          <ErrorAlert>
            This link is missing its authorization request.
          </ErrorAlert>
        </TicketSection>
      </Page>
    );
  }
  if ((details.loading && !details.data) || redirect) return <Loading />;
  if (details.error !== undefined || !details.data) {
    return (
      <Page>
        <TicketSection perforated={false}>
          <ErrorAlert title="This request can't be used">
            {errorText(details.error)} Start connecting again from the app.
          </ErrorAlert>
        </TicketSection>
      </Page>
    );
  }
  if (denied) {
    return (
      <Page>
        <TicketSection perforated={false}>
          <Notice title="Request refused">
            Nothing was shared. You can close this tab.
          </Notice>
        </TicketSection>
      </Page>
    );
  }

  const d = details.data;
  const name = d.kind === "consent" ? d.clientName : "This app";
  const host = redirectHost(d.kind === "consent" ? d.redirectUri : d.url);

  return (
    <Page>
      <TicketSection perforated={false} className="grid gap-4">
        <p className="text-lg leading-snug">
          <span className="font-medium break-words">{name}</span> wants to use
          your cookers.
        </p>
        <div>
          <OrderLine label="Signed in as">
            <span className="break-all">{user?.email}</span>
          </OrderLine>
          <OrderLine label="Returns to">
            <span className="font-mono text-[0.9375rem] break-all">{host}</span>
          </OrderLine>
        </div>
      </TicketSection>
      <TicketSection className="grid gap-4">
        <p className="leading-relaxed text-ink-soft">
          It can see your cookers and start, change or stop a cook. It can't
          pair, rename or share them. Remove it any time from your account.
        </p>
        {choice === "refuse" && (
          <ErrorAlert title="This app can't be approved here">
            {framed
              ? "This page was opened inside another page. Open it in its own tab."
              : `Only Claude, ChatGPT or an app on this computer can connect, and ${host} isn't one of them.`}
          </ErrorAlert>
        )}
        {decide.error && <ErrorAlert>{decide.error}</ErrorAlert>}
      </TicketSection>
      {(choice === "approve" || d.kind === "consent") && (
        <TicketSection className="grid gap-3 pt-4">
          {choice === "approve" && (
            <Button
              size="lg"
              className="w-full"
              disabled={decide.busy}
              onClick={() => void decide.run(true, true)}
            >
              Approve
            </Button>
          )}
          {d.kind === "consent" && (
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              disabled={decide.busy}
              onClick={() => void decide.run(false, choice === "approve")}
            >
              Deny
            </Button>
          )}
        </TicketSection>
      )}
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <TicketPage width="sm">
      <Ticket>
        <TicketHead titleAs="h1" title="Connect an app" />
        {children}
        <TicketSection className="py-3 text-sm">
          <QuietLink to="/account">Your account</QuietLink>
        </TicketSection>
      </Ticket>
    </TicketPage>
  );
}
