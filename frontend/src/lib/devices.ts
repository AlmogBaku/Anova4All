// Devices, members and invites through Supabase (RLS + RPCs). Invite tokens
// are never logged or stored; they only travel in the URL fragment.
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/env.ts";

export const NAME_MAX = 40;

export interface Device {
  id: string;
  name: string;
  isOwner: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface Member {
  userId: string;
  email: string;
  isOwner: boolean;
}

export interface Invite {
  id: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

export type DataErrorCode =
  | "not_browser_session"
  | "not_owner"
  | "not_member"
  | "invite_invalid"
  | "invite_expired"
  | "invite_used"
  | "invalid_name"
  | "not_found"
  | "unknown";

export class DataError extends Error {
  constructor(
    readonly code: DataErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DataError";
  }
}

const MESSAGES: Record<DataErrorCode, string> = {
  not_browser_session:
    "This action is only allowed from the Anova4All web app.",
  not_owner: "Only the cooker's owner can do this.",
  not_member: "You no longer have access to this cooker.",
  invite_invalid: "This invite link isn't valid. Ask for a new one.",
  invite_expired: "This invite link has expired. Ask for a new one.",
  invite_used: "This invite link was already used. Ask for a new one.",
  invalid_name: "Use 1–40 characters, without control characters.",
  not_found: "Cooker not found, or you don't have access to it.",
  unknown: "Something went wrong. Try again.",
};

/** RPCs raise their code as the message (supabase/migrations). */
export function dataErrorFrom(
  e: PostgrestError | Error | null | undefined,
): DataError {
  const message = e?.message ?? "";
  const code = (Object.keys(MESSAGES) as DataErrorCode[]).find(
    (c) => message === c,
  );
  if (code) return new DataError(code, MESSAGES[code]);
  if (e && "code" in e && e.code === "23514")
    return new DataError("invalid_name", MESSAGES.invalid_name);
  return new DataError("unknown", MESSAGES.unknown);
}

export function dataErrorText(e: unknown): string {
  return e instanceof DataError ? e.message : MESSAGES.unknown;
}

/** Same rule as the devices_name_check constraint. Returns an error message or null. */
export function validateDeviceName(name: string): string | null {
  const trimmed = name.trim();
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f]/.test(name))
    return "The name can't contain control characters.";
  if (trimmed.length === 0) return "Enter a name.";
  if ([...trimmed].length > NAME_MAX)
    return `Use at most ${NAME_MAX} characters.`;
  return null;
}

/** `<origin><base>/invite#token=…`: the token stays in the fragment, so it never reaches a server. */
export function inviteLink(token: string): string {
  return appUrl(`/invite#token=${encodeURIComponent(token)}`);
}

/** Reads the invite token from a location hash like "#token=…". */
export function inviteTokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  return token && /^[A-Za-z0-9_-]{20,128}$/.test(token) ? token : null;
}

const DEVICE_COLUMNS = "id, name, owner_id, last_seen_at, created_at";

interface DeviceRow {
  id: string;
  name: string;
  owner_id: string;
  last_seen_at: string | null;
  created_at: string;
}

const toDevice = (r: DeviceRow, userId: string): Device => ({
  id: r.id,
  name: r.name,
  isOwner: r.owner_id === userId,
  lastSeenAt: r.last_seen_at,
  createdAt: r.created_at,
});

export function devicesApi(db: SupabaseClient) {
  async function uid(): Promise<string> {
    const { data } = await db.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new DataError("unknown", "You're not logged in.");
    return id;
  }

  return {
    async list(): Promise<Device[]> {
      const userId = await uid();
      const { data, error } = await db
        .from("devices")
        .select(DEVICE_COLUMNS)
        .order("created_at", { ascending: true });
      if (error) throw dataErrorFrom(error);
      return (data as DeviceRow[]).map((r) => toDevice(r, userId));
    },

    async get(deviceId: string): Promise<Device> {
      const userId = await uid();
      const { data, error } = await db
        .from("devices")
        .select(DEVICE_COLUMNS)
        .eq("id", deviceId)
        .maybeSingle();
      if (error) throw dataErrorFrom(error);
      if (!data) throw new DataError("not_found", MESSAGES.not_found);
      return toDevice(data as DeviceRow, userId);
    },

    /** Owner only (RLS). */
    async rename(deviceId: string, name: string): Promise<void> {
      if (validateDeviceName(name))
        throw new DataError("invalid_name", MESSAGES.invalid_name);
      const { data, error } = await db
        .from("devices")
        .update({ name: name.trim() })
        .eq("id", deviceId)
        .select("id");
      if (error) throw dataErrorFrom(error);
      // RLS filters non-owners out silently: no row updated.
      if (!data || data.length === 0)
        throw new DataError("not_owner", MESSAGES.not_owner);
    },

    async members(deviceId: string): Promise<Member[]> {
      const { data, error } = await db.rpc("list_device_members", {
        p_device_id: deviceId,
      });
      if (error) throw dataErrorFrom(error);
      return (
        data as { user_id: string; email: string; is_owner: boolean }[]
      ).map((m) => ({
        userId: m.user_id,
        email: m.email,
        isOwner: m.is_owner,
      }));
    },

    /** The owner removes anyone; a member removes themselves (leave). */
    async removeMember(deviceId: string, userId: string): Promise<void> {
      const { data, error } = await db
        .from("device_members")
        .delete()
        .eq("device_id", deviceId)
        .eq("user_id", userId)
        .select("user_id");
      if (error) throw dataErrorFrom(error);
      if (!data || data.length === 0)
        throw new DataError("not_owner", MESSAGES.not_owner);
    },

    async leave(deviceId: string): Promise<void> {
      await this.removeMember(deviceId, await uid());
    },

    /** Owner only. Returns the shareable link; the raw token is not kept anywhere. */
    async createInvite(deviceId: string): Promise<string> {
      const { data, error } = await db.rpc("create_device_invite", {
        p_device_id: deviceId,
      });
      if (error) throw dataErrorFrom(error);
      return inviteLink(data as string);
    },

    /** Owner only (RLS): open and past invites. */
    async invites(deviceId: string): Promise<Invite[]> {
      const { data, error } = await db
        .from("device_invites")
        .select("id, created_at, expires_at, accepted_at")
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false });
      if (error) throw dataErrorFrom(error);
      return (
        data as {
          id: string;
          created_at: string;
          expires_at: string;
          accepted_at: string | null;
        }[]
      ).map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        acceptedAt: r.accepted_at,
      }));
    },

    async revokeInvite(inviteId: string): Promise<void> {
      const { error } = await db
        .from("device_invites")
        .delete()
        .eq("id", inviteId);
      if (error) throw dataErrorFrom(error);
    },

    /** Returns the device id. */
    async acceptInvite(token: string): Promise<string> {
      const { data, error } = await db.rpc("accept_device_invite", {
        p_token: token,
      });
      if (error) throw dataErrorFrom(error);
      return data as string;
    },

    /** Owner only: removes the device, its members, invites and cooks. */
    async unpair(deviceId: string): Promise<void> {
      const { error } = await db.rpc("unpair_device", {
        p_device_id: deviceId,
      });
      if (error) throw dataErrorFrom(error);
    },
  };
}

export type DevicesApi = ReturnType<typeof devicesApi>;
