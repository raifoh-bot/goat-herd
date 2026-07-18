import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, goatsTable, showResultsTable, showsTable } from "@workspace/db";
import {
  CreateShowBody,
  CreateShowResultsBody,
  CreateShowResultsParams,
  DeleteShowParams,
  DeleteShowResultParams,
  GetGoatAccoladesParams,
  GetShowParams,
  UpdateShowBody,
  UpdateShowParams,
  UpdateShowResultBody,
  UpdateShowResultParams,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { farmId } from "../middlewares/tenant";
import type { Request } from "express";

const router: IRouter = Router();

// Show results are read-only for Farm Hands; only Admin/Owner may create,
// edit, or delete shows and their results.
const requireManager = requireRole("admin", "owner");

/** Returns the show only if it belongs to the request's farm; otherwise null. */
async function findFarmShow(req: Request, showId: number) {
  if (!Number.isInteger(showId)) return null;
  const [show] = await db
    .select()
    .from(showsTable)
    .where(and(eq(showsTable.id, showId), eq(showsTable.farmId, farmId(req))))
    .limit(1);
  return show ?? null;
}

// GET /shows — the farm's shows, most recent show date first.
router.get("/shows", async (req, res): Promise<void> => {
  const shows = await db
    .select()
    .from(showsTable)
    .where(eq(showsTable.farmId, farmId(req)))
    .orderBy(desc(showsTable.showDate), desc(showsTable.id));
  res.json(shows);
});

// POST /shows — create a show (Admin/Owner only).
router.post("/shows", requireManager, async (req, res): Promise<void> => {
  const parsed = CreateShowBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [show] = await db
    .insert(showsTable)
    .values({
      farmId: farmId(req),
      name: parsed.data.name.trim(),
      location: parsed.data.location?.trim() || null,
      showDate: new Date(parsed.data.showDate),
      notes: parsed.data.notes?.trim() || null,
    })
    .returning();
  res.status(201).json(show);
});

// GET /shows/:id — show detail with all result rows (goat names joined).
router.get("/shows/:id", async (req, res): Promise<void> => {
  const params = GetShowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const show = await findFarmShow(req, params.data.id);
  if (!show) {
    res.status(404).json({ error: "Show not found" });
    return;
  }

  const results = await db
    .select({
      id: showResultsTable.id,
      showId: showResultsTable.showId,
      goatId: showResultsTable.goatId,
      judgeName: showResultsTable.judgeName,
      classDivision: showResultsTable.classDivision,
      placement: showResultsTable.placement,
      awardRibbon: showResultsTable.awardRibbon,
      notes: showResultsTable.notes,
      createdAt: showResultsTable.createdAt,
      updatedAt: showResultsTable.updatedAt,
      goatName: goatsTable.name,
    })
    .from(showResultsTable)
    .innerJoin(goatsTable, eq(showResultsTable.goatId, goatsTable.id))
    .where(and(eq(showResultsTable.showId, show.id), eq(showResultsTable.farmId, farmId(req))))
    .orderBy(showResultsTable.id);

  res.json({ ...show, results });
});

// PUT /shows/:id — update show header details (Admin/Owner only).
router.put("/shows/:id", requireManager, async (req, res): Promise<void> => {
  const params = UpdateShowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateShowBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const show = await findFarmShow(req, params.data.id);
  if (!show) {
    res.status(404).json({ error: "Show not found" });
    return;
  }

  const data = parsed.data;
  const [updated] = await db
    .update(showsTable)
    .set({
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.location !== undefined ? { location: data.location?.trim() || null } : {}),
      ...(data.showDate !== undefined ? { showDate: new Date(data.showDate) } : {}),
      ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(showsTable.id, show.id), eq(showsTable.farmId, farmId(req))))
    .returning();
  res.json(updated);
});

// DELETE /shows/:id — delete a show and cascade its results (Admin/Owner only).
router.delete("/shows/:id", requireManager, async (req, res): Promise<void> => {
  const params = DeleteShowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const deleted = await db.transaction(async (tx) => {
    await tx
      .delete(showResultsTable)
      .where(
        and(eq(showResultsTable.showId, params.data.id), eq(showResultsTable.farmId, farmId(req))),
      );
    const [show] = await tx
      .delete(showsTable)
      .where(and(eq(showsTable.id, params.data.id), eq(showsTable.farmId, farmId(req))))
      .returning();
    return show;
  });

  if (!deleted) {
    res.status(404).json({ error: "Show not found" });
    return;
  }
  res.sendStatus(204);
});

