---
name: Session cookies in the Replit preview iframe
description: Why cookie-based auth needs SameSite=None + Secure to work in the Replit dev preview, and the CSRF tradeoff.
---

# Session cookies must be SameSite=None + Secure for the Replit preview

The Replit dev preview embeds the app in a **cross-site iframe**
(`*.picard.replit.dev` inside the workspace). Browsers will not send
`SameSite=Lax` (or `Strict`) cookies back on requests originating from a
cross-site iframe, so a cookie-based session set with `SameSite=Lax` is saved
server-side but never returned by the browser.

**Symptom:** login POST returns 200 and a session row IS written to the DB, but
every following authenticated request is 401. A redirect guard (`/login` ⇄ `/`)
then ping-pongs and React throws "Maximum update depth exceeded". Easy to
misdiagnose as a session-store bug — check whether the cookie is actually being
sent back before touching the store.

**Fix:** cookie `sameSite: "none"` with `secure: true`. `none` is only valid
alongside `secure`, and `secure` requires HTTPS — which the Replit proxy
provides in BOTH the dev preview and production, as long as Express has
`app.set("trust proxy", 1)`. Default `secure` ON (not gated on
`NODE_ENV==="production"`), because the dev preview is also HTTPS. Keep a
`SESSION_COOKIE_SECURE=false` override so plain-HTTP test clients (supertest)
still work; when that override is off, fall back to `sameSite: "lax"`.

**Why production "worked" but dev didn't:** the published app is opened directly
(first-party, not in a cross-site iframe), so `SameSite=Lax` round-trips there.
The breakage is preview-specific — but `none`+`secure` is the correct universal
setting for both.

**Tradeoff:** `SameSite=None` removes the SameSite CSRF baseline. State-changing
`/api` routes have no compensating CSRF control yet (Origin check / CSRF token)
— treat that as a known follow-up security gap.
