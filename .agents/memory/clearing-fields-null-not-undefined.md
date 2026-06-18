---
name: Clearing fields needs null not undefined
description: Why form "empty -> undefined" transforms silently fail to clear DB columns on update in this stack.
---

When a form field is meant to be clearable (e.g. removing an optional tattoo location or wiping an EID), the submit payload must send an explicit `null`, not `undefined`.

**Why:** Drizzle's `.set({ ...parsed.data })` on an update **omits** keys whose value is `undefined`, so the column keeps its old value. A zod `.transform((v) => v || undefined)` therefore makes "removal" a no-op on update — the bug looks fixed in the UI but stale data persists.

**How to apply:**
- Form schema: transform empty string to `null` (`(v) => (v ? v : null)`), not `undefined`.
- OpenAPI: mark the field `nullable: true` in the Create/Update bodies so generated Zod (`.nullish()`) accepts `null`. Keep the response schema non-null if the read path never needs it.
- Inputs: guard rendered value with `value={field.value ?? ""}` since the field type becomes `string | null`.
- Test the round-trip: create with a value, update with `null`, assert the DB row and GET response are null/absent.
