import { describe, expect, it } from "vitest";
import {
  ARC_START,
  dragFraction,
  ARC_SWEEP,
  fractionAt,
  heatState,
  inGap,
  keyValue,
  pressAction,
  pointAt,
  readingIn,
  snap,
  stepFor,
  valueAt,
} from "./dial.ts";

// Screen-space vector from the dial centre at a given angle (deg, clockwise from +x, y down).
const vec = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r)] as const;
};

describe("dial geometry", () => {
  it("is a 270° ring open at the bottom: lo at bottom-left, hi at bottom-right", () => {
    expect(ARC_START).toBe(135);
    expect(ARC_SWEEP).toBe(270);
    const [x0, y0] = pointAt(0, 100, 100, 88);
    expect(x0).toBeLessThan(100);
    expect(y0).toBeGreaterThan(100);
    const [x1, y1] = pointAt(1, 100, 100, 88);
    expect(x1).toBeGreaterThan(100);
    expect(y1).toBeGreaterThan(100);
    const [xm, ym] = pointAt(0.5, 100, 100, 88);
    expect(xm).toBeCloseTo(100);
    expect(ym).toBeCloseTo(12);
  });

  it("maps a pointer angle to its fraction along the ring", () => {
    expect(fractionAt(...vec(135))).toBeCloseTo(0);
    expect(fractionAt(...vec(180))).toBeCloseTo(1 / 6);
    expect(fractionAt(...vec(270))).toBeCloseTo(0.5);
    expect(fractionAt(...vec(0))).toBeCloseTo(5 / 6);
    expect(fractionAt(...vec(45))).toBeCloseTo(1);
  });

  it("clamps the bottom gap to the nearest end of the ring", () => {
    expect(fractionAt(...vec(60))).toBe(1); // just past hi
    expect(fractionAt(...vec(89))).toBe(1);
    expect(fractionAt(...vec(91))).toBe(0);
    expect(fractionAt(...vec(120))).toBe(0); // just before lo
  });
});

describe("dial drag", () => {
  it("follows the pointer around the ring", () => {
    expect(dragFraction(...vec(270), 0.4)).toBeCloseTo(0.5);
  });

  it("does not wrap across the bottom gap mid-drag: it pins to the end it was near", () => {
    // Dragging up past hi into the left half of the gap stays at hi.
    expect(dragFraction(...vec(100), 0.98)).toBe(1);
    // Dragging down past lo into the right half of the gap stays at lo.
    expect(dragFraction(...vec(80), 0.03)).toBe(0);
    // Without a drag history, the nearer end wins.
    expect(dragFraction(...vec(100), undefined)).toBe(0);
  });
});

describe("dial gap", () => {
  it("is the open bottom between the ring's two ends", () => {
    expect(inGap(...vec(90))).toBe(true); // straight down, under the unit switch
    expect(inGap(...vec(50))).toBe(true);
    expect(inGap(...vec(130))).toBe(true);
    expect(inGap(...vec(135))).toBe(false); // lo end
    expect(inGap(...vec(45))).toBe(false); // hi end
    expect(inGap(...vec(270))).toBe(false); // top
    expect(inGap(...vec(180))).toBe(false);
  });
});

describe("dial press", () => {
  const press = (over: Partial<Parameters<typeof pressAction>[0]> = {}) => {
    const [dx, dy] = vec(270);
    return pressAction({
      disabled: false,
      button: 0,
      onKnob: false,
      onControl: false,
      dx,
      dy,
      dist: 1,
      ...over,
    });
  };

  it("jumps the knob to a press on the ring", () => {
    expect(press()).toBe("jump");
  });

  it("ignores a tap in the bottom gap, so it never snaps to 25 °C or 100 °C", () => {
    for (const a of [60, 90, 120]) {
      const [dx, dy] = vec(a);
      expect(press({ dx, dy, dist: 0.8 })).toBe("ignore");
    }
  });

  it("still grabs the knob when it sits at an end, next to the gap", () => {
    const [dx, dy] = vec(100);
    expect(press({ dx, dy, onKnob: true })).toBe("grab");
  });

  it("ignores presses while disabled, even on the knob", () => {
    expect(press({ disabled: true })).toBe("ignore");
    expect(press({ disabled: true, onKnob: true })).toBe("ignore");
  });

  it("does not start a drag from the unit switch", () => {
    const [dx, dy] = vec(90);
    expect(press({ dx, dy, dist: 0.77, onControl: true })).toBe("ignore");
    expect(press({ onControl: true })).toBe("ignore");
  });

  it("ignores the numbers in the middle, far outside the ring and non-primary buttons", () => {
    expect(press({ dist: 0.5 })).toBe("ignore");
    expect(press({ dist: 1.4 })).toBe("ignore");
    expect(press({ button: 2 })).toBe("ignore");
  });
});

describe("dial values", () => {
  it("uses the stepper's steps: 0.5 °C, 1 °F", () => {
    expect(stepFor("c")).toBe(0.5);
    expect(stepFor("f")).toBe(1);
  });

  it("snaps to the step and clamps to the cooker's range", () => {
    expect(snap(57.24, "c")).toBe(57);
    expect(snap(57.26, "c")).toBe(57.5);
    expect(snap(140.4, "f")).toBe(140);
    expect(snap(10, "c")).toBe(25);
    expect(snap(150, "c")).toBe(100);
    expect(snap(300, "f")).toBe(211);
  });

  it("turns a ring fraction into a snapped temperature over TEMP_RANGE", () => {
    expect(valueAt(0, "c")).toBe(25);
    expect(valueAt(1, "c")).toBe(100);
    expect(valueAt(0.5, "c")).toBe(62.5);
    expect(valueAt(0.5, "f")).toBe(144);
    expect(valueAt(-0.2, "c")).toBe(25);
  });
});

describe("dial keyboard", () => {
  it("arrows move one step", () => {
    expect(keyValue("ArrowUp", 57, "c")).toBe(57.5);
    expect(keyValue("ArrowRight", 57, "c")).toBe(57.5);
    expect(keyValue("ArrowDown", 57, "c")).toBe(56.5);
    expect(keyValue("ArrowLeft", 140, "f")).toBe(139);
  });

  it("PageUp/PageDown move ten steps, Home/End jump to the range ends", () => {
    expect(keyValue("PageUp", 57, "c")).toBe(62);
    expect(keyValue("PageDown", 140, "f")).toBe(130);
    expect(keyValue("Home", 57, "c")).toBe(25);
    expect(keyValue("End", 57, "f")).toBe(211);
  });

  it("never leaves the range and ignores other keys", () => {
    expect(keyValue("ArrowUp", 100, "c")).toBe(100);
    expect(keyValue("PageDown", 26, "c")).toBe(25);
    expect(keyValue("a", 57, "c")).toBeNull();
  });
});

describe("dial heat state", () => {
  it("tells heating, at temperature and cooling apart", () => {
    expect(heatState(40, 57, "c")).toBe("heating");
    expect(heatState(56.8, 57, "c")).toBe("at");
    expect(heatState(70, 57, "c")).toBe("cooling");
    expect(heatState(undefined, 57, "c")).toBe("unknown");
  });
});

describe("readingIn", () => {
  it("shows the water in the dial's unit, to 0.1°, unclamped", () => {
    expect(readingIn(24, "c", "f")).toBe(75.2);
    expect(readingIn(75.2, "f", "c")).toBe(24);
    expect(readingIn(5, "c", "f")).toBe(41);
    expect(readingIn(56.5, "c", "c")).toBe(56.5);
  });
});
