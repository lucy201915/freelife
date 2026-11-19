import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { BootstrapProvider, readBootstrap } from "./lib/bootstrap";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root");

const app = (
  <StrictMode>
    <BootstrapProvider value={readBootstrap()}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </BootstrapProvider>
  </StrictMode>
);

const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
const prerenderPath = (rootEl.getAttribute("data-path") || "").replace(/\/+$/, "");
const prerendered = rootEl.getAttribute("data-prerender") === "true";

if (prerendered && prerenderPath === currentPath) {
  hydrateRoot(rootEl, app);
} else {
  if (prerendered) rootEl.replaceChildren();
  createRoot(rootEl).render(app);
}
