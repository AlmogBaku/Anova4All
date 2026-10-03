import { describe, expect, it } from "vitest";
import {
  applyResult,
  AUTO_STOP_NOTICE_MS,
  deriveView,
  emptyData,
  type CardData,
  type DeviceStatus,
} from "./state.ts";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

function device(over: Partial<DeviceStatus> = {}): DeviceStatus {
  return {
    id: ID,
    name: "Kitchen",
    is_owner: true,
    online: true,
    last_seen_at: "2026-10-01T11:59:58Z",
    state: {
      status: "stopped",
      current_temperature: 21.5,
      target_temperature: 57,
      timer_running: false,
      timer_value: 0,
      unit: "c",
      speaker_status: false,
    },
    ...over,
  };
}

function data(over: Partial<CardData>): CardData {
  return { ...emptyData(), ...over };
}

describe("deriveView", () => {
  it("is loading before any result", () => {
    expect(deriveView(emptyData(), NOW)).toEqual({ kind: "loading" });
  });

  it("shows an online idle cooker", () => {
    const v = deriveView(
      applyResult(emptyData(), { devices: [device()] }),
      NOW,
    );
    expect(v).toMatchObject({
      kind: "idle",
      water: 21.5,
      target: 57,
      unit: "c",
      alert: null,
      notice: null,
    });
  });

  it("flags statuses that need attention while idle", () => {
    const d = device();
    d.state!.status = "low water";
    expect(deriveView(data({ devices: [d], deviceId: ID }), NOW)).toMatchObject(
      { kind: "idle", alert: "Low water. Add water to the pot." },
    );
  });

  it("shows heating with timer and stops-at", () => {
    const d = device({
      cook: {
        id: "c1",
        started_at: "2026-10-01T11:00:00Z",
        auto_stop: true,
        stops_at: "2026-10-01T13:30:00Z",
      },
    });
    Object.assign(d.state!, {
      status: "running",
      current_temperature: 56.4,
      timer_running: true,
      timer_value: 90,
    });
    expect(deriveView(data({ devices: [d], deviceId: ID }), NOW)).toEqual({
      kind: "heating",
      device: d,
      water: 56.4,
      target: 57,
      unit: "c",
      timerRunning: true,
      timerMinutes: 90,
      timerWaiting: false,
      autoStop: true,
      stopsAt: "2026-10-01T13:30:00Z",
      notice: null,
    });
  });

  it("heating without auto-stop has no stops-at", () => {
    const d = device({
      cook: { id: "c1", started_at: "2026-10-01T11:00:00Z", auto_stop: false },
    });
    d.state!.status = "running";
    expect(deriveView(data({ devices: [d], deviceId: ID }), NOW)).toMatchObject(
      {
        kind: "heating",
        autoStop: false,
        stopsAt: null,
        timerMinutes: 0,
        timerWaiting: false,
      },
    );
  });

  it("shows timer_waiting during preheat with a set timer", () => {
    const d = device({
      cook: {
        id: "c1",
        started_at: "2026-10-01T11:00:00Z",
        auto_stop: true,
        timer_waiting: true,
      },
    });
    Object.assign(d.state!, {
      status: "running",
      current_temperature: 45,
      timer_running: false,
      timer_value: 60,
    });
    expect(deriveView(data({ devices: [d], deviceId: ID }), NOW)).toMatchObject(
      {
        kind: "heating",
        timerRunning: false,
        timerMinutes: 60,
        timerWaiting: true,
        autoStop: true,
        stopsAt: null,
      },
    );
  });

  const autoStopped = (endedAt: string) =>
    device({
      cook: {
        id: "c1",
        started_at: "2026-10-01T10:00:00Z",
        auto_stop: true,
        ended_at: endedAt,
        end_reason: "auto_stop",
        alarm: true,
      },
    });

  it("shows auto-stopped after a recent auto-stop", () => {
    const d = autoStopped("2026-10-01T11:50:00Z");
    expect(deriveView(data({ devices: [d], deviceId: ID }), NOW)).toMatchObject(
      { kind: "auto_stopped", endedAt: "2026-10-01T11:50:00Z" },
    );
  });

  it("goes back to idle once silenced or long after the auto-stop", () => {
    const d = autoStopped("2026-10-01T11:50:00Z");
    const silenced = data({
      devices: [d],
      deviceId: ID,
      silenced: new Set(["c1"]),
    });
    expect(deriveView(silenced, NOW).kind).toBe("idle");
    const old = autoStopped(
      new Date(NOW - AUTO_STOP_NOTICE_MS - 1).toISOString(),
    );
    expect(deriveView(data({ devices: [old], deviceId: ID }), NOW).kind).toBe(
      "idle",
    );
  });

  it("is idle once the server says the alarm was silenced (elsewhere too)", () => {
    const d = autoStopped("2026-10-01T11:50:00Z");
    delete d.cook!.alarm;
    expect(deriveView(data({ devices: [d], deviceId: ID }), NOW).kind).toBe(
      "idle",
    );
  });

  it("a cook stopped by the user is plain idle", () => {
    const d = autoStopped("2026-10-01T11:50:00Z");
    d.cook!.end_reason = "stopped";
    expect(deriveView(data({ devices: [d], deviceId: ID }), NOW).kind).toBe(
      "idle",
    );
  });

  it("shows offline with the last seen time", () => {
    const d = device({
      online: false,
      state: undefined,
      last_seen_at: "2026-09-30T08:00:00Z",
    });
    expect(deriveView(data({ devices: [d], deviceId: ID }), NOW)).toEqual({
      kind: "offline",
      device: d,
      lastSeenAt: "2026-09-30T08:00:00Z",
    });
  });

  it("shows the error message when there is no cooker to show", () => {
    const v = deriveView(
      applyResult(emptyData(), {
        error: {
          code: "not_member",
          message: "That cooker isn't shared with you.",
        },
      }),
      NOW,
    );
    expect(v).toEqual({
      kind: "error",
      message: "That cooker isn't shared with you.",
    });
  });

  it("keeps the cooker and shows an action error as a notice", () => {
    let d = applyResult(emptyData(), { devices: [device()] });
    d = applyResult(d, {
      error: { code: "device_offline", message: "The cooker is offline." },
    });
    expect(deriveView(d, NOW)).toMatchObject({
      kind: "idle",
      notice: "The cooker is offline.",
    });
  });

  it("does not show rate_limited as a notice", () => {
    let d = applyResult(emptyData(), { devices: [device()] });
    d = applyResult(d, {
      error: {
        code: "rate_limited",
        message: "Too many requests.",
        retry_after_seconds: 3,
      },
    });
    expect(deriveView(d, NOW)).toMatchObject({ kind: "idle", notice: null });
  });

  it("lists the cookers for device_required, then shows the picked one", () => {
    const two = [device(), device({ id: ID2, name: "Garage" })];
    const d = applyResult(emptyData(), {
      devices: two,
      error: {
        code: "device_required",
        message: "You have 2 cookers; pass device_id.",
      },
    });
    expect(deriveView(d, NOW)).toMatchObject({
      kind: "device_required",
      devices: two,
    });
    const picked = deriveView({ ...d, deviceId: ID2, error: null }, NOW);
    expect(picked).toMatchObject({ kind: "idle", device: { name: "Garage" } });
  });

  it("asks to pick when anova_status listed several cookers", () => {
    const two = [device(), device({ id: ID2, name: "Garage" })];
    expect(
      deriveView(applyResult(emptyData(), { devices: two }), NOW).kind,
    ).toBe("device_required");
  });

  it("shows no_cookers for the error and for an empty list", () => {
    const msg =
      "You have no cookers yet. Pair one in the Anova4All web app first.";
    expect(
      deriveView(
        applyResult(emptyData(), {
          error: { code: "no_cookers", message: msg },
        }),
        NOW,
      ),
    ).toEqual({ kind: "no_cookers", message: msg });
    expect(
      deriveView(applyResult(emptyData(), { devices: [] }), NOW).kind,
    ).toBe("no_cookers");
  });
});

describe("applyResult", () => {
  it("adopts the only device's id", () => {
    expect(applyResult(emptyData(), { devices: [device()] }).deviceId).toBe(ID);
  });

  it("merges a single-device result into a longer list", () => {
    const two = [device(), device({ id: ID2, name: "Garage" })];
    const d = applyResult({ ...emptyData(), deviceId: ID2 }, { devices: two });
    const next = applyResult(d, {
      devices: [device({ id: ID2, name: "Shed" })],
    });
    expect(next.devices?.map((x) => x.name)).toEqual(["Kitchen", "Shed"]);
    expect(next.error).toBeNull();
  });
});
