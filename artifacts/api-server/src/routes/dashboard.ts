import { Router, type IRouter } from "express";
import { count, desc } from "drizzle-orm";
import { db, goatsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const allGoats = await db.select().from(goatsTable);
  const totalGoats = allGoats.length;

  const healthyCount = allGoats.filter((g) => g.status === "healthy").length;
  const treatmentCount = allGoats.filter((g) => g.status === "treatment").length;
  const dryCount = allGoats.filter((g) => g.status === "dry").length;
  const milkingCount = allGoats.filter((g) => g.lactationStatus === "milking").length;

  const averageMilkPerDay =
    totalGoats > 0
      ? allGoats.reduce((sum, g) => sum + g.milkPerDay, 0) / totalGoats
      : 0;

  const topProducer =
    totalGoats > 0
      ? allGoats.reduce((best, g) => (g.milkPerDay > best.milkPerDay ? g : best))
      : null;

  res.json({
    totalGoats,
    healthyCount,
    treatmentCount,
    milkingCount,
    dryCount,
    averageMilkPerDay: Math.round(averageMilkPerDay * 10) / 10,
    topProducer,
  });
});

router.get("/dashboard/breed-breakdown", async (_req, res): Promise<void> => {
  const breakdown = await db
    .select({
      breed: goatsTable.breed,
      count: count(),
    })
    .from(goatsTable)
    .groupBy(goatsTable.breed);

  res.json(breakdown);
});

router.get("/dashboard/recent-activity", async (_req, res): Promise<void> => {
  const recent = await db
    .select()
    .from(goatsTable)
    .orderBy(desc(goatsTable.updatedAt))
    .limit(5);

  res.json(recent);
});

export default router;
