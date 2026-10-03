import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ErrorAlert } from "@/components/status.tsx";
import {
  Ticket,
  TicketHead,
  TicketPage,
  TicketSection,
} from "@/components/ticket.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useAction } from "@/hooks/use-action.ts";
import { devices } from "@/lib/data.ts";
import { inviteTokenFromHash } from "@/lib/devices.ts";

/**
 * /invite#token=… (logged in). The token is read from the fragment only, sent
 * to Supabase in the RPC body, and never to the Go API, logs or storage.
 */
export function InvitePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => inviteTokenFromHash(location.hash));
  const accept = useAction((t: string) => devices.acceptInvite(t));

  if (!token) {
    return (
      <TicketPage width="sm">
        <Ticket>
          <TicketHead titleAs="h1" title="Invite" tone="offline" />
          <TicketSection perforated={false} className="grid gap-5">
            <ErrorAlert>
              This invite link is incomplete. Copy the whole link and open it
              again.
            </ErrorAlert>
            <Button asChild variant="outline" className="w-full">
              <Link to="/" className="no-underline">
                Go to your cookers
              </Link>
            </Button>
          </TicketSection>
        </Ticket>
      </TicketPage>
    );
  }

  const onAccept = async () => {
    const deviceId = await accept.run(token);
    // replace: the invite URL (with its token) leaves the history.
    if (deviceId) navigate(`/devices/${deviceId}`, { replace: true });
  };

  return (
    <TicketPage width="sm">
      <Ticket>
        <TicketHead titleAs="h1" title="You're invited" />
        <TicketSection perforated={false} className="grid gap-4">
          <p className="leading-relaxed">
            Someone shared a cooker with you. Accept to add it to your list.
            You'll be able to see and control it.
          </p>
          {accept.error && <ErrorAlert>{accept.error}</ErrorAlert>}
        </TicketSection>
        <TicketSection className="grid gap-2 pt-4">
          <Button
            size="lg"
            className="w-full"
            onClick={() => void onAccept()}
            disabled={accept.busy}
          >
            {accept.busy ? "Accepting…" : "Accept invite"}
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link to="/" replace className="no-underline">
              Not now
            </Link>
          </Button>
        </TicketSection>
      </Ticket>
    </TicketPage>
  );
}
