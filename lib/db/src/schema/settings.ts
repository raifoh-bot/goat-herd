import { boolean, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const farmSettingsTable = pgTable("farm_settings", {
  id: serial("id").primaryKey(),
  usesAi: boolean("uses_ai").notNull().default(true),
  farmName: text("farm_name").notNull().default("MyGoatHerd"),
  adgaNumber: varchar("adga_number", { length: 50 }),
  logoUrl: text("logo_url"),
  weightUnit: text("weight_unit").notNull().default("lb"),
  gestationDays: integer("gestation_days").notNull().default(150),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFarmSettingsSchema = createInsertSchema(farmSettingsTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertFarmSettings = z.infer<typeof insertFarmSettingsSchema>;
export type FarmSettings = typeof farmSettingsTable.$inferSelect;
