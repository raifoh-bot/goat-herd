import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const semenStrawsTable = pgTable("semen_straws", {
  id: serial("id").primaryKey(),
  sireName: text("sire_name").notNull(),
  strawId: text("straw_id"),
  supplier: text("supplier"),
  count: integer("count").notNull().default(0),
  tankLocation: text("tank_location"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSemenStrawSchema = createInsertSchema(semenStrawsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSemenStraw = z.infer<typeof insertSemenStrawSchema>;
export type SemenStraw = typeof semenStrawsTable.$inferSelect;
