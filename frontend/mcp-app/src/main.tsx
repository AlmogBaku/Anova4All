import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CookerCard } from "./card.tsx";
import { loadGeist } from "./font.ts";
import "./style.css";

loadGeist();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CookerCard />
  </StrictMode>,
);
