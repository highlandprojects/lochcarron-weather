const CACHE_NAME = "lochcarron-weather-v1.0.1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.ico",
  "./styles.css?v=20260701-13",
  "./data/weather-data.js",
  "./data/forecast.json",
  "./data/weather-3y.json",
  "./data/thoughts.json",
  "./scripts/app-state.js?v=20260701-9",
  "./scripts/theme-thoughts.js?v=20260701-9",
  "./scripts/data-loading.js?v=20260701-9",
  "./scripts/live-weather.js?v=20260701-10",
  "./scripts/planner-tides.js?v=20260701-9",
  "./scripts/rain-chart.js?v=20260701-9",
  "./scripts/date-facts.js?v=20260701-9",
  "./scripts/app-boot.js?v=20260701-10",
  "./scripts/pwa.js?v=20260701-1",
  "./assets/lochcarron-hero-real.jpg",
  "./assets/social-card.png",
  "./assets/daylight-wide.png",
  "./assets/moon-phases-sprite-centered.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-64.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-192.png",
  "./assets/icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "./index.html"));
    return;
  }

  if (url.pathname.includes("/data/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, fallbackUrl = null) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (fallbackUrl ? caches.match(fallbackUrl) : Response.error());
  }
}
