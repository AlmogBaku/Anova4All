import { ApiError, apiErrorText } from "@/lib/api/errors.ts";
import { DataError } from "@/lib/devices.ts";

/** User-facing text for any error thrown by the app's data layers. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return apiErrorText(e);
  if (e instanceof DataError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong. Try again.";
}
