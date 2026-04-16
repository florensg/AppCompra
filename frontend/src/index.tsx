import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // registro opcional para PWA
    });
  });
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("No se encontró #root");

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
