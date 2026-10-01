// User actions on the card, as MCP tool calls (internal/mcp/tools.go).
import {
  formatMinutes,
  formatTemp,
  type TemperatureUnit,
  type ToolResult,
} from "./state.ts";

export const TOOLS = {
  status: "anova_status",
  start: "anova_start_cook",
  update: "anova_update_cook",
  stop: "anova_stop_cook",
} as const;

export type Action =
  | { type: "stop" }
  | { type: "silence" }
  | {
      type: "start";
      temperature: number;
      unit: TemperatureUnit;
      minutes?: number;
      autoStop: boolean;
    }
  | {
      type: "update";
      temperature?: number;
      unit?: TemperatureUnit;
      minutes?: number;
      autoStop?: boolean;
    };

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** The subset of the ext-apps App the card uses (easy to fake in tests). */
export interface CardHost {
  callServerTool(params: ToolCall): Promise<{
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  }>;
  updateModelContext(params: {
    content: { type: "text"; text: string }[];
  }): Promise<unknown>;
}

export function statusCall(deviceId: string): ToolCall {
  return { name: TOOLS.status, arguments: { device_id: deviceId } };
}

export function toolCall(action: Action, deviceId: string): ToolCall {
  const device_id = deviceId;
  switch (action.type) {
    case "stop":
    case "silence":
      return { name: TOOLS.stop, arguments: { device_id } };
    case "start": {
      const args: Record<string, unknown> = {
        device_id,
        temperature: action.temperature,
        unit: action.unit,
      };
      if (action.minutes && action.minutes > 0) {
        args.minutes = action.minutes;
        if (action.autoStop) args.auto_stop = true;
      }
      return { name: TOOLS.start, arguments: args };
    }
    case "update": {
      const args: Record<string, unknown> = { device_id };
      if (action.temperature !== undefined) {
        args.temperature = action.temperature;
        args.unit = action.unit;
      }
      if (action.minutes !== undefined) args.minutes = action.minutes;
      // minutes 0 clears the timer and auto-stop with it.
      if (action.autoStop !== undefined && action.minutes !== 0) {
        args.auto_stop = action.autoStop;
      }
      return { name: TOOLS.update, arguments: args };
    }
  }
}

/** A short plain sentence for the model about what the user did. */
export function describe(action: Action, deviceName: string): string {
  const on = `on ${deviceName}`;
  switch (action.type) {
    case "stop":
      return `User stopped the cook ${on}.`;
    case "silence":
      return `User silenced the alarm ${on}.`;
    case "start": {
      let s = `User started a cook ${on} at ${formatTemp(action.temperature, action.unit)}`;
      if (action.minutes && action.minutes > 0) {
        s += ` with a ${formatMinutes(action.minutes)} timer`;
        if (action.autoStop) s += " and auto-stop";
      }
      return s + ".";
    }
    case "update": {
      const parts: string[] = [];
      if (action.temperature !== undefined && action.unit) {
        parts.push(
          `the target to ${formatTemp(action.temperature, action.unit)}`,
        );
      }
      if (action.minutes === 0) parts.push("the timer off");
      else if (action.minutes !== undefined) {
        parts.push(`the timer to ${formatMinutes(action.minutes)}`);
      }
      if (action.autoStop !== undefined && action.minutes !== 0) {
        parts.push(`auto-stop ${action.autoStop ? "on" : "off"}`);
      }
      return `User set ${parts.join(", ")} ${on}.`;
    }
  }
}

/**
 * Calls the tool for `action`, then tells the model what the user did
 * (and whether it failed). Returns the tool's structured result.
 */
export async function runAction(
  host: CardHost,
  action: Action,
  device: { id: string; name: string },
): Promise<ToolResult> {
  let result: ToolResult;
  try {
    const res = await host.callServerTool(toolCall(action, device.id));
    result = (res.structuredContent ?? {}) as ToolResult;
    if (res.isError && !result.error) {
      result = {
        ...result,
        error: { code: "internal", message: "The action failed. Try again." },
      };
    }
  } catch {
    result = {
      error: { code: "internal", message: "The action failed. Try again." },
    };
  }
  let text = describe(action, device.name);
  if (result.error) text += ` It failed: ${result.error.message}`;
  try {
    await host.updateModelContext({ content: [{ type: "text", text }] });
  } catch {
    // The host may not support model context; the action itself is done.
  }
  return result;
}
