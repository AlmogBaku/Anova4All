import { Link, useParams } from "react-router";
import { CookScreen } from "@/components/cook/cook-screen.tsx";
import {
  Ticket,
  TicketHead,
  TicketPage,
  TicketSection,
} from "@/components/ticket.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useCook } from "@/hooks/use-cook.ts";
import { useDeviceStream } from "@/hooks/use-device-stream.ts";
import { linkView } from "@/lib/api/device-stream.ts";

function NoAccess({ title, children }: { title: string; children: string }) {
  return (
    <TicketPage width="sm">
      <Ticket>
        <TicketHead titleAs="h1" title={title} tone="offline" />
        <TicketSection perforated={false} className="grid gap-5">
          <p role="alert">{children}</p>
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

function DeviceView({ deviceId }: { deviceId: string }) {
  const stream = useDeviceStream(deviceId);
  const { view, controller } = useCook(deviceId, stream.status);
  const link = linkView(stream);

  if (link === "access_lost") {
    return (
      <NoAccess title="Access lost">
        You no longer have access to this cooker. The owner may have removed you
        or unpaired it.
      </NoAccess>
    );
  }
  if (link === "no_access") {
    return (
      <NoAccess title="No access">
        This cooker doesn't exist, or you don't have access to it. Ask its owner
        for an invite.
      </NoAccess>
    );
  }

  return (
    <TicketPage>
      <CookScreen
        name={stream.status?.name ?? "Cooker"}
        settingsHref={`/devices/${deviceId}/settings`}
        view={view}
        controller={controller}
        link={link}
        retryInMs={stream.retryInMs}
      />
    </TicketPage>
  );
}

export function DevicePage() {
  const { deviceId = "" } = useParams();
  // key: a new stream and controller per device.
  return <DeviceView key={deviceId} deviceId={deviceId} />;
}
