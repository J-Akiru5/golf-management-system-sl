/*
 * TeeLine Golf service worker.
 *
 * Next 16 has no built-in service worker story (checked in node_modules/next/dist/docs before
 * writing this), so the worker is a plain file served from /sw.js. It does three jobs:
 *
 *   1. Keep the app shell and the build's static files so the app opens with no signal.
 *   2. Keep the last HTML/RSC response for pages the person actually visited, so a reload or a
 *      bottom-bar tap still lands somewhere. The screens label that copy with the time it was
 *      saved; nothing here pretends it is live.
 *   3. Stay out of the way of Supabase. Only same-origin GETs are cached, so API responses,
 *      signed photo URLs and auth calls are never stored. Player photos in particular must not
 *      land in a cache this app does not control.
 *
 * Offline writes are not queued. The worker only replays cached reads.
 */

const VERSION = "v1";
const SHELL_CACHE = `teeline-shell-${VERSION}`;
const PAGE_CACHE = `teeline-pages-${VERSION}`;
const KEEP = new Set([SHELL_CACHE, PAGE_CACHE]);

const OFFLINE_URL = "/offline";
const SHELL_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/brand/teeline-logo-reverse.svg",
  "/brand/teeline-app-icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // One missing file must not fail the whole install; each asset is optional on its own.
      await Promise.all(
        SHELL_ASSETS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) await cache.put(url, response);
          } catch {}
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("teeline-") && !KEEP.has(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_CACHES") {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(
          names.filter((name) => name.startsWith("teeline-")).map((name) => caches.delete(name)),
        );
      })(),
    );
  }
});

const isStatic = (pathname) =>
  pathname.startsWith("/_next/static/") ||
  pathname.startsWith("/icons/") ||
  pathname.startsWith("/brand/") ||
  pathname.startsWith("/course/") ||
  /\.(?:css|js|woff2?|png|jpg|jpeg|webp|svg|ico)$/.test(pathname);

const isCacheable = (response) =>
  response &&
  response.ok &&
  !response.redirected &&
  (response.type === "basic" || response.type === "default");

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    // no-cache asks the server instead of trusting the browser's HTTP cache. That cache is not
    // ours to clear on sign-out, so the worker must not let it answer for a page.
    const response = await fetch(request, { cache: "no-cache" });
    if (isCacheable(response)) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheable(response)) await cache.put(request, response.clone());
  return response;
}

async function offlinePage() {
  const cache = await caches.open(SHELL_CACHE);
  const page = await cache.match(OFFLINE_URL);
  if (page) return page;
  return new Response(
    "<!doctype html><meta charset=utf-8><title>Offline</title><p>No connection and no saved copy on this phone.</p>",
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The app's own write and auth endpoints are never cached, even when they answer GET.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  const navigate = request.mode === "navigate";
  const rsc = request.headers.get("RSC") === "1";
  // Next prefetches every link the person can see. Those responses are not a screen they opened,
  // so they are not the last thing on screen and are not stored. An actual tap or reload is.
  if (request.headers.get("Next-Router-Prefetch") === "1") return;

  if (navigate || rsc) {
    event.respondWith(
      networkFirst(request, PAGE_CACHE).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (navigate) return offlinePage();
        return new Response("", { status: 504 });
      }),
    );
    return;
  }

  if (isStatic(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
