---
name: "@types/react dedup across web + Expo"
description: Adding the Expo mobile artifact introduces a second @types/react version that breaks the web app's tsc typecheck; fix by pinning a single version via pnpm overrides.
---

# Duplicate @types/react breaks web typecheck after adding Expo mobile

Symptom: `pnpm run typecheck` fails only in the React web app with errors like
"Two different types with this name exist, but they are unrelated" on `Ref`,
`VoidOrUndefinedOnly`, etc. (e.g. in `ui/calendar.tsx`, `ui/spinner.tsx`).
The message names two `@types/react` versions (e.g. `19.2.14` vs `19.1.17`).

**Cause:** The Expo mobile app (Expo SDK 54 / react-native) pins `@types/react`
to the `19.1` line, while the web/mockup/object-storage-web packages use the
catalog (`^19.2.0` → `19.2.x`). The `19.1` types leak into the web typecheck
through a shared lib (`lib/api-client-react`) consumed by both apps, so tsc
sees two unrelated copies of the React types.

**Fix:** Force one version workspace-wide via `pnpm-workspace.yaml` `overrides`:
```
overrides:
  '@types/react': 19.1.17
  '@types/react-dom': 19.1.11
```
Then `pnpm install`. Chose the `19.1` line because the actual React runtime is
`19.1.0` everywhere (catalog `react: 19.1.0`), so 19.1 types are the most
runtime-accurate and leave the Expo tree unchanged. Both web and mobile
typecheck clean afterward.

**Why:** tsc treats structurally-identical types from two different node_modules
copies as incompatible; deduping to one version is the only reliable fix. Note
`vite build` does NOT run tsc, so this never blocks the web production build —
but it does break `pnpm run typecheck` / CI and any validation gate.

**How to apply:** Whenever a new artifact (especially Expo) pins a different
`@types/react`/`@types/react-dom` minor than the catalog, add/adjust the
override pin instead of touching individual package.json files.
