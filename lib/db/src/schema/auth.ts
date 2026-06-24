import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { farmsTable } from "./farms";
import type { DashboardWidgetLayout } from "./settings";

export const userRoles = ["superadmin", "admin", "owner", "farmhand"] as const;
export type UserRole = (typeof userRoles)[number];

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  // Scoped to a farm. Usernames are unique per-farm (enforced via partial unique
  // indexes in the boot migration), not globally. `superadmin` accounts have a
  // null farmId and are unique across the whole platform.
  farmId: integer("farm_id").references(() => farmsTable.id),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: userRoles }).notNull().default("farmhand"),
  active: boolean("active").notNull().default(true),
  // Null until the user's first successful login. Drives the first-login
  // onboarding redirect (new farm admins land on Farm Settings).
  lastLoginAt: timestamp("last_login_at"),
  // Optional per-user dashboard arrangement. NULL means "use the farm-wide
  // default layout"; a non-null array overrides it for this user only.
  dashboardLayout: jsonb("dashboard_layout").$type<DashboardWidgetLayout[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
