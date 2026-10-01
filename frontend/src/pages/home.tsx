import { Link } from "react-router";
import { ErrorAlert, Loading } from "@/components/status.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useAuth } from "@/contexts/auth.tsx";
import { useAsync } from "@/hooks/use-async.ts";
import { api } from "@/lib/api/index.ts";
import type { DeviceStatus } from "@/lib/api/types.ts";
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

export function HomePage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(
    user?.id ?? null,
    loadDevices,
  );

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Your cookers</h1>
        {data && data.length > 0 && (
          <Button asChild variant="outline">
            <Link to="/setup">Set up a cooker</Link>
          </Button>
        )}
      </div>
      {loading && !data && <Loading />}
      {error !== undefined && (
        <ErrorAlert title="Couldn't load your cookers">
          {errorText(error)}{" "}
          <button className="underline" onClick={reload}>
            Try again
          </button>
        </ErrorAlert>
      )}
      {data && data.length === 0 && (
        <div className="grid justify-items-start gap-3 rounded-lg border p-6">
          <p>You don't have any cookers yet.</p>
          <Button asChild>
            <Link to="/setup">Set up a cooker</Link>
          </Button>
        </div>
      )}
      {data && data.length > 0 && (
        <ul className="grid gap-2">
          {data.map((d) => (
            <li key={d.id}>
              <Link
                to={`/devices/${d.id}`}
                className="flex items-center justify-between gap-4 rounded-lg border p-4 hover:bg-accent"
              >
                <span className="font-medium">{d.name}</span>
                <span className="flex gap-2">
                  {!d.isOwner && (
                    <Badge variant="outline">Shared with you</Badge>
                  )}
                  {d.status && (
                    <Badge variant={d.status.online ? "secondary" : "outline"}>
                      {d.status.online
                        ? d.status.state?.status === "running"
                          ? "Heating"
                          : "Online"
                        : "Offline"}
                    </Badge>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
