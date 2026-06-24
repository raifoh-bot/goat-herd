---
name: api-server dev workflow has no watch
description: Why server code edits don't appear until the API Server workflow is restarted
---

The `artifacts/api-server` dev workflow runs `pnpm run build && pnpm run start`,
which produces a one-shot esbuild bundle (`dist/index.mjs`) and runs it with
node. It is NOT a watcher.

**Consequence:** editing any server-side TypeScript does nothing visible until
you `restart_workflow "artifacts/api-server: API Server"`. The symptom of
forgetting is confusing: endpoints return stale response shapes, and brand-new
routes 404 / fall through to later middleware (e.g. a new `/superadmin/*` route
hitting `requireTenant` → 400 "No farm context") even though the code looks
correct on disk.

**How to apply:** after changing api-server code, always restart that workflow
before curl/end-to-end verification. The frontend (Vite) DOES hot-reload, and
`@workspace/api-zod` / `@workspace/db` resolve to `src` (no build step needed),
so only the server runtime needs the restart.
