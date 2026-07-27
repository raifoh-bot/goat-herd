import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// `pending` = self-registered, awaiting super-admin approval (no logins yet).
// `rejected` = a super-admin declined the registration; the row (and slug) are
// retained for auditing, so a rejected slug is NOT reusable.
export const farmStatuses = ["active", "suspended", "pending", "rejected"] as const;
export type FarmStatus = (typeof farmStatuses)[number];

export const farmsTable = pgTable("farms", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: text("status", { enum: farmStatuses }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // Soft-delete audit trail. A non-null `deletedAt` hides the farm from the
  // active roster and blocks its users from signing in, while preserving the
  // record (and reason) of the deletion for the super-admin.
  deletedAt: timestamp("deleted_at"),
  deletedReason: text("deleted_reason"),
  deletedByUsername: text("deleted_by_username"),
  // Rejection audit trail, set when a super-admin declines a pending farm.
  rejectedAt: timestamp("rejected_at"),
  rejectedReason: text("rejected_reason"),
  rejectedByUsername: text("rejected_by_username"),
});

/**
 * One-click approval links emailed to super-admins for pending farms. Only the
 * SHA-256 hash of the token is stored, so a database leak can never yield a
 * working approval link. Tokens expire and are single-use (`usedAt`).
 */
export const farmApprovalTokensTable = pgTable("farm_approval_tokens", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id")
    .notNull()
    .references(() => farmsTable.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type FarmApprovalToken = typeof farmApprovalTokensTable.$inferSelect;

export const insertFarmSchema = createInsertSchema(farmsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFarm = z.infer<typeof insertFarmSchema>;
export type Farm = typeof farmsTable.$inferSelect;
