import { doublePrecision, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const goatsTable = pgTable("goats", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  breed: text("breed", { enum: ["alpine", "nubian", "saanen", "lamancha", "toggenburg", "boer", "nigerian-dwarf", "oberhasli", "mixed"] }).notNull(),
  status: text("status", { enum: ["healthy", "watch", "treatment", "dry"] }).notNull(),
  milkPerDay: doublePrecision("milk_per_day").notNull(),
  lactationStatus: text("lactation_status", { enum: ["milking", "dry", "pregnant", "kid"] }).notNull(),
  age: integer("age").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGoatSchema = createInsertSchema(goatsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGoat = z.infer<typeof insertGoatSchema>;
export type Goat = typeof goatsTable.$inferSelect;
