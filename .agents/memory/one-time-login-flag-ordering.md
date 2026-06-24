---
name: One-time login flag ordering
description: When to stamp "first login" / one-time onboarding markers in the login route.
---

Stamp one-time login markers (e.g. `users.last_login_at` that drives a
first-login onboarding redirect) ONLY after the login has fully succeeded —
after session regenerate AND session.save both resolve — not right after the
password check.

**Why:** The login route can still 500 after the password check (session
regenerate or save can fail). If you stamp the flag before those steps, a failed
login consumes the one-time flag, so the user's next *successful* login sees
`firstLogin = false` and silently misses the onboarding redirect.

**How to apply:** Compute the boolean early from the loaded row
(`firstLogin = user.lastLoginAt == null`) so you capture the pre-login state, but
perform the DB write that consumes it only in the final success path, just
before sending the response.
