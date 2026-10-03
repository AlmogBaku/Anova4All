import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DataError,
  dataErrorFrom,
  devicesApi,
  inviteLink,
  inviteTokenFromHash,
  validateDeviceName,
} from "./devices.ts";

const TOKEN = "dGVzdC1pbnZpdGUtdG9rZW4tMDAwMDAwMDAwMDAwMDA"; // synthetic, 43 chars

afterEach(() => vi.unstubAllGlobals());

describe("validateDeviceName", () => {
  it("accepts 1–40 characters", () => {
    expect(validateDeviceName("Kitchen")).toBeNull();
    expect(validateDeviceName("x".repeat(40))).toBeNull();
    expect(validateDeviceName("Küche 🍲")).toBeNull();
  });

  it("refuses empty, too long and control characters", () => {
    expect(validateDeviceName("")).toBeTruthy();
    expect(validateDeviceName("   ")).toBeTruthy();
    expect(validateDeviceName("x".repeat(41))).toBeTruthy();
    expect(validateDeviceName("Kit\nchen")).toBeTruthy();
    expect(validateDeviceName("Kit\u0007chen")).toBeTruthy();
    expect(validateDeviceName("Kit\u007fchen")).toBeTruthy();
  });

  it("rename refuses an invalid name without calling the database", async () => {
    const db = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(
      devicesApi(db).rename("d1", "x".repeat(41)),
    ).rejects.toBeInstanceOf(DataError);
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe("invite links", () => {
  it("puts the token in the fragment under the app base", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://app.example.test" },
    });
    const link = inviteLink(TOKEN);
    const url = new URL(link);
    expect(url.origin).toBe("https://app.example.test");
    expect(url.pathname.endsWith("/invite")).toBe(true);
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#token=${TOKEN}`);
  });

  it("reads the token back from the hash", () => {
    expect(inviteTokenFromHash(`#token=${TOKEN}`)).toBe(TOKEN);
    expect(inviteTokenFromHash("")).toBeNull();
    expect(inviteTokenFromHash("#token=")).toBeNull();
    expect(inviteTokenFromHash("#token=<script>")).toBeNull();
  });
});

describe("dataErrorFrom", () => {
  it("maps RPC codes", () => {
    for (const code of [
      "not_owner",
      "not_member",
      "invite_invalid",
      "invite_expired",
      "invite_used",
    ]) {
      const e = dataErrorFrom(new Error(code));
      expect(e.code).toBe(code);
      expect(e.message).not.toBe(code);
    }
    expect(dataErrorFrom(new Error("boom")).code).toBe("unknown");
  });
});
