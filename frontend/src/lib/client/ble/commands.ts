import { BleError } from "./errors.ts";

// Command strings must match pkg/commands exactly.

/** Printable ASCII without space: 0x21..0x7E. */
const TOKEN = /^[\x21-\x7e]+$/;

function requireToken(
  field: string,
  value: string,
  min: number,
  max: number,
): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new BleError("invalid_input", `${field} is required`);
  }
  if (/\s/.test(value)) {
    throw new BleError("invalid_input", `${field} must not contain spaces`);
  }
  if (!TOKEN.test(value)) {
    throw new BleError(
      "invalid_input",
      `${field} must use plain letters, digits and symbols only`,
    );
  }
  if (value.length < min || value.length > max) {
    throw new BleError(
      "invalid_input",
      `${field} must be ${min}-${max} characters`,
    );
  }
}

export const GET_ID_CARD = "get id card";

/** Strips the "anova " prefix like pkg/commands GetIDCard.Decode. */
export function decodeIdCard(reply: string): string {
  const id = reply.trim();
  return id.startsWith("anova ") ? id.slice(6) : id;
}

export function setSecretKeyCommand(key: string): string {
  if (!/^[a-z0-9]{10}$/.test(key)) {
    throw new BleError(
      "invalid_input",
      "Secret key must be 10 lowercase letters or digits",
    );
  }
  return `set number ${key}`;
}

export function setServerInfoCommand(host: string, port: number): string {
  requireToken("Server address", host, 1, 253);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new BleError("invalid_input", "Server port must be 1-65535");
  }
  return `server para ${host} ${port}`;
}

export function setWifiCommand(ssid: string, password: string): string {
  requireToken("Wi-Fi name", ssid, 1, 32);
  requireToken("Wi-Fi password", password, 8, 63);
  return `wifi para 2 ${ssid} ${password} WPA2PSK AES`;
}
