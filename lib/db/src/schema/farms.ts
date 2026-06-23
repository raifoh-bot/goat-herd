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
});

export const insertFarmSchema = createInsertSchema(farmsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFarm = z.infer<typeof insertFarmSchema>;
export type Farm = typeof farmsTable.$inferSelect;
