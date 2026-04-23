import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./design/global.css";

const isLocalDev =
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "[::1]";

if ("serviceWorker" in navigator) {
  if (isLocalDev) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });
    });
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // registro opcional para PWA
      });
    });
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("No se encontró #root");

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
