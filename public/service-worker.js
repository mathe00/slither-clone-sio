// --- public/service-worker.js ---
/**
 * ==============================================================================
 * FILE: service-worker.js
 *
 * DESCRIPTION:
 * Service Worker script for the Slither Clone SIO application. Manages caching
 * of essential assets (offline page, core CSS/JS, images, translation files,
 * offline game script, i18next libs) for offline access using the Cache API.
 * Implements a network-falling-back-to-cache strategy for navigation requests
 * (serving offline.html on failure) and a cache-falling-back-to-network strategy
 * for other assets. Handles installation, activation (cache cleanup), and fetch
 * event interception.
 *
 * DEVELOPER GUIDELINES:
 * - Keep comments concise, relevant, and in English.
 * - Document complex logic, algorithms, non-obvious decisions, and "why"s.
 * - Maintain and update existing comments when refactoring or modifying code.
 * - Adhere to modern JavaScript (ESNext) conventions and project style guides.
 * - Ensure code is robust and handles potential errors gracefully.
 * - Increment CACHE_NAME when making changes to cached assets.
 * ==============================================================================
 */

// Increment cache version when assets change
const CACHE_NAME = "slither-clone-offline-v4";
const OFFLINE_URL = "/offline.html"; // Page to serve on network failure

// --- Core Assets to Cache ---
// Includes assets for the main app AND the offline page/game
const CORE_ASSETS = [
  // Offline Page & Dependencies
  OFFLINE_URL,
  "/offline-snake-game.js", // Script for the offline snake game
  "/locales/ar.json", // Arabic
  "/locales/de.json", // German
  "/locales/en.json", // English
  "/locales/es.json", // Spanish
  "/locales/fr.json", // French
  "/locales/hi.json", // Hindi
  "/locales/id.json", // Indonesian
  "/locales/it.json", // Italian
  "/locales/ja.json", // Japanese
  "/locales/ko.json", // Korean
  "/locales/pl.json", // Polish
  "/locales/pt.json", // Portuguese
  "/locales/ru.json", // Russian
  "/locales/tr.json", // Turkish
  "/locales/zh.json", // Chinese
  // i18next CDN scripts (Needed for offline page i18n)
  // WARNING: Caching external CDN resources can be fragile.
  // Consider hosting these locally for better reliability.
  "https://unpkg.com/i18next/i18next.min.js",
  "https://unpkg.com/i18next-http-backend/i18nextHttpBackend.min.js",
  "https://unpkg.com/i18next-browser-languagedetector/i18nextBrowserLanguageDetector.min.js",

  // Core App Assets (already present)
  "/styles.css", // Base styles (used by offline too)
  "/main-menu-background.png", // Background image (might be used elsewhere)
  "/slither-logo-server-down.png", // Offline logo
  "/slither-logo.png", // Favicon
  "/admin-logic.js", // Admin panel logic (might not be needed offline, but keep for now)
  // Add other essential core assets if any (e.g., other CSS, main JS modules if needed offline?)
  // "/ui-logic.js", // Example: Add if parts are needed offline
];

/**
 * Service Worker Installation: Cache essential resources.
 */
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Installation...");
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log(
          "[Service Worker] Caching core assets:",
          CORE_ASSETS
        );
        // Use addAll with Request objects for CDN URLs to handle potential CORS issues during caching
        const requests = CORE_ASSETS.map(url => {
            if (url.startsWith('http')) {
                // Create a Request object for external URLs, mode 'no-cors' might be needed
                // depending on CDN headers, but 'cors' is generally preferred if allowed.
                return new Request(url, { mode: 'cors' });
            }
            return url; // Local URLs can be added directly
        });
        await cache.addAll(requests);
        console.log("[Service Worker] Core assets cached successfully.");
      } catch (error) {
        console.error(
          "[Service Worker] Initial caching failed: ",
          error
        );
        // Log which asset might have failed during addAll
        console.error("Failed assets might include:", CORE_ASSETS);
        // Attempt to cache individually to pinpoint the issue (optional debug)
        CORE_ASSETS.forEach(async (assetUrl) => {
            try {
                const cache = await caches.open(CACHE_NAME);
                const request = assetUrl.startsWith('http') ? new Request(assetUrl, { mode: 'cors' }) : assetUrl;
                await cache.add(request);
            } catch (err) {
                console.error(`[Service Worker] Failed to cache individually: ${assetUrl}`, err);
            }
        });
      }
    })()
  );
  // Force the installed service worker to become active immediately
  self.skipWaiting();
});

