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
  // Optional contact email. Used by the self-service forgot-password flow to
  // look up an account and deliver the reset link. Nullable (not every account
  // has an email on file) and not enforced unique.
  email: text("email"),
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

/**
 * Time-limited, single-use tokens backing the self-service forgot-password flow.
 * A row is created when a user requests a reset; `token` is a random hex string
 * embedded in the emailed link, `expiresAt` bounds its validity (1 hour), and
 * `usedAt` is stamped the moment it is consumed so a link can never be replayed.
 */
export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
