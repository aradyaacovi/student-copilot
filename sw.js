/*
 * Service worker – makes the app installable and usable offline.
 *
 * App shell (HTML, CSS, JS, icons, data file): cache first, refreshed in the background.
 * Everything else (Supabase, fonts): straight to the network, with a cached copy as fallback.
 * Supabase requests are never cached – stale academic data would be worse than none.
 */
const VERSION = "v4";
const SHELL = "shell-" + VERSION;
const RUNTIME = "runtime-" + VERSION;

// Files the app needs to start. Optional ones (personal data, cloud config) may not exist.
const REQUIRED = ["./", "./index.html", "./css/style.css", "./js/logic.js", "./js/app.js",
  "./data/sample-semester.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];
const OPTIONAL = ["./data/my-semester.js", "./js/config.js"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(REQUIRED);
    await Promise.all(OPTIONAL.map((u) => cache.add(u).catch(() => {})));
    // the new worker takes over only when the page asks, so a reload is never forced mid-use
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keep = [SHELL, RUNTIME];
    await Promise.all((await caches.keys()).filter((k) => !keep.includes(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

const isShell = (url) =>
  url.origin === self.location.origin &&
  !url.pathname.includes("/docs/") &&
  (url.pathname.endsWith("/") || /\.(html|css|js|png|svg|webmanifest)$/.test(url.pathname));

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // never cache the cloud: a stale deadline is worse than an offline message
  if (url.hostname.endsWith(".supabase.co")) return;

  if (isShell(url)) {
    e.respondWith((async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      const fresh = fetch(request).then((res) => {
        if (res.ok) caches.open(SHELL).then((c) => c.put(request, res.clone()));
        return res;
      }).catch(() => null);
      return cached || (await fresh) || new Response("offline", { status: 503 });
    })());
    return;
  }

  // fonts and anything else: network first, fall back to whatever was cached
  e.respondWith((async () => {
    try {
      const res = await fetch(request);
      if (res.ok && (url.hostname.includes("fonts.") || url.hostname.includes("jsdelivr"))) {
        const c = await caches.open(RUNTIME);
        c.put(request, res.clone());
      }
      return res;
    } catch {
      return (await caches.match(request)) || new Response("offline", { status: 503 });
    }
  })());
});
