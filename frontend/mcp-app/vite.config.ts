// Builds the MCP Apps cooker card into one self-contained HTML file that the Go
// MCP server embeds (internal/mcp/ui.go). Run with `bun run build:mcp-app`.
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const outDir = path.resolve(import.meta.dirname, "../../internal/mcp/ui");

/** Emits index.html as app.html, next to the committed placeholder.html. */
function renameToAppHtml(): Plugin {
  return {
    name: "mcp-card-app-html",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      const html = bundle["index.html"];
      if (!html || html.type !== "asset") {
        this.error("index.html is missing from the card bundle");
      }
      delete bundle["index.html"];
      this.emitFile({
        type: "asset",
        fileName: "app.html",
        source: html.source,
      });
    },
  };
}

export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [react(), viteSingleFile(), renameToAppHtml()],
  build: {
    outDir,
    // The output folder holds placeholder.html, which must survive the build.
    emptyOutDir: false,
    copyPublicDir: false,
  },
});
