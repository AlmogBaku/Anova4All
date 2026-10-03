import { describe, expect, it } from "vitest";
import {
  initialState,
  reducer,
  type SetupAction,
  type SetupState,
} from "./machine.ts";

const problem = { code: "timeout", title: "t", fix: "f" };
const run = (actions: SetupAction[], from: SetupState = initialState) =>
  actions.reduce(reducer, from);

describe("setup reducer", () => {
  it("goes preflight → prepare → find", () => {
    const s = run([
      { type: "preflight_checked", problems: [] },
      { type: "prepared" },
    ]);
    expect(s).toMatchObject({ step: "find", phase: "ready" });
  });

  it("stays on preflight with every problem listed", () => {
    const s = run([
      { type: "preflight_checked", problems: [problem, problem] },
    ]);
    expect(s).toMatchObject({
      step: "preflight",
      phase: "failed",
      resume: "preflight",
    });
    expect(s.problems).toHaveLength(2);
  });

  it("a failure records the step to resume and clears on the next start", () => {
    let s = run([
      { type: "started", step: "server" },
      { type: "failed", step: "server", problem },
    ]);
    expect(s).toMatchObject({
      step: "server",
      phase: "failed",
      resume: "server",
      problems: [problem],
    });
    s = reducer(s, { type: "started", step: "connect" });
    expect(s).toMatchObject({
      phase: "working",
      problems: [],
      resume: undefined,
    });
  });

  it("starting pair resets progress and the timeout flag", () => {
    const s = run([
      { type: "started", step: "pair" },
      { type: "pair_progress", progress: { elapsedMs: 4000, attempts: 3 } },
      { type: "pair_timeout", problem },
      { type: "started", step: "pair" },
    ]);
    expect(s).toMatchObject({
      pairTimedOut: false,
      pair: { attempts: 0, elapsedMs: 0 },
    });
  });

  it("paired → name → done keeps the chosen name", () => {
    const s = run([
      { type: "paired", device: { id: "d1", name: "Anova" } },
      { type: "named", name: "Kitchen" },
    ]);
    expect(s).toMatchObject({
      step: "done",
      device: { id: "d1", name: "Kitchen" },
    });
    expect(
      reducer({ ...s, step: "name" }, { type: "named" }).device?.name,
    ).toBe("Kitchen");
  });

  it("restart clears the cooker but goes back to find, not preflight", () => {
    const s = run([
      { type: "connected", idCard: "f00000000000000000000000" },
      { type: "paired", device: { id: "d1", name: "Anova" } },
      { type: "restart" },
    ]);
    expect(s).toMatchObject({
      step: "find",
      phase: "ready",
      idCard: undefined,
      device: undefined,
    });
  });
});
