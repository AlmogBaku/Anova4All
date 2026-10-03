export type BleErrorCode =
  | "unsupported"
  | "insecure_context"
  | "cancelled"
  | "not_found"
  | "permission"
  | "gatt"
  | "timeout"
  | "disconnected"
  | "invalid_input";

export class BleError extends Error {
  readonly code: BleErrorCode;

  constructor(
    code: BleErrorCode,
    message?: string,
    options?: { cause?: unknown },
  ) {
    super(message ?? code);
    this.name = "BleError";
    this.code = code;
    if (options && "cause" in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

function secureContext(): boolean {
  return (
    typeof globalThis.isSecureContext === "undefined" ||
    globalThis.isSecureContext
  );
}

function bluetoothAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!(navigator as Navigator & { bluetooth?: unknown }).bluetooth
  );
}

/** Maps anything thrown by Web Bluetooth (DOMExceptions etc.) to a typed BleError. */
export function bleErrorFrom(e: unknown): BleError {
  if (e instanceof BleError) return e;

  const name =
    typeof e === "object" && e !== null && "name" in e
      ? String((e as { name: unknown }).name)
      : "";
  const message =
    typeof e === "object" && e !== null && "message" in e
      ? String((e as { message: unknown }).message)
      : String(e);
  const opts = { cause: e };

  switch (name) {
    case "NotFoundError":
      if (/adapter/i.test(message))
        return new BleError("unsupported", message, opts);
      if (/service|characteristic/i.test(message))
        return new BleError("not_found", message, opts);
      // Chrome: "User cancelled the requestDevice() chooser."
      return new BleError("cancelled", message, opts);
    case "SecurityError":
      return new BleError(
        secureContext() ? "permission" : "insecure_context",
        message,
        opts,
      );
    case "NotAllowedError":
      return new BleError("permission", message, opts);
    case "NetworkError":
    case "InvalidStateError":
    case "NotSupportedError":
    case "OperationError":
      return new BleError("gatt", message, opts);
    case "TimeoutError":
      return new BleError("timeout", message, opts);
    case "AbortError":
      return new BleError("disconnected", message, opts);
    case "TypeError":
      if (!bluetoothAvailable())
        return new BleError("unsupported", message, opts);
      break;
  }
  return new BleError("gatt", message, opts);
}

export interface BleGuidance {
  title: string;
  fix: string;
}

const GUIDANCE: Record<BleErrorCode, BleGuidance> = {
  unsupported: {
    title: "This browser can't use Bluetooth",
    fix: "Open this page in Chrome on Android or on a computer, with Bluetooth turned on. iPhone and iPad are not supported.",
  },
  insecure_context: {
    title: "Bluetooth needs a secure page",
    fix: "Open the site over https (the address must start with https://), then try again.",
  },
  cancelled: {
    title: "No cooker was picked",
    fix: 'Try again and pick the cooker named "Anova" from the list. If it is not listed, unplug the cooker for 10 seconds, plug it back in and move closer.',
  },
  not_found: {
    title: "That device isn't an Anova Wi-Fi cooker",
    fix: 'Try again and pick the cooker named "Anova". Only the Anova 900W Wi-Fi cooker is supported.',
  },
  permission: {
    title: "Bluetooth permission was blocked",
    fix: "Allow Bluetooth for this site in your browser settings (and Nearby devices on Android), then try again.",
  },
  gatt: {
    title: "Couldn't talk to the cooker",
    fix: "Close the Anova phone app or turn off your phone's Bluetooth: the cooker allows one Bluetooth connection at a time. Move closer and try again.",
  },
  timeout: {
    title: "The cooker didn't answer",
    fix: "Unplug the cooker for 10 seconds, plug it back in, then try again.",
  },
  disconnected: {
    title: "The Bluetooth connection dropped",
    fix: "Make sure the Anova phone app is not connected (the cooker allows one Bluetooth connection at a time), move closer and try again.",
  },
  invalid_input: {
    title: "The cooker can't use that value",
    fix: "The Wi-Fi name and password must not contain spaces or special characters. The password is required.",
  },
};

export function bleGuidance(code: BleErrorCode): BleGuidance {
  return GUIDANCE[code];
}
