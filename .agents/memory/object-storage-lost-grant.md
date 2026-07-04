---
name: Object storage "no allowed resources" (lost bucket grant)
description: Photo/file uploads 500 with sidecar 401 in BOTH dev and prod because the object-storage bucket grant was lost while stale config secrets persist.
---

**Symptom:** `POST /api/storage/uploads/request-url` → 500; server log `Failed to sign object URL, errorcode: 401, make sure you're running on Replit` (objectStorage.ts signObjectURL). Happens in **both dev and production** — NOT deployment-specific, NOT a file-size/PNG issue.

**Root cause:** The Replit object-storage sidecar (`http://127.0.0.1:1106`) has no bucket granted to this environment. Probe evidence:
- `POST /token` → `401 no allowed resources`
- `GET /credential` → 200 but empty unsigned token (`{"alg":"none"}` header, `{}` payload)
- `POST /object-storage/signed-object-url` → 401
The three config values (`DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR`) still exist as **secrets** and point at a bucket that is no longer accessible. Most likely trigger: a project rollback / checkpoint restore that kept the secrets but dropped the platform-side bucket grant.

**Why it doesn't self-heal:** `setupObjectStorage()` is idempotent keyed on those secrets — it returns `alreadySetUp: true` and never re-provisions or re-grants. Re-publishing does nothing because the secrets (and the missing grant) are unchanged.

**How to recover:** The config values are stored as **secrets**, which the agent cannot delete (agent tooling can delete env vars, not secrets). So the user must delete the 3 secrets in the Secrets pane, THEN the agent runs `setupObjectStorage()` (via code_execution) to provision a fresh bucket + grant, which rewrites the 3 secrets. Verify by probing the sidecar `/token` (expect 200) or signed-object-url (expect 200). Then the user re-publishes so production picks up the new secrets. (Alternatively the user re-creates a bucket from the Object Storage tool pane.)

**Quick diagnosis command:** `curl -s -w '%{http_code}' -X POST http://127.0.0.1:1106/token` — `401 no allowed resources` confirms the lost grant.
