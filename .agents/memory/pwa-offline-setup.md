---
name: PWA basic offline setup
description: How the fairy-goat-herd web app is made an installable PWA with app-shell-only offline, and the traps around base path + separate API service.
---

The web app (`fairy-goat-herd`) is an installable PWA with **basic offline support only** (app shell + assets, NOT goat/breeding data) via `vite-plugin-pwa` (Workbox generateSW).

**Why app-shell-only:** user explicitly declined offline access to their actual data; offline data would need runtime API caching + stale-data handling.

**How to apply / non-obvious constraints:**
- The web artifact and the API live in **separate services** (web on `/`, api-server on `/api`). The service worker scope is the web app, so navigation fallback MUST exclude the API: `navigateFallbackDenylist: [/^\/api/]`. Do NOT add runtime caching for `/api` — that would defeat the "no offline data" decision.
- `base` is dynamic (`process.env.BASE_PATH`, currently `/`). vite-plugin-pwa automatically derives manifest `start_url`/`scope` and the SW registration path from vite `base`, so never hardcode `/` in manifest/registration — let the plugin handle it.
- Icons are generated from `public/favicon.svg` (orange square + white goat) with ImageMagick `magick` (no sharp/rsvg in this env; ImageMagick's builtin SVG renderer handles this simple SVG fine). Files live in `public/`: `pwa-192x192.png`, `pwa-512x512.png`, `maskable-512x512.png` (full-bleed orange for mask safe-zone), `apple-touch-icon.png` (flattened, iOS dislikes transparency). Regenerate these if the favicon changes.
- Production host is `serve=static` with `/* -> /index.html` rewrite; static file precedence serves `sw.js`/`manifest.webmanifest`/icons before the SPA fallback, so it works — but real files must exist in `dist/public`.
- Dev preview does NOT run the SW (devOptions disabled) — PWA/offline only verifiable in the built/published static app, not the vite dev preview.
