import { Router, type IRouter } from "express";
import { count, desc, eq } from "drizzle-orm";
import { db, goatsTable } from "@workspace/db";
import { farmId } from "../middlewares/tenant";
import { withImageAlias } from "../lib/goatImage";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const allGoats = await db.select().from(goatsTable).where(eq(goatsTable.farmId, farmId(req)));
  // Herd totals reflect animals actually on the farm: exclude dead, sold, and
  // leased-out goats. A goat can be leased out via either the newer
  // `herdStatus === "leased"` value or the older `leasedBuck` flag, so honor
  // both — otherwise a leased buck missing the flag inflates the buck count.
  const ownedGoats = allGoats.filter(
    (g) =>
      !g.leasedBuck &&
      g.herdStatus !== "dead" &&
      g.herdStatus !== "sold" &&
      g.herdStatus !== "leased",
  );
  const totalGoats = ownedGoats.length;

  const doeCount = ownedGoats.filter((g) => g.sex === "doe").length;
  const buckCount = ownedGoats.filter((g) => g.sex === "buck").length;
  const wetherCount = ownedGoats.filter((g) => g.sex === "wether").length;

  const does = ownedGoats.filter((g) => g.sex === "doe");
  const doeLactationBreakdown = {
    milking: does.filter((g) => g.lactationStatus === "milking").length,
    dry: does.filter((g) => g.lactationStatus === "dry").length,
    exposed: does.filter((g) => g.lactationStatus === "exposed").length,
    serviced: does.filter((g) => g.lactationStatus === "serviced").length,
    pregnant: does.filter((g) => g.lactationStatus === "pregnant").length,
    kid: does.filter((g) => g.lactationStatus === "kid").length,
    retired: does.filter((g) => g.lactationStatus === "retired").length,
  };

  const healthyCount = ownedGoats.filter((g) => g.status === "healthy").length;
  const treatmentCount = ownedGoats.filter((g) => g.status === "treatment").length;
  const dryCount = ownedGoats.filter((g) => g.status === "dry").length;
  const milkingCount = ownedGoats.filter((g) => g.lactationStatus === "milking").length;

  const averageMilkPerDay =
    totalGoats > 0
      ? ownedGoats.reduce((sum, g) => sum + g.milkPerDay, 0) / totalGoats
      : 0;

  const topProducer =
    totalGoats > 0
      ? withImageAlias(
          ownedGoats.reduce((best, g) => (g.milkPerDay > best.milkPerDay ? g : best)),
        )
      : null;

  res.json({
    totalGoats,
    doeCount,
    buckCount,
    wetherCount,
    healthyCount,
    treatmentCount,
    milkingCount,
    dryCount,
    averageMilkPerDay: Math.round(averageMilkPerDay * 10) / 10,
    doeLactationBreakdown,
    topProducer,
  });
});

router.get("/dashboard/breed-breakdown", async (req, res): Promise<void> => {
  const breakdown = await db
    .select({
      breed: goatsTable.breed,
      count: count(),
    })
    .from(goatsTable)
    .where(eq(goatsTable.farmId, farmId(req)))
    .groupBy(goatsTable.breed);

  res.json(breakdown);
});

router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  const recent = await db
    .select()
    .from(goatsTable)
    .where(eq(goatsTable.farmId, farmId(req)))
    .orderBy(desc(goatsTable.updatedAt))
    .limit(5);

  res.json(recent.map(withImageAlias));
});

export default router;
