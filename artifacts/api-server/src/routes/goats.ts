import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, goatsTable } from "@workspace/db";
import {
  CreateGoatBody,
  DeleteGoatParams,
  GetGoatParams,
  ListGoatsQueryParams,
  UpdateGoatBody,
  UpdateGoatParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/goats", async (req, res): Promise<void> => {
  const params = ListGoatsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const conditions = [];
  if (params.data.status) {
    conditions.push(eq(goatsTable.status, params.data.status));
  }
  if (params.data.breed) {
    conditions.push(eq(goatsTable.breed, params.data.breed));
  }

  const goats = await db
    .select()
    .from(goatsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(goatsTable.createdAt));

  res.json(goats);
});

router.post("/goats", async (req, res): Promise<void> => {
  const parsed = CreateGoatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [goat] = await db.insert(goatsTable).values(parsed.data).returning();
  res.status(201).json(goat);
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
    .where(eq(goatsTable.id, params.data.id));

  if (!goat) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  res.json(goat);
});

router.put("/goats/:id", async (req, res): Promise<void> => {
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

  const [goat] = await db
    .update(goatsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(goatsTable.id, params.data.id))
    .returning();

  if (!goat) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  res.json(goat);
});

router.delete("/goats/:id", async (req, res): Promise<void> => {
  const params = DeleteGoatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [goat] = await db
    .delete(goatsTable)
    .where(eq(goatsTable.id, params.data.id))
    .returning();

  if (!goat) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
