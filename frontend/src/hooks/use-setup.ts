import { useEffect, useState, useSyncExternalStore } from "react";
import { SetupRunner, type PreflightEnv } from "@/components/setup/runner.ts";
import { api } from "@/lib/api/index.ts";
import { BleClient } from "@/lib/client/ble/index.ts";
import { devicesApi } from "@/lib/devices.ts";
import { supabase } from "@/lib/supabase.ts";

async function environment(): Promise<PreflightEnv> {
  const bluetooth = (navigator as Navigator & { bluetooth?: Bluetooth })
    .bluetooth;
  let adapterAvailable: boolean | undefined;
  try {
    adapterAvailable = bluetooth
      ? await bluetooth.getAvailability()
      : undefined;
  } catch {
    adapterAvailable = undefined;
  }
  const { data } = await supabase.auth.getSession();
  return {
    secureContext: window.isSecureContext,
    bluetooth: !!bluetooth,
    adapterAvailable,
    signedIn: !!data.session,
  };
}

/** The setup wizard runner; disconnects Bluetooth and stops polling on unmount. */
export function useSetup() {
  const [runner] = useState(
    () =>
      new SetupRunner({
        environment,
        requestDevice: () => BleClient.requestDevice(),
        createLink: (device) => new BleClient(device),
        serverInfo: () => api.serverInfo(),
        pair: (idCard, key, signal) => api.pair(idCard, key, signal),
        rename: (id, name) => devicesApi(supabase).rename(id, name),
      }),
  );
  useEffect(() => {
    const detach = runner.attach();
    void runner.preflight();
    return detach;
  }, [runner]);
  const state = useSyncExternalStore(runner.subscribe, runner.getSnapshot);
  return { state, runner };
}
