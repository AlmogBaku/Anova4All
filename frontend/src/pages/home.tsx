import { Link } from "react-router";
import { ErrorAlert, Loading } from "@/components/status.tsx";
import {
  Rail,
  Ticket,
  TicketHead,
  TicketSection,
} from "@/components/ticket.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useAuth } from "@/contexts/auth.tsx";
import { useAsync } from "@/hooks/use-async.ts";
import { api } from "@/lib/api/index.ts";
import { isHeating, type DeviceStatus } from "@/lib/api/types.ts";
import { devices } from "@/lib/data.ts";
import { errorText } from "@/lib/errors.ts";

/** Devices from Supabase (RLS), with online state from the Go API when it's reachable. */
async function loadDevices() {
  const [list, statuses] = await Promise.all([
    devices.list(),
    api.listDevices().catch(() => null),
  ]);
  const byId = new Map<string, DeviceStatus>(
    (statuses ?? []).map((s) => [s.id, s]),
  );
  return list.map((d) => ({ ...d, status: byId.get(d.id) }));
}

type Row = Awaited<ReturnType<typeof loadDevices>>[number];

function stateLabel(status: DeviceStatus | undefined) {
  if (!status) return undefined;
  if (!status.online) return "Offline";
  return isHeating(status) ? "Heating" : "Idle";
}

function CookerTicket({ d }: { d: Row }) {
  const s = d.status;
  const heating = isHeating(s);
  const state = s?.state;
  const unit = state ? `°${state.unit.toUpperCase()}` : "";
  return (
    <Link
      to={`/devices/${d.id}`}
      className="group block text-ink no-underline focus-visible:outline-offset-4"
    >
      <Ticket className="transition-transform duration-200 ease-out group-hover:translate-y-0.5">
        <TicketHead
          titleAs="h2"
          title={d.name}
          meta={stateLabel(s)}
          tone={heating ? "heat" : s && !s.online ? "offline" : "idle"}
        />
        <TicketSection perforated={false} className="grid gap-1 pb-4">
          {state ? (
            <>
              <p className="text-6xl leading-none font-extralight tracking-[-0.04em] tabular-nums">
                {state.current_temperature}
                <span className="ml-1 align-top text-3xl">{unit}</span>
                <span className="sr-only"> water temperature</span>
              </p>
              <p className="text-ink-soft tabular-nums">
                {heating
                  ? `Set ${state.target_temperature} ${unit}`
                  : "Not heating"}
              </p>
            </>
          ) : (
            <p className="py-4 text-ink-soft">
              {s ? "Not connected" : "Status unavailable"}
            </p>
          )}
          {!d.isOwner && (
            <p className="caps pt-1 text-[0.6875rem] text-ink-soft">
              Shared with you
            </p>
          )}
        </TicketSection>
      </Ticket>
    </Link>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(
    user?.id ?? null,
    loadDevices,
  );

  return (
    <div className="grid gap-5">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 px-1">
        <h1 className="text-3xl leading-tight font-medium tracking-[-0.03em]">
          Your cookers
        </h1>
        {data && data.length > 0 && (
          <Button asChild variant="outline">
            <Link to="/setup" className="no-underline">
              Set up a cooker
            </Link>
          </Button>
        )}
      </div>
      {loading && !data && <Loading />}
      {error !== undefined && (
        <ErrorAlert title="Couldn't load your cookers">
          {errorText(error)}{" "}
          <Button variant="link" onClick={reload}>
            Try again
          </Button>
        </ErrorAlert>
      )}
      <Rail>
        {data && data.length === 0 && (
          <Ticket className="mx-1.5 max-w-md sm:mx-auto">
            <TicketHead title="No cookers yet" />
            <TicketSection perforated={false} className="grid gap-4">
              <p className="leading-relaxed">
                Set up your Anova Precision Cooker Wi-Fi once, from a phone or
                computer next to it. It takes about five minutes over Bluetooth,
                and then you can control it from anywhere.
              </p>
              <p className="text-sm leading-relaxed text-ink-soft">
                Setup needs Chrome on Android or a computer. On an iPhone you
                can control a cooker someone else set up.
              </p>
            </TicketSection>
            <TicketSection className="pt-4">
              <Button asChild size="lg" className="w-full">
                <Link to="/setup" className="no-underline">
                  Set up a cooker
                </Link>
              </Button>
            </TicketSection>
          </Ticket>
        )}
        {data && data.length > 0 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-x-4 gap-y-6 px-1.5 sm:px-3">
            {data.map((d) => (
              <li key={d.id}>
                <CookerTicket d={d} />
              </li>
            ))}
          </ul>
        )}
      </Rail>
    </div>
  );
}
