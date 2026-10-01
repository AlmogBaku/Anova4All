import { describe, expect, it, vi } from "vitest";
import {
  describe as describeAction,
  runAction,
  statusCall,
  toolCall,
  type CardHost,
} from "./actions.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const KITCHEN = { id: ID, name: "Kitchen" };

describe("toolCall", () => {
  it("polls anova_status for the card's cooker", () => {
    expect(statusCall(ID)).toEqual({
      name: "anova_status",
      arguments: { device_id: ID },
    });
  });

  it("Stop and Silence call anova_stop_cook", () => {
    for (const type of ["stop", "silence"] as const) {
      expect(toolCall({ type }, ID)).toEqual({
        name: "anova_stop_cook",
        arguments: { device_id: ID },
      });
    }
  });

  it("Start calls anova_start_cook with timer and auto-stop", () => {
    expect(
      toolCall(
        {
          type: "start",
          temperature: 57,
          unit: "c",
          minutes: 90,
          autoStop: true,
        },
        ID,
      ),
    ).toEqual({
      name: "anova_start_cook",
      arguments: {
        device_id: ID,
        temperature: 57,
        unit: "c",
        minutes: 90,
        auto_stop: true,
      },
    });
  });

  it("Start without a timer sends no minutes or auto_stop", () => {
    expect(
      toolCall(
        { type: "start", temperature: 135, unit: "f", autoStop: true },
        ID,
      ),
    ).toEqual({
      name: "anova_start_cook",
      arguments: { device_id: ID, temperature: 135, unit: "f" },
    });
  });

  it("temperature edits call anova_update_cook with the unit", () => {
    expect(
      toolCall({ type: "update", temperature: 57.5, unit: "c" }, ID),
    ).toEqual({
      name: "anova_update_cook",
      arguments: { device_id: ID, temperature: 57.5, unit: "c" },
    });
  });

  it("timer edits call anova_update_cook with minutes and auto_stop", () => {
    expect(
      toolCall({ type: "update", minutes: 105, autoStop: true }, ID),
    ).toEqual({
      name: "anova_update_cook",
      arguments: { device_id: ID, minutes: 105, auto_stop: true },
    });
    // 0 clears the timer; auto_stop goes with it, so it is not sent.
    expect(
      toolCall({ type: "update", minutes: 0, autoStop: false }, ID),
    ).toEqual({
      name: "anova_update_cook",
      arguments: { device_id: ID, minutes: 0 },
    });
  });
});

describe("describe", () => {
  it("writes one plain sentence per action", () => {
    expect(describeAction({ type: "stop" }, "Kitchen")).toBe(
      'User stopped the cook on "Kitchen".',
    );
    expect(describeAction({ type: "silence" }, "Kitchen")).toBe(
      'User silenced the alarm on "Kitchen".',
    );
    expect(
      describeAction(
        {
          type: "start",
          temperature: 57,
          unit: "c",
          minutes: 90,
          autoStop: true,
        },
        "Kitchen",
      ),
    ).toBe(
      'User started a cook on "Kitchen" at 57 °C with a 1 h 30 min timer and auto-stop.',
    );
    expect(
      describeAction(
        { type: "update", temperature: 57.5, unit: "c", minutes: 0 },
        "Kitchen",
      ),
    ).toBe('User set the target to 57.5 °C, the timer off on "Kitchen".');
  });
});

function fakeHost(structuredContent: Record<string, unknown>, isError = false) {
  const host = {
    callServerTool: vi.fn(async () => ({ structuredContent, isError })),
    updateModelContext: vi.fn(async () => ({})),
  } satisfies CardHost;
  return host;
}

describe("runAction", () => {
  it("calls the tool, then tells the model what the user did", async () => {
    const host = fakeHost({ devices: [] });
    const res = await runAction(host, { type: "stop" }, KITCHEN);
    expect(host.callServerTool).toHaveBeenCalledWith({
      name: "anova_stop_cook",
      arguments: { device_id: ID },
    });
    expect(host.updateModelContext).toHaveBeenCalledWith({
      content: [{ type: "text", text: 'User stopped the cook on "Kitchen".' }],
    });
    expect(res).toEqual({ devices: [] });
    expect(host.callServerTool.mock.invocationCallOrder[0]).toBeLessThan(
      host.updateModelContext.mock.invocationCallOrder[0],
    );
  });

  it("reports a refused action to the model and returns the error", async () => {
    const error = { code: "device_offline", message: "The cooker is offline." };
    const host = fakeHost({ error }, true);
    const res = await runAction(host, { type: "update", minutes: 30 }, KITCHEN);
    expect(res.error).toEqual(error);
    expect(host.updateModelContext).toHaveBeenCalledWith({
      content: [
        {
          type: "text",
          text: 'User set the timer to 30 min on "Kitchen". It failed: The cooker is offline.',
        },
      ],
    });
  });

  it("survives a transport failure and a host without model context", async () => {
    const host: CardHost = {
      callServerTool: vi.fn(async () => {
        throw new Error("gone");
      }),
      updateModelContext: vi.fn(async () => {
        throw new Error("unsupported");
      }),
    };
    const res = await runAction(host, { type: "silence" }, KITCHEN);
    expect(res.error?.code).toBe("internal");
  });
});
