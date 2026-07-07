import { boolean, integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { farmsTable } from "./farms";

/**
 * One dashboard widget's persisted state: visibility plus its placement on the
 * 12-column snap grid. The x/y/w/h coordinates are optional so layouts saved
 * before drag-and-resize shipped (id + visible only) still validate and are
 * forward-migrated with default coordinates on the next save.
 */
export type DashboardWidgetLayout = {
  id: string;
  visible: boolean;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
};

/** Event types a farm can put on a routine repeating schedule. */
export type SchedulableEventType = "hoof_trim" | "cdt_shot" | "copper_bolus" | "deworming";

/** Per-event-type routine interval in days. Absent types have no schedule. */
export type HealthScheduleIntervals = Partial<Record<SchedulableEventType, number>>;

/**
 * Breeds a farm has enabled by default. Single source of truth: used both as the
 * column default below and to synthesize in-memory defaults for read-only callers
 * (e.g. a superadmin viewing a farm) so they never trigger a write.
 */
export const DEFAULT_ENABLED_BREEDS: string[] = [
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
];

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
    .default(DEFAULT_ENABLED_BREEDS),
  dashboardLayout: jsonb("dashboard_layout").$type<DashboardWidgetLayout[]>(),
  famachaThreshold: integer("famacha_threshold").notNull().default(3),
  healthScheduleIntervals: jsonb("health_schedule_intervals").$type<HealthScheduleIntervals>(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFarmSettingsSchema = createInsertSchema(farmSettingsTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertFarmSettings = z.infer<typeof insertFarmSettingsSchema>;
export type FarmSettings = typeof farmSettingsTable.$inferSelect;
