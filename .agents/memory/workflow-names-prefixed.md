---
name: Workflow names are artifact-prefixed
description: How to address workflows in this monorepo when restarting services.
---
Workflows in this pnpm-monorepo project are named `artifacts/<dir>: <service name>` (e.g. `artifacts/api-server: API Server`, `artifacts/fairy-goat-herd: web`).

**Why:** Calling restart with the bare service name ("API Server") fails with RUN_COMMAND_NOT_FOUND, which looks like the workflow doesn't exist even though it's running.

**How to apply:** Use `listWorkflows()` in the code-execution sandbox to get exact names, then `restartWorkflow({ workflowName })` with the full prefixed name. Remember the api-server dev workflow has no watch — restart it after server code changes.
