export type ApiErrorCode =
  | "invalid_input"
  | "unauthorized"
  | "not_member"
  | "owner_only"
  | "not_found"
  | "device_offline"
  | "key_mismatch"
  | "cook_in_progress"
  | "no_active_cook"
  | "rate_limited"
  | "internal"
  /** Client side: the request never got an HTTP response. */
  | "network"
  /** Client side: a response the contract doesn't describe. */
  | "unknown";

const KNOWN = new Set<string>([
  "invalid_input",
  "unauthorized",
  "not_member",
  "owner_only",
  "not_found",
  "device_offline",
  "key_mismatch",
  "cook_in_progress",
  "no_active_cook",
  "rate_limited",
  "internal",
]);

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message?: string) {
    super(message || code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function isApiError(e: unknown, code?: ApiErrorCode): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}

/** Builds an ApiError from a non-2xx response with `{"error":{"code","message"}}`. */
export async function apiErrorFrom(res: Response): Promise<ApiError> {
  let code: ApiErrorCode = res.status === 401 ? "unauthorized" : "unknown";
  let message = "";
  try {
    const body = (await res.json()) as {
      error?: { code?: unknown; message?: unknown };
    };
    if (typeof body?.error?.code === "string" && KNOWN.has(body.error.code)) {
      code = body.error.code as ApiErrorCode;
    }
    if (typeof body?.error?.message === "string") message = body.error.message;
  } catch {
    // Not JSON; keep the status-based code.
  }
  return new ApiError(
    res.status,
    code,
    message || `Request failed (${res.status})`,
  );
}

/** Short, user-facing text for an API error. */
export function apiErrorText(e: unknown): string {
  if (!(e instanceof ApiError)) return "Something went wrong. Try again.";
  switch (e.code) {
    case "device_offline":
      return "The cooker is offline. Check that it's plugged in and on Wi-Fi.";
    case "not_member":
      return "You no longer have access to this cooker.";
    case "owner_only":
      return "Only the cooker's owner can do this.";
    case "cook_in_progress":
      return "The cooker is already heating. Your changes now apply right away.";
    case "no_active_cook":
      return "The cooker isn't heating any more. Press Start to begin a cook.";
    case "rate_limited":
      return "Too many requests. Wait a moment and try again.";
    case "unauthorized":
      return "Your session ended. Log in again.";
    case "network":
      return "Can't reach the server. Check your connection.";
    case "invalid_input":
      return e.message;
    default:
      return "The server had a problem. Try again.";
  }
}
