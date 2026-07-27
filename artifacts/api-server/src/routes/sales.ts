import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, goatSalesTable, goatsTable } from "@workspace/db";
import { CreateGoatSaleBody, UpdateGoatSaleBody, GetGoatParams } from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { farmId } from "../middlewares/tenant";
import { sendCsv } from "../lib/csv";

const router: IRouter = Router();

// Sale records change the herd's composition; only Admin/Owner may write.
const requireManager = requireRole("admin", "owner");

/** The sold herd status implied by whether registration papers moved. */
function soldStatus(registrationTransferred: boolean): "sold-registered" | "sold-not-registered" {
  return registrationTransferred ? "sold-registered" : "sold-not-registered";
}

// List every sale record for the farm (newest sale first), with the sold
// goat's name joined for display. Read-only, so any farm member may view.
router.get("/goat-sales", async (req, res): Promise<void> => {
  const sales = await db
    .select({
      id: goatSalesTable.id,
      goatId: goatSalesTable.goatId,
      saleDate: goatSalesTable.saleDate,
      buyerName: goatSalesTable.buyerName,
      buyerContact: goatSalesTable.buyerContact,
      salePrice: goatSalesTable.salePrice,
      registrationTransferred: goatSalesTable.registrationTransferred,
      notes: goatSalesTable.notes,
      createdAt: goatSalesTable.createdAt,
      updatedAt: goatSalesTable.updatedAt,
      goatName: goatsTable.name,
    })
    .from(goatSalesTable)
    .innerJoin(goatsTable, eq(goatSalesTable.goatId, goatsTable.id))
    .where(eq(goatSalesTable.farmId, farmId(req)))
    .orderBy(desc(goatSalesTable.saleDate), desc(goatSalesTable.id));

  res.json(sales);
});

// Export the sales log as a CSV download. Read-only, any farm member.
router.get("/goat-sales/export", async (req, res): Promise<void> => {
  const sales = await db
    .select({
      saleDate: goatSalesTable.saleDate,
      goatName: goatsTable.name,
      buyerName: goatSalesTable.buyerName,
      buyerContact: goatSalesTable.buyerContact,
      salePrice: goatSalesTable.salePrice,
      registrationTransferred: goatSalesTable.registrationTransferred,
      notes: goatSalesTable.notes,
    })
    .from(goatSalesTable)
    .innerJoin(goatsTable, eq(goatSalesTable.goatId, goatsTable.id))
    .where(eq(goatSalesTable.farmId, farmId(req)))
    .orderBy(desc(goatSalesTable.saleDate), desc(goatSalesTable.id));

  const headers = [
    "saleDate",
    "goatName",
    "buyerName",
    "buyerContact",
    "salePrice",
    "registrationTransferred",
    "notes",
  ];
  const rows = sales.map((s) => [
    s.saleDate,
    s.goatName,
    s.buyerName,
    s.buyerContact,
    s.salePrice,
    s.registrationTransferred,
    s.notes,
  ]);

  sendCsv(res, `${req.farm!.slug}-sales`, headers, rows);
});

// Record a goat sale: create the sale row and atomically flip the goat's
// herd status to the matching sold-* value, in one transaction.
router.post("/goat-sales", requireManager, async (req, res): Promise<void> => {
  const parsed = CreateGoatSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [goat] = await db
    .select({ id: goatsTable.id })
    .from(goatsTable)
    .where(and(eq(goatsTable.id, parsed.data.goatId), eq(goatsTable.farmId, farmId(req))));
  if (!goat) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  const [existingSale] = await db
    .select({ id: goatSalesTable.id })
    .from(goatSalesTable)
    .where(and(eq(goatSalesTable.goatId, parsed.data.goatId), eq(goatSalesTable.farmId, farmId(req))));
  if (existingSale) {
    res.status(409).json({ error: "This goat already has a sale record" });
    return;
  }

  try {
    const sale = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(goatSalesTable)
        .values({
          farmId: farmId(req),
          goatId: parsed.data.goatId,
          saleDate: new Date(parsed.data.saleDate),
          buyerName: parsed.data.buyerName,
          buyerContact: parsed.data.buyerContact ?? null,
          salePrice: parsed.data.salePrice ?? null,
          registrationTransferred: parsed.data.registrationTransferred,
          notes: parsed.data.notes ?? null,
        })
        .returning();
      await tx
        .update(goatsTable)
        .set({ herdStatus: soldStatus(parsed.data.registrationTransferred), updatedAt: new Date() })
        .where(and(eq(goatsTable.id, parsed.data.goatId), eq(goatsTable.farmId, farmId(req))));
      return created;
    });
    res.status(201).json(sale);
  } catch (error) {
    // The unique goat_id index closes the race where two concurrent requests
    // both pass the pre-check above.
    if (error instanceof Error && error.message.includes("goat_sales_goat_id_key")) {
      res.status(409).json({ error: "This goat already has a sale record" });
      return;
    }
    throw error;
  }
});

