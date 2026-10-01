import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors.ts";
import type { DeviceStatus, StartCook, UpdateCook } from "@/lib/api/types.ts";
import { status } from "@/test/fake-api.ts";
import {
  CookController,
  EDIT_DEBOUNCE_MS,
  toUnit,
  validate,
} from "./controller.ts";

const idle = () => status();
const heating = (
  over: Partial<NonNullable<DeviceStatus["state"]>> = {},
): DeviceStatus => {
  const s = status();
  return {
    ...s,
    state: { ...s.state!, status: "running", ...over },
    cook: {
      id: "cook-1",
      started_at: "2026-10-01T10:00:00Z",
      auto_stop: false,
    },
  };
};

function harness(initial: DeviceStatus | null) {
  const api = {
    start: vi.fn(async (b: StartCook) =>
      heating({ target_temperature: b.temperature, unit: b.unit }),
    ),
    update: vi.fn(async (b: UpdateCook) =>
      heating({
        ...(b.temperature !== undefined
          ? { target_temperature: b.temperature }
          : {}),
        ...(b.unit ? { unit: b.unit } : {}),
        ...(b.minutes !== undefined
          ? { timer_value: b.minutes, timer_running: b.minutes > 0 }
          : {}),
      }),
    ),
    stop: vi.fn(async () => idle()),
  };
  const c = new CookController(api);
  c.setStatus(initial);
  return { c, api };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("CookController while idle", () => {
  it("keeps edits as a local draft and sends nothing until Start", async () => {
    const { c, api } = harness(idle());
    c.editTemperature(60);
    c.editMinutes(90);
    c.editAutoStop(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.update).not.toHaveBeenCalled();
    expect(api.start).not.toHaveBeenCalled();
    expect(c.getSnapshot().values).toEqual({
      temperature: 60,
      unit: "c",
      minutes: 90,
      autoStop: true,
    });

    // A status update does not overwrite the draft.
    c.setStatus(status({ name: "Kitchen" }));
    expect(c.getSnapshot().values.temperature).toBe(60);

    await c.start();
    expect(api.start).toHaveBeenCalledTimes(1);
    expect(api.start).toHaveBeenCalledWith({
      temperature: 60,
      unit: "c",
      minutes: 90,
      auto_stop: true,
    });
    expect(c.getSnapshot().mode).toBe("heating");
  });

  it("Start without a timer sends only temperature and unit", async () => {
    const { c, api } = harness(idle());
    await c.start();
    expect(api.start).toHaveBeenCalledWith({ temperature: 57, unit: "c" });
  });

  it("refuses to start out of range or with auto-stop and no timer", async () => {
    const { c, api } = harness(idle());
    c.editTemperature(101);
    await c.start();
    expect(c.getSnapshot().invalid.temperature).toBeTruthy();
    c.editTemperature(60);
    c.editAutoStop(true);
    await c.start();
    expect(c.getSnapshot().invalid.autoStop).toBeTruthy();
    expect(api.start).not.toHaveBeenCalled();
  });

  it("shows cook_in_progress inline and drops the busy state", async () => {
    const { c, api } = harness(idle());
    api.start.mockRejectedValueOnce(
      new ApiError(409, "cook_in_progress", "already running"),
    );
    await c.start();
    expect(c.getSnapshot().busy).toBe(false);
    expect(c.getSnapshot().error).toMatch(/already heating/i);
  });

  it("is busy while Start is in flight", async () => {
    const { c, api } = harness(idle());
    let release!: (s: DeviceStatus) => void;
    api.start.mockImplementationOnce(() => new Promise((r) => (release = r)));
    const p = c.start();
    expect(c.getSnapshot().busy).toBe(true);
    await c.start(); // ignored while busy
    expect(api.start).toHaveBeenCalledTimes(1);
    release(heating());
    await p;
    expect(c.getSnapshot().busy).toBe(false);
  });
});

describe("CookController while heating", () => {
  it("PATCHes each edit after a 1 s debounce, merged, temperature with unit", async () => {
    const { c, api } = harness(heating());
    c.editTemperature(58);
    await vi.advanceTimersByTimeAsync(500);
    c.editTemperature(59);
    c.editMinutes(45);
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS - 1);
    expect(api.update).not.toHaveBeenCalled();
    expect(c.getSnapshot().saving).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith({
      temperature: 59,
      unit: "c",
      minutes: 45,
    });
    expect(c.getSnapshot().saving).toBe(false);
    expect(api.start).not.toHaveBeenCalled();
  });

  it("does not let stream updates overwrite edits waiting to be sent", async () => {
    const { c } = harness(heating());
    c.editTemperature(65);
    c.setStatus(heating({ current_temperature: 40 }));
    expect(c.getSnapshot().values.temperature).toBe(65);
    expect(c.getSnapshot().current).toBe(40);
  });

  it("keeps showing an in-flight edit until its response", async () => {
    const { c, api } = harness(heating());
    let release!: (s: DeviceStatus) => void;
    api.update.mockImplementationOnce(() => new Promise((r) => (release = r)));
    c.editTemperature(70);
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS);
    c.setStatus(heating()); // stale stream status, still 57
    expect(c.getSnapshot().values.temperature).toBe(70);
    release(heating({ target_temperature: 70 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.getSnapshot().values.temperature).toBe(70);
  });

  it("sends edits made during an in-flight PATCH afterwards", async () => {
    const { c, api } = harness(heating());
    let release!: (s: DeviceStatus) => void;
    api.update.mockImplementationOnce(() => new Promise((r) => (release = r)));
    c.editTemperature(60);
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS);
    c.editMinutes(30);
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS);
    expect(api.update).toHaveBeenCalledTimes(1);
    release(heating({ target_temperature: 60 }));
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS);
    expect(api.update).toHaveBeenCalledTimes(2);
    expect(api.update).toHaveBeenLastCalledWith({ minutes: 30 });
  });

  it("switching unit converts and sends temperature with unit", async () => {
    const { c, api } = harness(heating());
    c.editUnit("f");
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS);
    expect(api.update).toHaveBeenCalledWith({ temperature: 134.6, unit: "f" });
  });

  it("does not send an invalid edit", async () => {
    const { c, api } = harness(heating());
    c.editMinutes(6001);
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS * 3);
    expect(api.update).not.toHaveBeenCalled();
    expect(c.getSnapshot().invalid.minutes).toBeTruthy();
  });

  it("maps no_active_cook to an inline message", async () => {
    const { c, api } = harness(heating());
    api.update.mockRejectedValueOnce(new ApiError(409, "no_active_cook"));
    c.editTemperature(60);
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS);
    expect(c.getSnapshot().error).toMatch(/isn't heating/i);
  });

  it("Stop cancels pending edits", async () => {
    const { c, api } = harness(heating());
    c.editTemperature(60);
    await c.stop();
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS * 2);
    expect(api.update).not.toHaveBeenCalled();
    expect(api.stop).toHaveBeenCalledTimes(1);
    expect(c.getSnapshot().mode).toBe("idle");
  });

  it("shows stops_at while heating", () => {
    const s = heating({ timer_running: true, timer_value: 30 });
    s.cook = { ...s.cook!, auto_stop: true, stops_at: "2026-10-01T11:00:00Z" };
    const { c } = harness(s);
    expect(c.getSnapshot()).toMatchObject({
      stopsAt: "2026-10-01T11:00:00Z",
      values: { autoStop: true, minutes: 30 },
    });
  });
});

