import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { unitOf } from "./dial.ts";
import { UnitSwitch } from "./unit-switch.tsx";

const render = (props: { unit: "c" | "f"; disabled?: boolean }) =>
  renderToStaticMarkup(
    createElement(UnitSwitch, { ...props, onChange: vi.fn() }),
  );

describe("UnitSwitch", () => {
  it("is a labelled radio group with the chosen unit checked", () => {
    const html = render({ unit: "f" });
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Temperature unit"');
    expect(html).toMatch(
      /aria-checked="true"[^>]*aria-label="Fahrenheit"|aria-label="Fahrenheit"[^>]*aria-checked="true"/,
    );
    expect(html).not.toMatch(/ disabled=""/);
  });

  it("disables both units when editing isn't allowed", () => {
    const html = render({ unit: "c", disabled: true });
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
  });

  it("passes only real units to the change handler", () => {
    expect(unitOf("c")).toBe("c");
    expect(unitOf("f")).toBe("f");
    expect(unitOf("")).toBeNull();
    expect(unitOf("k")).toBeNull();
  });
});
