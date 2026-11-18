/*
 * Installing and updating the app.
 * Exposes window.PWA for the settings screen: { state, install(), update(), standalone }
 */
(function () {
  "use strict";
  const PWA = {
    state: "unsupported",   // unsupported | ready | installable | installed | update
    standalone: matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
    prompt: null,
    waiting: null,
    install: null,
    update: null,
  };
  window.PWA = PWA;

  const changed = () => document.dispatchEvent(new CustomEvent("pwa-change"));
  const set = (s) => { if (PWA.state !== s) { PWA.state = s; changed(); } };

  // the browser offers installation only when it decides the app qualifies
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    PWA.prompt = e;
    set("installable");
  });
  window.addEventListener("appinstalled", () => { PWA.prompt = null; set("installed"); });

  PWA.install = async () => {
    if (!PWA.prompt) return false;
    PWA.prompt.prompt();
    const { outcome } = await PWA.prompt.userChoice;
    if (outcome === "accepted") { PWA.prompt = null; set("installed"); }
    return outcome === "accepted";
  };

  PWA.update = () => {
    if (!PWA.waiting) return location.reload();
    PWA.waiting.postMessage("skipWaiting");
  };

  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  // demo mode must not install anything in a visitor's browser
  if (new URLSearchParams(location.search).has("demo")) return;

  navigator.serviceWorker.register("sw.js").then((reg) => {
    if (PWA.state === "unsupported") set(PWA.standalone ? "installed" : "ready");
    const track = (worker) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          PWA.waiting = worker;
          set("update");
        }
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) { PWA.waiting = reg.waiting; set("update"); }
    track(reg.installing);
    reg.addEventListener("updatefound", () => track(reg.installing));
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => { /* offline support is optional – the app works without it */ });

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
})();
