import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

// Product name is a single string constant for easy rename (PD-001).
export const PRODUCT_NAME = "EBP";

if (window.location.pathname === "/") {
  window.history.replaceState(null, "", "/events");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
