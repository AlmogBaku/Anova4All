import { useEffect, useState, useSyncExternalStore } from "react";
import { CookController } from "@/components/cook/controller.ts";
import { api } from "@/lib/api/index.ts";
import type { DeviceStatus } from "@/lib/api/types.ts";

/** Cook screen state for one device, fed by the live status. */
export function useCook(deviceId: string, status: DeviceStatus | null) {
  const [controller] = useState(
    () =>
      new CookController({
        start: (body) => api.startCook(deviceId, body),
        update: (body) => api.updateCook(deviceId, body),
        stop: () => api.stopCook(deviceId),
      }),
  );
  useEffect(() => controller.attach(), [controller]);
  useEffect(() => controller.setStatus(status), [controller, status]);
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  return { view, controller };
}
