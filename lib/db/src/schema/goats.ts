import { boolean, doublePrecision, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { farmsTable } from "./farms";

export const goatsTable = pgTable("goats", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull().references(() => farmsTable.id),
  name: text("name").notNull(),
  registeredName: text("registered_name"),
  adgaId: text("adga_id"),
  damName: text("dam_name").default("").notNull(),
  sireName: text("sire_name").default("").notNull(),
  maternalGranddamName: text("maternal_granddam_name").default("").notNull(),
  maternalGrandsireName: text("maternal_grandsire_name").default("").notNull(),
  paternalGranddamName: text("paternal_granddam_name").default("").notNull(),
  paternalGrandsireName: text("paternal_grandsire_name").default("").notNull(),
  damRegNo: text("dam_reg_no"),
  sireRegNo: text("sire_reg_no"),
  maternalGranddamRegNo: text("maternal_granddam_reg_no"),
  maternalGrandsireRegNo: text("maternal_grandsire_reg_no"),
  paternalGranddamRegNo: text("paternal_granddam_reg_no"),
  paternalGrandsireRegNo: text("paternal_grandsire_reg_no"),
  dateOfBirth: timestamp("date_of_birth"),
  legacyElement: text("element"),
  legacyMagicLevel: integer("magic_level"),
  legacyWingType: text("wing_type"),
  sex: text("sex", { enum: ["doe", "buck", "wether"] }),
  breed: text("breed", { enum: ["alpine", "angora", "boer", "guernsey", "kiko", "lamancha", "mixed", "myotonic", "nigerian-dwarf", "nubian", "oberhasli", "pygmy", "recorded-grade", "saanen", "sable", "savanna", "spanish", "texmaster", "toggenburg"] }).notNull(),
  status: text("status", { enum: ["healthy", "watch", "treatment", "dry"] }).notNull().default("healthy"),
  milkPerDay: doublePrecision("milk_per_day").notNull().default(0),
  lactationStatus: text("lactation_status", { enum: ["milking", "dry", "exposed", "serviced", "pregnant", "kid", "retired"] }),
  age: integer("age"),
  description: text("description"),
  imageUrl: text("image_url"),
  herdStatus: text("herd_status", { enum: ["dead", "first-freshener", "leased", "on-farm", "retired", "sold"] }),
  leasedBuck: boolean("leased_buck").default(false).notNull(),
  rightEarTattoo: varchar("right_ear_tattoo", { length: 4 }),
  leftEarTattoo: varchar("left_ear_tattoo", { length: 4 }),
  rightTailTattoo: varchar("right_tail_tattoo", { length: 4 }),
  leftTailTattoo: varchar("left_tail_tattoo", { length: 4 }),
  centerTailTattoo: varchar("center_tail_tattoo", { length: 8 }),
  eidNumber: varchar("eid_number", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGoatSchema = createInsertSchema(goatsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGoat = z.infer<typeof insertGoatSchema>;
export type Goat = typeof goatsTable.$inferSelect;
