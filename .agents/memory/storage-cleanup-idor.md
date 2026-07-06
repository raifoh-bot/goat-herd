---
name: Storage cleanup IDOR guard
description: How to safely delete object-storage files whose paths come from user-controllable fields (e.g. goat.imageUrls).
---

Best-effort object-storage cleanup (deleting orphaned files when a record is
deleted or a photo removed) is a destructive cross-tenant IDOR risk whenever the
object path is read from a user-editable field.

**Rule:** before deleting a storage object referenced from a user-controllable
field, apply BOTH guards:
1. Restrict deletion to the exact object-key shape the app produces (e.g.
   `/objects/uploads/<uuid>`, regex-validated). Blocks path traversal and
   targeting storage internals. Also strip frontend route prefixes first — photo
   URLs are stored as `/api/storage/objects/...`, not the internal `/objects/...`.
2. Only delete once NO row (across all tenants) still references that path.
   Run cleanup AFTER the owning row is updated/deleted, so a lingering reference
   proves the object belongs to a different tenant → skip it.

**Why:** a farm admin could set their goat's imageUrl to another farm's photo
path, then remove it, tricking the server into deleting an object they don't own
(objects aren't farm-scoped in the storage key — uploads share one dir keyed by
random UUID). Two code reviews rejected the naive version for this reason.

**How to apply:** any new "clean up orphaned files" feature (goats, semen, farm
logos, etc.). Keep cleanup best-effort/non-blocking (log failures via req.log),
but never skip the ownership + path-shape checks.
