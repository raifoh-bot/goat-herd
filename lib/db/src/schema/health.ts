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
    enum: ["hoof_trim", "cdt_shot", "copper_bolus", "famacha", "deworming", "cidr", "parasites", "other"],
  }).notNull(),
  eventDate: timestamp("event_date").notNull(),
  // CIDR-only fields: how many days the device stays in (removal date =
  // eventDate + treatmentDays) and any co-treatments given at insertion.
  treatmentDays: integer("treatment_days"),
  coTreatments: text("co_treatments"),
  famachaScore: integer("famacha_score"),
  // Parasites-only fields: which parasite was found, the egg-count load from a
  // fecal test (eggs per gram — relevant for barber pole worm), and the
  // treatment regimen (product + dosing schedule, for coccidia/other).
  parasiteType: text("parasite_type", {
    enum: ["barber_pole", "coccidia", "other"],
  }),
  eggCount: integer("egg_count"),
  treatmentRegimen: text("treatment_regimen"),
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
