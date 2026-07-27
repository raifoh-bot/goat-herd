import { boolean, doublePrecision, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { farmsTable } from "./farms";
import { goatsTable } from "./goats";

/**
 * One sale record per sold goat: who bought it, when, for how much, and
 * whether registration papers were transferred. Creating a sale also flips
 * the goat's herdStatus to sold-registered / sold-not-registered.
 */
export const goatSalesTable = pgTable("goat_sales", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull().references(() => farmsTable.id),
  goatId: integer("goat_id").notNull().references(() => goatsTable.id),
  saleDate: timestamp("sale_date").notNull(),
  buyerName: text("buyer_name").notNull(),
  buyerContact: text("buyer_contact"),
  salePrice: doublePrecision("sale_price"),
  registrationTransferred: boolean("registration_transferred").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGoatSaleSchema = createInsertSchema(goatSalesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGoatSale = z.infer<typeof insertGoatSaleSchema>;
export type GoatSale = typeof goatSalesTable.$inferSelect;
