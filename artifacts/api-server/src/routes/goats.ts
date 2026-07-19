import { Router, type IRouter } from "express";
import { and, arrayOverlaps, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db, goatsTable, healthEventsTable } from "@workspace/db";
import {
  AddGoatPhotoBody,
  AddGoatPhotoParams,
  CreateGoatBody,
  DeleteGoatParams,
  GetGoatParams,
  ImportGoatsBody,
  ListGoatsQueryParams,
  SetGoatDefaultPhotoBody,
  SetGoatDefaultPhotoParams,
  UpdateGoatBody,
  UpdateGoatParams,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { farmId } from "../middlewares/tenant";
import { sendCsv } from "../lib/csv";
import { withImageAlias } from "../lib/goatImage";
import {
  ObjectStorageService,
  canonicalUploadObjectPath,
  uploadObjectPathVariants,
} from "../lib/objectStorage";
import type { Request } from "express";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Goats are read-only for Farm Hands; only Admin/Owner may create, edit, or delete.
const requireManager = requireRole("admin", "owner");

// Best-effort cleanup of orphaned photo objects in Object Storage. Never throws
// — storage failures are logged so they can't block the goat delete/update that
// already succeeded in the database.
//
// A photo object is deleted only once NO goat (in any farm) still references it.
// Photo URLs live in the user-controllable `imageUrls` field, so without this
// guard a farm admin could point a goat at another farm's photo, then remove it,
// to trigger deletion of an object they don't own. Since deletion runs after the
// owning goat's row has already been updated/deleted, a lingering reference means
// the object still belongs to someone else — so we leave it alone.
async function deletePhotoObjects(req: Request, paths: Array<string | null | undefined>): Promise<void> {
  for (const path of paths) {
    if (!path) continue;
    try {
      // Canonicalize first so the reference check and the deletion act on the
      // exact same underlying object. Non-upload/crafted paths canonicalize to
      // null and are skipped entirely.
      const canonical = canonicalUploadObjectPath(path);
      if (!canonical) {
        continue;
      }

      // Only delete once NO goat references the object in ANY of its accepted
      // path representations. Checking every variant closes the bypass where a
      // row stores `/api/storage/objects/...` while the delete request uses the
      // bare `/objects/...` form (or vice versa).
      const [stillReferenced] = await db
        .select({ id: goatsTable.id })
        .from(goatsTable)
        .where(arrayOverlaps(goatsTable.imageUrls, uploadObjectPathVariants(canonical)))
        .limit(1);

      if (stillReferenced) {
        continue;
      }

      await objectStorageService.deleteObjectEntity(canonical);
    } catch (error) {
      req.log.error({ err: error, objectPath: path }, "Failed to delete orphaned goat photo");
    }
  }
}

router.get("/goats", async (req, res): Promise<void> => {
  const params = ListGoatsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const conditions = [eq(goatsTable.farmId, farmId(req))];
  if (params.data.status === "on-farm") {
    // "On Farm" is an inclusion filter: boarding goats live on the farm too,
    // and goats recorded before herd status existed (null) count as on-farm.
    conditions.push(
      or(
        isNull(goatsTable.herdStatus),
        inArray(goatsTable.herdStatus, ["on-farm", "on-farm-boarding"]),
      )!,
    );
  } else if (params.data.status) {
    conditions.push(eq(goatsTable.herdStatus, params.data.status));
  }
  if (params.data.sex) {
    conditions.push(eq(goatsTable.sex, params.data.sex));
  }

  const goats = await db
    .select()
    .from(goatsTable)
    .where(and(...conditions))
    .orderBy(desc(goatsTable.createdAt));

  res.json(goats.map(withImageAlias));
});

router.post("/goats", requireManager, async (req, res): Promise<void> => {
  const parsed = CreateGoatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Pregnancy-related breeding statuses only apply to does; bucks and wethers
  // may only carry "retired" (retired from breeding use).
  const createData = { ...parsed.data, farmId: farmId(req) };
  if ((createData.sex === "buck" || createData.sex === "wether") && createData.breedingStatus !== "retired") {
    createData.breedingStatus = null;
  }

  const [goat] = await db.insert(goatsTable).values(createData).returning();
  res.status(201).json(withImageAlias(goat));
});

router.post("/goats/import", requireManager, async (req, res): Promise<void> => {
  const parsed = ImportGoatsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let imported = 0;
  const errors: string[] = [];

  for (let i = 0; i < parsed.data.goats.length; i++) {
    const row = parsed.data.goats[i];
    try {
      await db.insert(goatsTable).values({
        farmId: farmId(req),
        name: row.name,
        registeredName: row.registeredName ?? null,
        adgaId: row.adgaId ?? null,
        sex: row.sex ?? null,
        breed: row.breed,
        dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
        damName: row.damName ?? "",
        sireName: row.sireName ?? "",
        maternalGranddamName: row.maternalGranddamName ?? "",
        maternalGrandsireName: row.maternalGrandsireName ?? "",
        paternalGranddamName: row.paternalGranddamName ?? "",
        paternalGrandsireName: row.paternalGrandsireName ?? "",
        rightEarTattoo: row.rightEarTattoo ? row.rightEarTattoo.slice(0, 4) : null,
        leftEarTattoo: row.leftEarTattoo ? row.leftEarTattoo.slice(0, 4) : null,
        rightTailTattoo: row.rightTailTattoo ? row.rightTailTattoo.slice(0, 4) : null,
        leftTailTattoo: row.leftTailTattoo ? row.leftTailTattoo.slice(0, 4) : null,
        centerTailTattoo: row.centerTailTattoo ? row.centerTailTattoo.slice(0, 8) : null,
        eidNumber: row.eidNumber ?? null,
        lactationStatus: row.lactationStatus ?? null,
        breedingStatus:
          (row.sex === "buck" || row.sex === "wether") && row.breedingStatus !== "retired"
            ? null
            : (row.breedingStatus ?? null),
      });
      imported++;
    } catch (err) {
      errors.push(`Row ${i + 1} (${row.name}): ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  res.status(201).json({ imported, skipped: parsed.data.goats.length - imported - errors.length, errors });
});

// Export the farm's full herd as a CSV download. Read-only, so any
// authenticated farm member (including Farm Hands) may export.
router.get("/goats/export", async (req, res): Promise<void> => {
  const goats = await db
    .select()
    .from(goatsTable)
    .where(eq(goatsTable.farmId, farmId(req)))
    .orderBy(desc(goatsTable.createdAt));

  const headers = [
    "id",
    "name",
    "registeredName",
    "adgaId",
    "sex",
    "breed",
    "status",
    "herdStatus",
    "lactationStatus",
    "breedingStatus",
    "dateOfBirth",
    "damName",
    "sireName",
    "maternalGranddamName",
    "maternalGrandsireName",
    "paternalGranddamName",
    "paternalGrandsireName",
    "milkPerDay",
    "description",
    "imageUrl",
    "createdAt",
  ];

  const rows = goats.map((g) => [
    g.id,
    g.name,
    g.registeredName,
    g.adgaId,
    g.sex,
    g.breed,
    g.status,
    g.herdStatus,
    g.lactationStatus,
    g.breedingStatus,
    g.dateOfBirth,
    g.damName,
    g.sireName,
    g.maternalGranddamName,
    g.maternalGrandsireName,
    g.paternalGranddamName,
    g.paternalGrandsireName,
    g.milkPerDay,
    g.description,
    withImageAlias(g).imageUrl,
    g.createdAt,
  ]);

  sendCsv(res, `${req.farm!.slug}-herd`, headers, rows);
});

router.get("/goats/:id", async (req, res): Promise<void> => {
  const params = GetGoatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [goat] = await db
    .select()
    .from(goatsTable)
    .where(and(eq(goatsTable.id, params.data.id), eq(goatsTable.farmId, farmId(req))));

  if (!goat) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  res.json(withImageAlias(goat));
});

router.put("/goats/:id", requireManager, async (req, res): Promise<void> => {
  const params = UpdateGoatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateGoatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(goatsTable)
    .where(and(eq(goatsTable.id, params.data.id), eq(goatsTable.farmId, farmId(req))));

  if (!existing) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  // Pregnancy-related breeding statuses only apply to does; bucks and wethers
  // may only carry "retired" (retired from breeding use).
  const updateData = { ...parsed.data };
  const effectiveSex = updateData.sex !== undefined ? updateData.sex : existing.sex;
  if (effectiveSex === "buck" || effectiveSex === "wether") {
    const incoming = updateData.breedingStatus !== undefined ? updateData.breedingStatus : existing.breedingStatus;
    updateData.breedingStatus = incoming === "retired" ? "retired" : null;
  }

  const [goat] = await db
    .update(goatsTable)
    .set({ ...updateData, updatedAt: new Date() })
    .where(and(eq(goatsTable.id, params.data.id), eq(goatsTable.farmId, farmId(req))))
    .returning();

  if (!goat) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  // If the photo set changed, clean up any objects that were removed/replaced.
  // Only touches photos no longer referenced by the saved goat.
  if (parsed.data.imageUrls !== undefined) {
    const remaining = new Set(goat.imageUrls ?? []);
    const removed = (existing.imageUrls ?? []).filter((url) => !remaining.has(url));
    if (removed.length > 0) {
      await deletePhotoObjects(req, removed);
    }
  }

  res.json(withImageAlias(goat));
});

// Append a single photo to a goat's photo set. Unlike full goat edits (which
// are Admin/Owner only), this is available to any authenticated farm member —
// including Farm Hands — so photos can be captured in the field.
router.post("/goats/:id/photos", async (req, res): Promise<void> => {
  const params = AddGoatPhotoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddGoatPhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(goatsTable)
    .where(and(eq(goatsTable.id, params.data.id), eq(goatsTable.farmId, farmId(req))));

  if (!existing) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  const currentUrls = existing.imageUrls ?? [];
  if (currentUrls.length >= 4) {
    res.status(400).json({ error: "This goat already has the maximum of 4 photos" });
    return;
  }

  const [goat] = await db
    .update(goatsTable)
    .set({ imageUrls: [...currentUrls, parsed.data.imageUrl], updatedAt: new Date() })
    .where(and(eq(goatsTable.id, params.data.id), eq(goatsTable.farmId, farmId(req))))
    .returning();

  res.json(withImageAlias(goat));
});

// Choose which photo is the goat's default (shown on herd cards, the detail
// hero, and anywhere a single representative image is used). Manager-only.
router.put("/goats/:id/photos/default", requireManager, async (req, res): Promise<void> => {
  const params = SetGoatDefaultPhotoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SetGoatDefaultPhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(goatsTable)
    .where(and(eq(goatsTable.id, params.data.id), eq(goatsTable.farmId, farmId(req))));

  if (!existing) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  const currentUrls = existing.imageUrls ?? [];
  if (parsed.data.index < 0 || parsed.data.index >= currentUrls.length) {
    res.status(400).json({ error: "That photo index is out of range for this goat" });
    return;
  }

  const [goat] = await db
    .update(goatsTable)
    .set({ defaultPhotoIndex: parsed.data.index, updatedAt: new Date() })
    .where(and(eq(goatsTable.id, params.data.id), eq(goatsTable.farmId, farmId(req))))
    .returning();

  res.json(withImageAlias(goat));
});

router.delete("/goats/:id", requireManager, async (req, res): Promise<void> => {
  const params = DeleteGoatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const goat = await db.transaction(async (tx) => {
    // Health events reference the goat; remove them first so the goat row
    // can be deleted without violating the foreign key.
    await tx
      .delete(healthEventsTable)
      .where(
        and(
          eq(healthEventsTable.goatId, params.data.id),
          eq(healthEventsTable.farmId, farmId(req)),
        ),
      );
    const [deleted] = await tx
      .delete(goatsTable)
      .where(and(eq(goatsTable.id, params.data.id), eq(goatsTable.farmId, farmId(req))))
      .returning();
    return deleted;
  });

  if (!goat) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  // Clean up the goat's photo objects so deleted goats don't leave orphaned
  // files behind. Best-effort — failures are logged, not surfaced.
  await deletePhotoObjects(req, goat.imageUrls ?? []);

  res.sendStatus(204);
});

export default router;
