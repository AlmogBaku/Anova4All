import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase.ts", () => ({ supabase: {} }));
const { Section } = await import("./device-settings.tsx");

describe("Section", () => {
  it("labels itself with a valid id even when the title has spaces", () => {
    const html = renderToStaticMarkup(
      createElement(Section, { title: "Invite someone", children: "body" }),
    );
    const labelledBy = /aria-labelledby="([^"]*)"/.exec(html)?.[1];
    const id = /<h2[^>]* id="([^"]*)"/.exec(html)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(labelledBy).toBe(id);
    expect(labelledBy).not.toMatch(/\s/);
  });
});

describe("Section without a title", () => {
  it("renders no empty heading and no dangling label", () => {
    const html = renderToStaticMarkup(
      createElement(Section, { children: "body" }),
    );
    expect(html).not.toMatch(/<h2/);
    expect(html).not.toMatch(/aria-labelledby/);
  });
});
