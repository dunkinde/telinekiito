/* TelineKiito crew app service worker (scope /crew).
 * - App shell (/crew and its JS/CSS/fonts): stale-while-revalidate, so the app opens without a signal.
 * - Jobs (/api/crew/jobs…): network first (8 s), the last saved answer when there's no connection.
 * - Photos (/api/files/…): cache first (they never change), at most 200.
 * - Never cached: POST/PUT/…, logins (/api/staff/*), the office API and everything else under /api.
 * Bump VERSION to drop old caches. */
const VERSION = "tk-crew-v1";
const SHELL = `${VERSION}-shell`;
const API = `${VERSION}-api`;
const FILES = `${VERSION}-files`;
const STATIC_FILES = ["/crew.webmanifest", "/crew-icon.svg", "/crew-icon-192.png", "/crew-icon-512.png"];
const NETWORK_WAIT_MS = 8000;
const MAX_FILES = 200;

// Install: save the app page and every script, style and font it links to.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      try {
        const res = await fetch("/crew", { cache: "no-cache", credentials: "same-origin" });
        if (res.ok) {
          const html = await res.clone().text();
          await cache.put("/crew", res);
          const linked = Array.from(html.matchAll(/(?:src|href)="(\/[^"#?]+\.(?:js|css|woff2?|png|svg|ico|webmanifest))"/g), (m) => m[1]);
          await Promise.all([...new Set([...linked, ...STATIC_FILES])].map((u) => cache.add(u).catch(() => undefined)));
        }
      } catch (e) {
        /* offline while installing: runtime caching fills the cache later */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith("tk-crew-") && !k.startsWith(`${VERSION}-`)) await caches.delete(k);
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear-user-data") {
    event.waitUntil(Promise.all([caches.delete(API), caches.delete(FILES)]));
  }
});

async function tell(clientId, msg) {
  try {
    const list = clientId ? [await self.clients.get(clientId)] : await self.clients.matchAll({ type: "window" });
    for (const c of list) if (c) c.postMessage(msg);
  } catch (e) {
    /* ignore */
  }
}

/** Jobs: the network if it answers in time, otherwise the last saved answer (and the page is told). */
async function networkFirst(event, req, url) {
  const cache = await caches.open(API);
  const key = url.pathname + url.search;
  const network = fetch(req).then(async (res) => {
    if (res.ok) {
      const body = await res.clone().blob();
      const headers = new Headers(res.headers);
      headers.set("x-tk-cached-at", String(Date.now()));
      await cache.put(req, new Response(body, { status: res.status, statusText: res.statusText, headers }));
    }
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_WAIT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) {
      tell(event.clientId, { type: "api", url: key, cached: false, at: Date.now() });
      return res;
    }
  } catch (e) {
    /* no connection */
  }
  const hit = await cache.match(req);
  if (hit) {
    event.waitUntil(network.catch(() => undefined));
    tell(event.clientId, { type: "api", url: key, cached: true, at: Number(hit.headers.get("x-tk-cached-at")) || 0 });
    return hit;
  }
  return network; // no saved answer: wait for the network (or fail like a normal request)
}

/** Photos never change: saved copy first. */
async function cacheFirst(req) {
  const cache = await caches.open(FILES);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") {
    await cache.put(req, res.clone());
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MAX_FILES; i++) await cache.delete(keys[i]);
  }
  return res;
}

/** App files: the saved copy right away, refreshed in the background. Hashed Next.js files never change. */
async function staleWhileRevalidate(event, req, url) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  if (hit && url.pathname.startsWith("/_next/static/")) return hit;
  const network = fetch(req)
    .then(async (res) => {
      if (res.ok && res.type === "basic") await cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(network);
    return hit;
  }
  return (await network) || Response.error();
}

/** The app page itself: saved copy first; when a new version arrives, the page offers a reload. */
async function shell(event) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match("/crew");
  const network = fetch("/crew", { cache: "no-cache", credentials: "same-origin" })
    .then(async (res) => {
      if (!res.ok) return res;
      const text = await res.clone().text();
      const old = hit ? await hit.clone().text() : null;
      await cache.put("/crew", res.clone());
      if (old !== null && old !== text) tell(null, { type: "update" });
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(network);
    return hit;
  }
  return (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // writes always go to the network (the app queues them itself)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if (p.startsWith("/api/staff/") || p.startsWith("/api/office/")) return;
  if (p === "/api/crew/jobs" || p.startsWith("/api/crew/jobs/")) return event.respondWith(networkFirst(event, req, url));
  if (p.startsWith("/api/files/")) return event.respondWith(cacheFirst(req));
  if (p.startsWith("/api/") || p.startsWith("/doc/")) return;
  if (req.mode === "navigate") {
    if (p === "/crew" || p === "/crew/" || p === "/crew.html") return event.respondWith(shell(event));
    return;
  }
  if (p.startsWith("/_next/") || /\.(?:js|css|woff2?|png|svg|ico|webmanifest)$/.test(p)) return event.respondWith(staleWhileRevalidate(event, req, url));
});
