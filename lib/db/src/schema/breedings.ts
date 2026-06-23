import { doublePrecision, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { farmsTable } from "./farms";
import { goatsTable } from "./goats";
import { semenStrawsTable } from "./semen";

export const breedingEventsTable = pgTable("breeding_events", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull().references(() => farmsTable.id),
  breedingId: integer("breeding_id").notNull().references(() => breedingsTable.id),
  eventType: text("event_type", { enum: ["exposed", "cover", "removed"] }).notNull(),
  eventDate: timestamp("event_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const breedingsTable = pgTable("breedings", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull().references(() => farmsTable.id),
  doeId: integer("doe_id").notNull().references(() => goatsTable.id),
  sireName: text("sire_name").notNull(),
  breedingMethod: text("breeding_method", { enum: ["natural", "ai"] }).notNull().default("natural"),
  semenSource: text("semen_source"),
  semenStrawId: integer("semen_straw_id").references(() => semenStrawsTable.id),
  breedingDate: timestamp("breeding_date").notNull(),
  expectedKiddingDate: timestamp("expected_kidding_date"),
  status: text("status", { enum: ["bred", "confirmed-pregnant", "kidded", "open"] }).notNull().default("bred"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const kidsTable = pgTable("kids", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull().references(() => farmsTable.id),
  breedingId: integer("breeding_id").notNull().references(() => breedingsTable.id),
  goatId: integer("goat_id").references(() => goatsTable.id),
  name: text("name"),
  sex: text("sex", { enum: ["doe", "buck"] }).notNull(),
  kidStatus: text("kid_status", { enum: ["alive", "dead", "doa", "sold"] }).notNull().default("alive"),
  birthDate: timestamp("birth_date"),
  birthWeight: doublePrecision("birth_weight"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBreedingSchema = createInsertSchema(breedingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertKidSchema = createInsertSchema(kidsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBreedingEventSchema = createInsertSchema(breedingEventsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertBreeding = z.infer<typeof insertBreedingSchema>;
export type Breeding = typeof breedingsTable.$inferSelect;
export type InsertKid = z.infer<typeof insertKidSchema>;
export type Kid = typeof kidsTable.$inferSelect;
export type BreedingEvent = typeof breedingEventsTable.$inferSelect;
export type InsertBreedingEvent = z.infer<typeof insertBreedingEventSchema>;
