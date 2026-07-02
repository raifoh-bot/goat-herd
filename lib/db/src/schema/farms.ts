import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const farmStatuses = ["active", "suspended"] as const;
export type FarmStatus = (typeof farmStatuses)[number];

export const farmsTable = pgTable("farms", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: text("status", { enum: farmStatuses }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // Soft-delete audit trail. A non-null `deletedAt` hides the farm from the
  // active roster and blocks its users from signing in, while preserving the
  // record (and reason) of the deletion for the super-admin.
  deletedAt: timestamp("deleted_at"),
  deletedReason: text("deleted_reason"),
  deletedByUsername: text("deleted_by_username"),
});

export const insertFarmSchema = createInsertSchema(farmsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFarm = z.infer<typeof insertFarmSchema>;
export type Farm = typeof farmsTable.$inferSelect;
