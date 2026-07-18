import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { farmsTable } from "./farms";

export const semenTanksTable = pgTable("semen_tanks", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull().references(() => farmsTable.id),
  name: text("name").notNull(),
  lastServiceDate: timestamp("last_service_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const semenStrawsTable = pgTable("semen_straws", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull().references(() => farmsTable.id),
  sireName: text("sire_name").notNull(),
  strawId: text("straw_id"),
  supplier: text("supplier"),
  count: integer("count").notNull().default(0),
  // Deprecated free-text location; superseded by tankId but preserved for legacy rows.
  tankLocation: text("tank_location"),
  tankId: integer("tank_id").references(() => semenTanksTable.id),
  sireDamName: text("sire_dam_name"),
  sireSireName: text("sire_sire_name"),
  sirePatGranddamName: text("sire_pat_granddam_name"),
  sirePatGrandsireName: text("sire_pat_grandsire_name"),
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

export const insertSemenTankSchema = createInsertSchema(semenTanksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSemenTank = z.infer<typeof insertSemenTankSchema>;
export type SemenTank = typeof semenTanksTable.$inferSelect;
