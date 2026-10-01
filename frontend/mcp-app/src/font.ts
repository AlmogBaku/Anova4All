// Archivo (latin, width axis) for the card's condensed caps and numerals.
//
// The MCP Apps default CSP has no font-src, so default-src 'none' blocks any
// font URL, data: included. The woff2 is inlined into the bundle as base64 and
// handed to FontFace as bytes: no font is fetched, so font-src never applies.
// Where FontFace is missing or rejects the data, the CSS fallback stack stays.
import archivo from "@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2?inline";

/** The latin subset's range, from @fontsource-variable/archivo/wdth.css. */
const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

function bytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function loadArchivo(): void {
  if (typeof FontFace === "undefined" || !document.fonts) return;
  try {
    const face = new FontFace("Archivo Variable", bytes(archivo), {
      style: "normal",
      weight: "100 900",
      stretch: "62% 125%",
      unicodeRange: LATIN,
      display: "swap",
    });
    document.fonts.add(face);
    void face.load().catch(() => document.fonts.delete(face));
  } catch {
    // Keep the fallback stack.
  }
}
