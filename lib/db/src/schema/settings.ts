import { boolean, integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { farmsTable } from "./farms";

/** One dashboard widget's persisted visibility/order state. */
export type DashboardWidgetLayout = { id: string; visible: boolean };

export const farmSettingsTable = pgTable("farm_settings", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull().references(() => farmsTable.id).unique(),
  usesAi: boolean("uses_ai").notNull().default(true),
  farmName: text("farm_name").notNull().default("MyGoatHerd"),
  adgaNumber: varchar("adga_number", { length: 50 }),
  logoUrl: text("logo_url"),
  weightUnit: text("weight_unit").notNull().default("lb"),
  gestationDays: integer("gestation_days").notNull().default(150),
  enabledBreeds: text("enabled_breeds")
    .array()
    .notNull()
    .default([
      "alpine",
      "angora",
      "boer",
      "guernsey",
      "kiko",
      "lamancha",
      "mixed",
      "myotonic",
      "nigerian-dwarf",
      "nubian",
      "oberhasli",
      "pygmy",
      "recorded-grade",
      "saanen",
      "sable",
      "savanna",
      "spanish",
      "texmaster",
      "toggenburg",
    ]),
  dashboardLayout: jsonb("dashboard_layout").$type<DashboardWidgetLayout[]>(),
  famachaThreshold: integer("famacha_threshold").notNull().default(3),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFarmSettingsSchema = createInsertSchema(farmSettingsTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertFarmSettings = z.infer<typeof insertFarmSettingsSchema>;
export type FarmSettings = typeof farmSettingsTable.$inferSelect;
