---
name: Replit iframe cookies (cross-site session auth)
description: Why cookie-session auth 401s in the Replit dev preview, covering BOTH the cookie attributes and the fetch credentials mode.
---

The Replit dev preview renders the app inside a cross-site iframe (top-level is replit.com), so the session cookie is a third-party cookie. Two independent things must BOTH be right or every authenticated request 401s while login itself returns 200:

1. **Cookie attributes (server):** the session cookie must be `SameSite=None` + `Secure`, and Express needs `app.set("trust proxy", 1)` so it recognizes the proxied HTTPS connection and actually emits the `Secure` cookie. Default `secure` ON (not just prod) because the dev preview is also HTTPS+cross-site. Plain-HTTP test clients opt out via `SESSION_COOKIE_SECURE=false` → falls back to `SameSite=lax`.

2. **Fetch credentials mode (client):** the API client's `fetch` must send `credentials: "include"`. The default `same-origin` drops the cookie in the third-party iframe context, so login 200s (it seeds the query cache + redirects) but `/auth/me` and every other authed call 401s. `include` is harmless for token-based (Expo) clients that carry no cookies.

**Symptom that points here:** login `POST` returns 200 but `GET /api/auth/me` (and all authed endpoints) return 401 in ~1ms (bails before any DB query). Not a DB/table problem.

**curl cannot reproduce it:** over plain `localhost:80` there is no `X-Forwarded-Proto: https`, so Express won't set the `Secure` cookie at all and the cookie jar stays empty — inconclusive. Verify in the real browser preview instead.

**Why:** both halves were needed historically — the cookie attrs were fixed first, but a later symptom (superadmin "Could not create farm") traced to the client `fetch` missing `credentials: include`.
