import { doublePrecision, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { goatsTable } from "./goats";

export const breedingsTable = pgTable("breedings", {
  id: serial("id").primaryKey(),
  doeId: integer("doe_id").notNull().references(() => goatsTable.id),
  sireName: text("sire_name").notNull(),
  breedingDate: timestamp("breeding_date").notNull(),
  expectedKiddingDate: timestamp("expected_kidding_date"),
  status: text("status", { enum: ["bred", "confirmed-pregnant", "kidded", "open"] }).notNull().default("bred"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const kidsTable = pgTable("kids", {
  id: serial("id").primaryKey(),
  breedingId: integer("breeding_id").notNull().references(() => breedingsTable.id),
  name: text("name"),
  sex: text("sex", { enum: ["doe", "buck", "doa"] }).notNull(),
  birthDate: timestamp("birth_date"),
  birthWeight: doublePrecision("birth_weight"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBreedingSchema = createInsertSchema(breedingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertKidSchema = createInsertSchema(kidsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertBreeding = z.infer<typeof insertBreedingSchema>;
export type Breeding = typeof breedingsTable.$inferSelect;
export type InsertKid = z.infer<typeof insertKidSchema>;
export type Kid = typeof kidsTable.$inferSelect;
