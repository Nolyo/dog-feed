import "./style.css";
import { renderApp } from "./app";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("#app missing");

void renderApp(root);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW register failed", err);
    });
  });
}
