import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CookerCard } from "./card.tsx";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CookerCard />
  </StrictMode>,
);
