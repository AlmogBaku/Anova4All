import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api/index.ts";
import { DeviceStream, type StreamSnapshot } from "@/lib/api/device-stream.ts";

/** Live status of one cooker over SSE; stops (aborts) on unmount. */
export function useDeviceStream(deviceId: string): StreamSnapshot {
  const [stream] = useState(() => new DeviceStream(api, deviceId));
  useEffect(() => {
    stream.start();
    return () => stream.stop();
  }, [stream]);
  return useSyncExternalStore(stream.subscribe, stream.getSnapshot);
}