/**
 * Service Worker Activation: Clean up old caches.
 */
self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activation...");
  event.waitUntil(
    (async () => {
      // Take immediate control of uncontrolled clients
      if (self.clients && clients.claim) {
        await clients.claim();
        console.log("[Service Worker] Client control claimed.");
      }
      // Delete old caches that don't match CACHE_NAME
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME) // Keep only the new cache
          .map((name) => {
            console.log("[Service Worker] Deleting old cache:", name);
            return caches.delete(name);
          })
      );
      console.log("[Service Worker] Old cache cleanup complete.");
    })()
  );
});

/**
 * Fetch Event Interception: Apply caching strategies.
 * - Navigation: Network falling back to Offline Page cache.
 * - Other Assets: Cache falling back to Network.
 */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Ignore non-GET requests or requests to Chrome extensions
  if (
    request.method !== "GET" ||
    request.url.startsWith("chrome-extension://")
  ) {
    // console.log("[Service Worker] Ignoring non-GET or chrome-extension request:", request.url);
    return;
  }

  // Strategy for Navigation Requests (HTML)
  if (request.mode === "navigate") {
    // console.log("[Service Worker] Handling navigate request:", request.url);
    event.respondWith(
      (async () => {
        try {
          // Try network first
          const networkResponse = await fetch(request);
          // console.log("[Service Worker] Navigate request served from network:", request.url);
          return networkResponse;
        } catch (error) {
          // If network fails, serve the offline page from cache
          console.log(
            "[Service Worker] Network failed for navigation, attempting to serve offline page from cache."
          );
          try {
            const cache = await caches.open(CACHE_NAME);
            const cachedResponse = await cache.match(OFFLINE_URL);
            if (cachedResponse) {
              console.log("[Service Worker] Offline page served from cache.");
              return cachedResponse;
            }
            // If even the offline page isn't cached (shouldn't happen after install)
            console.error("[Service Worker] Offline page not found in cache.");
            return new Response("Offline service unavailable.", {
              status: 503,
              statusText: "Service Unavailable",
              headers: { "Content-Type": "text/plain" },
            });
          } catch (cacheError) {
            console.error(
              "[Service Worker] Error accessing cache for offline page:",
              cacheError
            );
            return new Response("Offline cache error.", {
              status: 500,
              statusText: "Internal Server Error",
              headers: { "Content-Type": "text/plain" },
            });
          }
        }
      })()
    );
  }
  // Strategy for ALL other assets (CSS, JS, images, fonts, locales, etc.)
  // Cache falling back to Network
  else {
    // console.log("[Service Worker] Handling asset request:", request.url);
    event.respondWith(
      (async () => {
        try {
          const cache = await caches.open(CACHE_NAME);
          // Try to find the response in the cache
          const cachedResponse = await cache.match(request);
          if (cachedResponse) {
            // console.log("[Service Worker] Asset served from cache:", request.url);
            return cachedResponse;
          }

          // If not in cache, try fetching from the network
          // console.log("[Service Worker] Asset not in cache, attempting network fetch:", request.url);
          // We DON'T dynamically cache responses here to keep the cache controlled by CORE_ASSETS.
          // If the network fails here, the asset simply won't load.
          // Since essential offline assets are in CORE_ASSETS, cache.match should succeed offline.
          return await fetch(request);
        } catch (error) {
          console.error(
            "[Service Worker] Error handling asset request:",
            request.url,
            error
          );
          // Optional: Return a generic error response for the missing asset
          // Avoid doing this for essential assets that *should* be cached.
          // This might hide caching issues during development.
          // Consider only returning 404 for non-essential asset types if needed.
          // For now, let the browser handle the failed fetch.
          // return new Response(`Asset not found: ${request.url}`, {
          //     status: 404, statusText: "Not Found", headers: { "Content-Type": "text/plain" },
          // });
          // Rethrow the error to indicate failure
          throw error;
        }
      })()
    );
  }
});
