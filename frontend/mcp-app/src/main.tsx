import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CookerCard } from "./card.tsx";
import { loadArchivo } from "./font.ts";
import "./style.css";

loadArchivo();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CookerCard />
  </StrictMode>,
);
