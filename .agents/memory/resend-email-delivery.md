---
name: Resend email delivery constraints
description: Why farm emails silently fail to reach outside recipients and how to verify the Resend config
---

- `onboarding@resend.dev` as from-address only delivers to the Resend **account owner's** email; all other recipients are rejected with no visible app error (failures are logged and swallowed by design in `email.ts`).
- **Why:** production superadmin got emails while farm registrants got nothing — root cause was the test from-address, not app code. Fixed July 2026 by verifying a custom domain (via Porkbun DNS) and setting `EMAIL_FROM_ADDRESS` to that domain.
- **How to apply:** if some recipients get emails and others don't, check the from-address domain first. Verify key/sender without touching app code: `curl -X POST https://api.resend.com/emails -H "Authorization: Bearer $RESEND_API_KEY"` with a test payload (never echo the key; check length/`re_` prefix via node one-liner).
- Users pasting secrets often re-confirm the old value instead of replacing it — always verify the stored value changed (length/prefix check) before re-testing.
- Secrets changes need an api-server workflow restart (no watch) in dev and a republish for prod.
