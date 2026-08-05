---
name: Task-merge file corruption
description: How to detect and repair a task-agent merge that mangles a source file
---

A task-agent merge can silently corrupt a file: identical code blocks pasted into many unrelated functions, real route bodies clobbered, and stray statements after `export default`. The build can still succeed (esbuild bundles broken TS if only some entry paths break at runtime) and the failure only surfaces when the server boots — e.g. publish fails with health checks returning 500 while dev workflows (not running) show nothing.

**Why:** happened once in the API routes file; the corrupted commit shipped and blocked publishing.

**How to apply:**
- If a prod publish fails at the promote/health-check step right after task merges, suspect merge corruption: `git log` the crashing file, grep for duplicated blocks (`grep -c` a distinctive line across recent commits) to find the commit that introduced them.
- Repair by restoring the file wholesale from the last good commit, then re-applying only the merge's legitimate additions — use the commit's openapi spec/test changes (which usually merged cleanly) as the contract to reconstruct against, and let the merged tests validate.
- After any batch of task merges, a cheap sanity check is restarting the API workflow and running its test suite before the user republishes.
