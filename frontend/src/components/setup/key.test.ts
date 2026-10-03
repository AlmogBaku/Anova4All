import { describe, expect, it, vi } from "vitest";
import { KEY_LENGTH, generateKey } from "./key.ts";

describe("generateKey", () => {
  it("returns 10 characters of [a-z0-9]", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateKey()).toMatch(/^[a-z0-9]{10}$/);
    }
    expect(KEY_LENGTH).toBe(10);
  });

  it("uses crypto.getRandomValues by default", () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    generateKey();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("rejects bytes >= 252 instead of folding them (no modulo bias)", () => {
    let call = 0;
    const random = (buf: Uint8Array<ArrayBuffer>) => {
      // First buffer: only rejectable bytes; second: 0..15.
      buf.set(
        call++ === 0 ? new Array(buf.length).fill(252) : buf.map((_, i) => i),
      );
      return buf;
    };
    expect(generateKey(random)).toBe("abcdefghij");
    expect(call).toBe(2);
  });

  it("maps byte values onto the 36-character alphabet", () => {
    const bytes = [25, 26, 35, 36, 71, 0, 1, 2, 3, 4];
    const random = (buf: Uint8Array<ArrayBuffer>) => {
      buf.fill(0);
      buf.set(bytes);
      return buf;
    };
    expect(generateKey(random)).toBe("z09a9abcde");
  });
});