// Edit an existing sale record. If the registration flag changes, the goat's
// sold herd status is updated to match in the same transaction.
router.put("/goat-sales/:id", requireManager, async (req, res): Promise<void> => {
  const params = GetGoatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateGoatSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(goatSalesTable)
    .where(and(eq(goatSalesTable.id, params.data.id), eq(goatSalesTable.farmId, farmId(req))));
  if (!existing) {
    res.status(404).json({ error: "Sale record not found" });
    return;
  }

  const sale = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(goatSalesTable)
      .set({
        ...(parsed.data.saleDate !== undefined ? { saleDate: new Date(parsed.data.saleDate) } : {}),
        ...(parsed.data.buyerName !== undefined ? { buyerName: parsed.data.buyerName } : {}),
        ...(parsed.data.buyerContact !== undefined ? { buyerContact: parsed.data.buyerContact } : {}),
        ...(parsed.data.salePrice !== undefined ? { salePrice: parsed.data.salePrice } : {}),
        ...(parsed.data.registrationTransferred !== undefined
          ? { registrationTransferred: parsed.data.registrationTransferred }
          : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(goatSalesTable.id, params.data.id), eq(goatSalesTable.farmId, farmId(req))))
      .returning();

    if (
      parsed.data.registrationTransferred !== undefined &&
      parsed.data.registrationTransferred !== existing.registrationTransferred
    ) {
      await tx
        .update(goatsTable)
        .set({ herdStatus: soldStatus(parsed.data.registrationTransferred), updatedAt: new Date() })
        .where(and(eq(goatsTable.id, existing.goatId), eq(goatsTable.farmId, farmId(req))));
    }
    return updated;
  });

  res.json(sale);
});

// Delete a sale record. If the goat still carries a sold herd status it is
// restored to on-farm in the same transaction; if the user already moved the
// goat to another status, that status is left untouched.
router.delete("/goat-sales/:id", requireManager, async (req, res): Promise<void> => {
  const params = GetGoatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // The delete and the status revert run in one transaction, and the revert
  // is driven by the row the DELETE itself returned — so a concurrent request
  // can never revert a goat based on stale pre-read data.
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(goatSalesTable)
      .where(and(eq(goatSalesTable.id, params.data.id), eq(goatSalesTable.farmId, farmId(req))))
      .returning({ goatId: goatSalesTable.goatId });
    if (!row) return false;

    // Only restore to on-farm if the goat still carries a sold status AND has
    // no other sale record (defensive: the unique goat_id index should make a
    // second sale impossible, but the revert must never mask one).
    const [replacement] = await tx
      .select({ id: goatSalesTable.id })
      .from(goatSalesTable)
      .where(and(eq(goatSalesTable.goatId, row.goatId), eq(goatSalesTable.farmId, farmId(req))));
    if (!replacement) {
      const [goat] = await tx
        .select({ herdStatus: goatsTable.herdStatus })
        .from(goatsTable)
        .where(and(eq(goatsTable.id, row.goatId), eq(goatsTable.farmId, farmId(req))));
      if (goat && (goat.herdStatus === "sold-registered" || goat.herdStatus === "sold-not-registered")) {
        await tx
          .update(goatsTable)
          .set({ herdStatus: "on-farm", updatedAt: new Date() })
          .where(and(eq(goatsTable.id, row.goatId), eq(goatsTable.farmId, farmId(req))));
      }
    }
    return true;
  });

  if (!deleted) {
    res.status(404).json({ error: "Sale record not found" });
    return;
  }

  res.status(204).end();
});

// Fetch the sale record for a single goat — null when the goat is unsold.
router.get("/goats/:id/sale", async (req, res): Promise<void> => {
  const params = GetGoatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [goat] = await db
    .select({ id: goatsTable.id })
    .from(goatsTable)
    .where(and(eq(goatsTable.id, params.data.id), eq(goatsTable.farmId, farmId(req))));
  if (!goat) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  const [sale] = await db
    .select()
    .from(goatSalesTable)
    .where(and(eq(goatSalesTable.goatId, params.data.id), eq(goatSalesTable.farmId, farmId(req))));

  res.json(sale ?? null);
});

export default router;
