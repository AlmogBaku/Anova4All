import { useEffect } from "react";
import { XIcon } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { DONE_TOAST, COMMON } from "@/components/setup/copy.ts";
import { SetupWizard } from "@/components/setup/setup-wizard.tsx";
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
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
      <SetupWizard
        state={state}
        runner={runner}
        cancel={
          // Leaving the page disconnects Bluetooth and stops waiting (useSetup cleanup).
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="bg-ink/5 text-ink-soft hover:bg-ink/10 hover:text-ink md:bg-transparent"
          >
            <Link to="/" aria-label={COMMON.cancel}>
              <XIcon className="size-5" />
            </Link>
          </Button>
        }
      />
    </div>
  );
}