describe("auto-stop notice", () => {
  it('shows "stopped automatically" until silenced with Stop', async () => {
    vi.setSystemTime(new Date("2026-10-01T11:00:30Z"));
    const ended = status({
      cook: {
        id: "cook-1",
        started_at: "2026-10-01T10:00:00Z",
        auto_stop: true,
        ended_at: "2026-10-01T11:00:00Z",
        end_reason: "auto_stop",
      },
    });
    const { c, api } = harness(ended);
    expect(c.getSnapshot().autoStopped).toBe(true);
    api.stop.mockResolvedValueOnce(ended);
    await c.stop();
    expect(c.getSnapshot().autoStopped).toBe(false);
  });
});

describe("helpers", () => {
  it("converts units within range", () => {
    expect(toUnit(57, "c", "f")).toBe(134.6);
    expect(toUnit(134.6, "f", "c")).toBe(57);
    expect(toUnit(100, "c", "f")).toBe(211); // clamped to the cooker's maximum
  });

  it("validates ranges", () => {
    const ok = {
      temperature: 57,
      unit: "c" as const,
      minutes: 0,
      autoStop: false,
    };
    expect(validate(ok)).toEqual({});
    expect(validate({ ...ok, temperature: 24.9 }).temperature).toBeTruthy();
    expect(validate({ ...ok, unit: "f", temperature: 77 })).toEqual({});
    expect(
      validate({ ...ok, unit: "f", temperature: 212 }).temperature,
    ).toBeTruthy();
    expect(validate({ ...ok, minutes: 6000 })).toEqual({});
    expect(validate({ ...ok, minutes: -1 }).minutes).toBeTruthy();
  });
});
