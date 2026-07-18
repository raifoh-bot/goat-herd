import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { farmsTable } from "./farms";
import { goatsTable } from "./goats";

export const showsTable = pgTable("shows", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull().references(() => farmsTable.id),
  name: text("name").notNull(),
  location: text("location"),
  showDate: timestamp("show_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const showResultsTable = pgTable("show_results", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull().references(() => farmsTable.id),
  showId: integer("show_id").notNull().references(() => showsTable.id),
  goatId: integer("goat_id").notNull().references(() => goatsTable.id),
  judgeName: text("judge_name"),
  classDivision: text("class_division"),
  placement: text("placement"),
  awardRibbon: text("award_ribbon"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertShowSchema = createInsertSchema(showsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertShowResultSchema = createInsertSchema(showResultsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertShow = z.infer<typeof insertShowSchema>;
export type Show = typeof showsTable.$inferSelect;
export type InsertShowResult = z.infer<typeof insertShowResultSchema>;
export type ShowResult = typeof showResultsTable.$inferSelect;
