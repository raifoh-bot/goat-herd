import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const goatsTable = pgTable("goats", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  element: text("element", { enum: ["fire", "water", "earth", "air", "light", "shadow"] }).notNull(),
  status: text("status", { enum: ["healthy", "sick", "resting", "enchanted"] }).notNull(),
  magicLevel: integer("magic_level").notNull(),
  wingType: text("wing_type", { enum: ["butterfly", "dragonfly", "moth", "feathered", "crystal", "none"] }).notNull(),
  age: integer("age").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGoatSchema = createInsertSchema(goatsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGoat = z.infer<typeof insertGoatSchema>;
export type Goat = typeof goatsTable.$inferSelect;
