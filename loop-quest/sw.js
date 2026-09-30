// Loop Quest service worker: keeps the game playable offline once it has
// loaded, and picks up new versions the next time you're online.
const CACHE = "loopquest-1.9.0";
const FONTS = "loopquest-fonts";
const CORE = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "LoopQuest-FL-scripts.zip"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // One missing file (a host that skipped the zip, say) shouldn't stop the rest.
      .then((cache) => Promise.all(CORE.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("loopquest-") && k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts: keep a copy after the first visit so the look survives offline.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(FONTS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok || res.type === "opaque") cache.put(req, res.clone());
          return res;
        } catch (e) {
          // Offline before the fonts were ever saved: fall back to system fonts quietly.
          return url.hostname === "fonts.googleapis.com" ? new Response("", { headers: { "Content-Type": "text/css" } }) : Response.error();
        }
      })
    );
    return;
  }
  if (url.origin !== self.location.origin) return;

  // The page itself: network first, so updates arrive; the cache when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Only the game page itself refreshes the offline copy (not a script or icon opened in a tab).
          const page = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
          if (res.ok && page && (res.headers.get("content-type") || "").includes("text/html")) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put("index.html", copy));
          }
          return res;
        })
        .catch(() => caches.match("index.html").then((hit) => hit || caches.match("./")))
    );
    return;
  }

  // Everything else from this site: cache first.
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
