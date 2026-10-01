import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { DONE_TOAST, COMMON } from "@/components/setup/copy.ts";
import { SetupWizard } from "@/components/setup/setup-wizard.tsx";
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
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Set up a cooker</h1>
        {/* Leaving the page disconnects Bluetooth and stops waiting (useSetup cleanup). */}
        <Link to="/" className="text-sm underline">
          {COMMON.cancel}
        </Link>
      </div>
      <SetupWizard state={state} runner={runner} />
    </div>
  );
}