// POST /shows/:id/results — add a batch of result rows (Admin/Owner only).
router.post("/shows/:id/results", requireManager, async (req, res): Promise<void> => {
  const params = CreateShowResultsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateShowResultsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const show = await findFarmShow(req, params.data.id);
  if (!show) {
    res.status(404).json({ error: "Show not found" });
    return;
  }

  // Every goat in the batch must belong to this farm; otherwise reject the
  // whole batch so a partial write never happens.
  const fid = farmId(req);
  const goatIds = Array.from(new Set(parsed.data.results.map((r) => r.goatId)));
  const farmGoats = await db
    .select({ id: goatsTable.id })
    .from(goatsTable)
    .where(and(eq(goatsTable.farmId, fid), inArray(goatsTable.id, goatIds)));
  if (farmGoats.length !== goatIds.length) {
    res.status(404).json({ error: "One or more goats were not found in this farm" });
    return;
  }

  const rows = parsed.data.results.map((r) => ({
    farmId: fid,
    showId: show.id,
    goatId: r.goatId,
    judgeName: r.judgeName?.trim() || null,
    classDivision: r.classDivision?.trim() || null,
    placement: r.placement?.trim() || null,
    awardRibbon: r.awardRibbon?.trim() || null,
    notes: r.notes?.trim() || null,
  }));
  const created = await db.insert(showResultsTable).values(rows).returning();
  res.status(201).json(created);
});

// PUT /shows/:id/results/:resultId — update one result row (Admin/Owner only).
router.put(
  "/shows/:id/results/:resultId",
  requireManager,
  async (req, res): Promise<void> => {
    const params = UpdateShowResultParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = UpdateShowResultBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const show = await findFarmShow(req, params.data.id);
    if (!show) {
      res.status(404).json({ error: "Show not found" });
      return;
    }

    const data = parsed.data;
    const [updated] = await db
      .update(showResultsTable)
      .set({
        ...(data.judgeName !== undefined ? { judgeName: data.judgeName?.trim() || null } : {}),
        ...(data.classDivision !== undefined
          ? { classDivision: data.classDivision?.trim() || null }
          : {}),
        ...(data.placement !== undefined ? { placement: data.placement?.trim() || null } : {}),
        ...(data.awardRibbon !== undefined
          ? { awardRibbon: data.awardRibbon?.trim() || null }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(showResultsTable.id, params.data.resultId),
          eq(showResultsTable.showId, show.id),
          eq(showResultsTable.farmId, farmId(req)),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Show result not found" });
      return;
    }
    res.json(updated);
  },
);

// DELETE /shows/:id/results/:resultId — delete one result row (Admin/Owner only).
router.delete(
  "/shows/:id/results/:resultId",
  requireManager,
  async (req, res): Promise<void> => {
    const params = DeleteShowResultParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const show = await findFarmShow(req, params.data.id);
    if (!show) {
      res.status(404).json({ error: "Show not found" });
      return;
    }

    const deleted = await db
      .delete(showResultsTable)
      .where(
        and(
          eq(showResultsTable.id, params.data.resultId),
          eq(showResultsTable.showId, show.id),
          eq(showResultsTable.farmId, farmId(req)),
        ),
      )
      .returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "Show result not found" });
      return;
    }
    res.sendStatus(204);
  },
);

// GET /goats/:id/accolades — a goat's results grouped by show, newest first.
router.get("/goats/:id/accolades", async (req, res): Promise<void> => {
  const params = GetGoatAccoladesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const fid = farmId(req);
  const [goat] = await db
    .select({ id: goatsTable.id })
    .from(goatsTable)
    .where(and(eq(goatsTable.id, params.data.id), eq(goatsTable.farmId, fid)))
    .limit(1);
  if (!goat) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  const rows = await db
    .select({ show: showsTable, result: showResultsTable })
    .from(showResultsTable)
    .innerJoin(showsTable, eq(showResultsTable.showId, showsTable.id))
    .where(and(eq(showResultsTable.goatId, goat.id), eq(showResultsTable.farmId, fid)))
    .orderBy(desc(showsTable.showDate), desc(showsTable.id), showResultsTable.id);

  const grouped: Array<{ show: typeof rows[number]["show"]; results: Array<typeof rows[number]["result"]> }> = [];
  const byShow = new Map<number, (typeof grouped)[number]>();
  for (const row of rows) {
    let entry = byShow.get(row.show.id);
    if (!entry) {
      entry = { show: row.show, results: [] };
      byShow.set(row.show.id, entry);
      grouped.push(entry);
    }
    entry.results.push(row.result);
  }

  res.json(grouped);
});

export default router;
