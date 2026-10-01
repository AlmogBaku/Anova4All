import { describe, expect, it } from "vitest";
import {
  describeMinutes,
  digitsToMinutes,
  formatDigits,
  minutesToDigits,
  normalizeDigits,
  timerLabel,
} from "./duration.ts";

describe("duration", () => {
  it("shows total minutes as HH:MM", () => {
    expect(minutesToDigits(180)).toBe("0300");
    expect(formatDigits(minutesToDigits(180))).toBe("03:00");
    expect(minutesToDigits(95)).toBe("0135");
    expect(minutesToDigits(0)).toBe("0000");
    expect(minutesToDigits(6000)).toBe("9959");
  });

  it("round-trips", () => {
    for (const m of [0, 1, 59, 60, 61, 180, 1439, 5999]) {
      expect(digitsToMinutes(minutesToDigits(m))).toBe(m);
    }
  });

  it("types digits in from the right", () => {
    expect(normalizeDigits("00:001")).toBe("0001");
    expect(normalizeDigits("00:0012")).toBe("0012");
    expect(digitsToMinutes("01:3")).toBe(13);
    expect(digitsToMinutes("0090")).toBe(90);
  });

  it("describes durations", () => {
    expect(describeMinutes(0)).toBe("Off");
    expect(describeMinutes(90)).toBe("1 h 30 min");
    expect(describeMinutes(45)).toBe("45 min");
  });
});

describe("timerLabel", () => {
  it('says "Timer" without "left" when no timer is set', () => {
    expect(timerLabel(true, 0)).toBe("Timer");
    expect(timerLabel(false, 90)).toBe("Timer");
    expect(timerLabel(true, 90)).toBe("Timer (1 h 30 min left)");
  });
});
