---
name: Orval zod const ordering
description: Generated api-zod file can reference min/max constants before they are declared, crashing module import.
---
The orval zod client sometimes emits `export const <schema><Field>Max = ...` at the *end* of `lib/api-zod/src/generated/api.ts` while the schema using it sits earlier — a temporal-dead-zone `ReferenceError` at import, taking down every route that imports `@workspace/api-zod`.

**Why:** happened after adding new maxLength'd string fields to openapi.yaml; a plain re-run of `pnpm --filter @workspace/api-spec codegen` produced correct ordering, so the bad output is nondeterministic.

**How to apply:** after any codegen, `grep -n "<NewField>Max" lib/api-zod/src/generated/api.ts` and confirm the const line number precedes its `.max(...)` usage; if not, rerun codegen. Also run the api-server test suite, which imports the module and catches the crash.
