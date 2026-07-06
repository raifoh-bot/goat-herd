import { doublePrecision, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { farmsTable } from "./farms";
import { goatsTable } from "./goats";

export const healthEventsTable = pgTable("health_events", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull().references(() => farmsTable.id),
  goatId: integer("goat_id").notNull().references(() => goatsTable.id),
  eventType: text("event_type", {
    enum: ["hoof_trim", "cdt_shot", "copper_bolus", "famacha", "deworming", "other"],
  }).notNull(),
  eventDate: timestamp("event_date").notNull(),
  famachaScore: integer("famacha_score"),
  dosageMl: doublePrecision("dosage_ml"),
  bodyWeight: doublePrecision("body_weight"),
  productName: text("product_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertHealthEventSchema = createInsertSchema(healthEventsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHealthEvent = z.infer<typeof insertHealthEventSchema>;
export type HealthEvent = typeof healthEventsTable.$inferSelect;
