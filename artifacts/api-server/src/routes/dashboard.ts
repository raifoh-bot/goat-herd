import { Router, type IRouter } from "express";
import { desc, sql, eq, count } from "drizzle-orm";
import { db, goatsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const allGoats = await db.select().from(goatsTable);
  const totalGoats = allGoats.length;

  const healthyCount = allGoats.filter((g) => g.status === "healthy").length;
  const sickCount = allGoats.filter((g) => g.status === "sick").length;
  const enchantedCount = allGoats.filter((g) => g.status === "enchanted").length;

  const averageMagicLevel =
    totalGoats > 0
      ? allGoats.reduce((sum, g) => sum + g.magicLevel, 0) / totalGoats
      : 0;

  const highestMagicGoat =
    totalGoats > 0
      ? allGoats.reduce((best, g) =>
          g.magicLevel > best.magicLevel ? g : best
        )
      : null;

  res.json({
    totalGoats,
    healthyCount,
    sickCount,
    enchantedCount,
    averageMagicLevel: Math.round(averageMagicLevel * 10) / 10,
    highestMagicGoat,
  });
});

router.get("/dashboard/element-breakdown", async (_req, res): Promise<void> => {
  const breakdown = await db
    .select({
      element: goatsTable.element,
      count: count(),
    })
    .from(goatsTable)
    .groupBy(goatsTable.element);

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
