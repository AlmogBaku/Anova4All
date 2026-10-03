// initial-hash must load first: it reads the URL fragment before supabase-js clears auth callbacks.
import "@/lib/initial-hash.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app.tsx";
import { ThemeProvider } from "@/contexts/theme.tsx";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system">
      <App />
    </ThemeProvider>
  </StrictMode>,
);
