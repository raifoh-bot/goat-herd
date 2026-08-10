---
name: Hoisted duplicate zod versions break dependent typings
description: Mass zodResolver-style TS2345 errors mean a dependency's "zod" types resolved to a different hoisted zod major, not that schemas are wrong.
---

# Duplicate zod majors + hoisting = latent type mismatches

If two zod majors coexist in the lockfile (one via the workspace catalog, one
transitive), any package that types against "zod" without declaring it as a
dependency can resolve the *other* major, producing sudden mass TS2345 errors
(mentioning v4 internals like `$ZodTypeInternals`) at every call site.

**Why:** the dependency's d.ts falls back to the hoisted copy, which need not
match the workspace's pinned version. The failure is latent — it surfaces only
when something (e.g. codegen) invalidates the tsc incremental cache.

**How to apply:** don't cast at call sites. Declare the missing dep via
`packageExtensions` in `pnpm-workspace.yaml` (e.g. give the package a
`zod: '*'` peer) and reinstall, so its types resolve to the consumer's version.
