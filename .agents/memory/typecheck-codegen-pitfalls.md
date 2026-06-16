---
name: Typecheck & codegen pitfalls (MyGoatHerd monorepo)
description: Latent typecheck failures that surface only after a codegen regen forces a tsc rebuild; how to fix them.
---

# Latent typecheck failures surfaced by codegen regen

Running `pnpm --filter @workspace/api-spec run codegen` rewrites generated files in
`lib/api-zod` and `lib/api-client-react`. This invalidates `tsc --build` incremental
caches (`*.tsbuildinfo`) and forces a full recompile, which can surface **pre-existing**
type errors that were previously masked by stale cache. Three known ones:

## 1. api-zod barrel export ambiguity (TS2308)
`lib/api-zod/src/index.ts` star-exports both `./generated/api` (zod schema **values**)
and `./generated/types` (TS **interfaces**). Request-body names (e.g. `CreateBreedingBody`,
`AddKidsBody`, `CreateGoatBody`, `UpdateBreedingBody`...) exist in **both**, so
`export *` from both is ambiguous → TS2308, even though one is a value and one is a type.
**Fix:** after the two `export *` lines, add an explicit `export { ...the *Body names... } from "./generated/api";`
to resolve in favor of the runtime zod schemas (consumers only use `.safeParse`).
**Why:** value+type with the same name across two separate `export *` statements still
collides under this repo's TS config; explicit named re-export wins.

## 2. Deep imports of api-client-react generated files (TS2307)
Many frontend files import types via `@workspace/api-client-react/src/generated/api.schemas`.
Under `moduleResolution: "bundler"` TS honors the package `exports` map. If `exports` only
maps `"."`, these deep subpath imports fail to resolve (Vite tolerates them, tsc does not).
**Fix:** add `"./src/*": "./src/*.ts"` to `lib/api-client-react/package.json` `exports`.
The `.ts` extension in the target is required — `"./src/*": "./src/*"` does NOT resolve.

## 3. Composite-lib requirement (TS6306)
Any `lib/*` referenced by an artifact's tsconfig `references` must have `composite: true`
(+ `declarationMap`, `emitDeclarationOnly`) like `lib/api-client-react`. `lib/object-storage-web`
was missing it. **Fix:** add those three compilerOptions.

## General note
`pnpm run typecheck` is `typecheck:libs && <leaf artifact checks>`. When libs fail, the
`&&` short-circuits and leaf-artifact errors never run — so leaf errors can hide for a long
time. After any codegen change, run the FULL `pnpm run typecheck` and expect to fix latent
leaf errors too.
