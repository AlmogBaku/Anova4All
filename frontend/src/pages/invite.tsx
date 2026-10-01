import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ErrorAlert } from "@/components/status.tsx";
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
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">Invite</h1>
        <ErrorAlert>
          This invite link is incomplete. Copy the whole link and open it again.
        </ErrorAlert>
        <Link to="/" className="underline">
          Go to your cookers
        </Link>
      </div>
    );
  }

  const onAccept = async () => {
    const deviceId = await accept.run(token);
    // replace: the invite URL (with its token) leaves the history.
    if (deviceId) navigate(`/devices/${deviceId}`, { replace: true });
  };

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">You're invited to a cooker</h1>
      <p>
        Accept to add the cooker to your list. You'll be able to see and control
        it.
      </p>
      {accept.error && <ErrorAlert>{accept.error}</ErrorAlert>}
      <div className="flex gap-2">
        <Button onClick={() => void onAccept()} disabled={accept.busy}>
          {accept.busy ? "Accepting…" : "Accept invite"}
        </Button>
        <Button asChild variant="outline">
          <Link to="/" replace>
            Not now
          </Link>
        </Button>
      </div>
    </div>
  );
}
