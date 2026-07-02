import { integer, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Platform-wide (super-admin) configuration. A single-row table: the whole
 * platform shares one set of status thresholds, so there is never more than one
 * row (id is effectively always 1).
 *
 * The thresholds drive how farm health is surfaced on the super-admin
 * dashboard:
 *  - `abandonedAfterDays` — a farm with no activity for at least this many days
 *    (measured from its last activity, or its creation date when it has never
 *    been active) is flagged "Abandoned".
 *  - `activeWithinDays` / `idleWithinDays` — the "Last active" column is shown
 *    green when activity is within `activeWithinDays`, yellow within
 *    `idleWithinDays`, and red beyond that.
 */
export const platformSettingsTable = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  abandonedAfterDays: integer("abandoned_after_days").notNull().default(90),
  activeWithinDays: integer("active_within_days").notNull().default(7),
  idleWithinDays: integer("idle_within_days").notNull().default(30),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPlatformSettingsSchema = createInsertSchema(platformSettingsTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertPlatformSettings = z.infer<typeof insertPlatformSettingsSchema>;
export type PlatformSettings = typeof platformSettingsTable.$inferSelect;
