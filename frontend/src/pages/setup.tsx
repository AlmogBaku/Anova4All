import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { DONE_TOAST, COMMON } from "@/components/setup/copy.ts";
import { SetupWizard } from "@/components/setup/setup-wizard.tsx";
import { TicketPage } from "@/components/ticket.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useSetup } from "@/hooks/use-setup.ts";

export function SetupPage() {
  const { state, runner } = useSetup();
  const navigate = useNavigate();
  const deviceId = state.step === "done" ? state.device?.id : undefined;

  useEffect(() => {
    if (!deviceId) return;
    toast(DONE_TOAST);
    navigate(`/devices/${deviceId}`, { replace: true });
  }, [deviceId, navigate]);

  return (
    <TicketPage>
      <SetupWizard
        state={state}
        runner={runner}
        cancel={
          // Leaving the page disconnects Bluetooth and stops waiting (useSetup cleanup).
          <Button asChild variant="link">
            <Link to="/">{COMMON.cancel}</Link>
          </Button>
        }
      />
    </TicketPage>
  );
}
