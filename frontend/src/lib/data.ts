import { devicesApi } from "@/lib/devices.ts";
import { supabase } from "@/lib/supabase.ts";

/** The app's Supabase-backed devices API. */
export const devices = devicesApi(supabase);
