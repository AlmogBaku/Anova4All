import { Link, useParams } from "react-router";
import { CookScreen } from "@/components/cook/cook-screen.tsx";
import { ErrorAlert } from "@/components/status.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useCook } from "@/hooks/use-cook.ts";
import { useDeviceStream } from "@/hooks/use-device-stream.ts";
import { linkView } from "@/lib/api/device-stream.ts";

function DeviceView({ deviceId }: { deviceId: string }) {
  const stream = useDeviceStream(deviceId);
  const { view, controller } = useCook(deviceId, stream.status);
  const link = linkView(stream);

  if (link === "access_lost") {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">Access lost</h1>
        <ErrorAlert>
          You no longer have access to this cooker. The owner may have removed
          you or unpaired it.
        </ErrorAlert>
        <Link to="/" className="underline">
          Go to your cookers
        </Link>
      </div>
    );
  }

  if (link === "no_access") {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">No access</h1>
        <ErrorAlert>
          This cooker doesn't exist, or you don't have access to it. Ask its
          owner for an invite.
        </ErrorAlert>
        <Link to="/" className="underline">
          Go to your cookers
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {stream.status?.name ?? "Cooker"}
        </h1>
        <Button asChild variant="outline" size="sm">
          <Link to={`/devices/${deviceId}/settings`}>Settings</Link>
        </Button>
      </div>
      <CookScreen
        view={view}
        controller={controller}
        link={link}
        retryInMs={stream.retryInMs}
      />
    </div>
  );
}

export function DevicePage() {
  const { deviceId = "" } = useParams();
  // key: a new stream and controller per device.
  return <DeviceView key={deviceId} deviceId={deviceId} />;
}
