import { boolean, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const farmSettingsTable = pgTable("farm_settings", {
  id: serial("id").primaryKey(),
  usesAi: boolean("uses_ai").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFarmSettingsSchema = createInsertSchema(farmSettingsTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertFarmSettings = z.infer<typeof insertFarmSettingsSchema>;
export type FarmSettings = typeof farmSettingsTable.$inferSelect;
