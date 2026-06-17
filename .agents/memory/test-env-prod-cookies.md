---
name: api-server tests run with NODE_ENV=production
description: vitest sets NODE_ENV=production, so prod-gated behavior (e.g. secure cookies) activates in tests and can break plain-HTTP test clients
---

The api-server `vitest.config.ts` sets `NODE_ENV: "production"` (to avoid the
pino-pretty worker transport so the process exits cleanly). This means any
behavior gated on `process.env.NODE_ENV === "production"` is ACTIVE during tests.

**Concrete bite:** session cookies were set `secure: true` in production. supertest
talks plain HTTP, so the agent never resends a `secure` cookie — login returned 200
but every subsequent authenticated request got 401, while the same flow worked fine
via curl against the live (dev) server.

**Why:** the symptom (login OK, next request 401, works under curl/tsx but not
vitest) looks like a session-store/cookie-jar bug and sends you down the wrong path.
The real cause is the test env masquerading as production.

**How to apply:** when adding prod-gated behavior, don't assume tests run as
non-prod. Gate HTTPS/secure-only features on an explicit env override (here
`SESSION_COOKIE_SECURE`) so tests can opt out, rather than keying solely off
`NODE_ENV`. If a test "session not persisting" mystery appears, check the secure
cookie flag first.
