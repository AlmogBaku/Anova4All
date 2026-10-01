import { devicesApi } from "@/lib/devices.ts";
import { oauthApi } from "@/lib/oauth.ts";
import { supabase } from "@/lib/supabase.ts";

/** The app's Supabase-backed devices API. */
export const devices = devicesApi(supabase);

/** OAuth consent and connected apps. */
export const oauth = oauthApi(supabase);
