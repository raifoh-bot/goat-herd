import bcrypt from "bcrypt";
import { and, eq } from "drizzle-orm";
import {
  db,
  farmsTable,
  farmSettingsTable,
  usersTable,
  type Farm,
  type FarmStatus,
} from "@workspace/db";
import { RESERVED_SLUGS } from "@workspace/reserved-slugs";

export { RESERVED_SLUGS };

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export type SlugValidation = { ok: true; slug: string } | { ok: false; error: string };

/**
 * Normalises and validates a farm slug. Slugs are lowercase, 3-32 chars,
 * alphanumeric plus internal hyphens, and may not be a reserved word.
 */
export function normalizeSlug(raw: string): SlugValidation {
  const slug = raw.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      error:
        "Slug must be 3-32 characters, lowercase letters, numbers, and hyphens (not starting or ending with a hyphen).",
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "That slug is reserved. Please choose another." };
  }
  return { ok: true, slug };
}

export type CreateFarmInput = {
  slug: string;
  name: string;
  adminUsername: string;
  adminPassword: string;
  status?: FarmStatus;
};

export type CreateFarmResult =
  | { ok: true; farm: Farm }
  | { ok: false; status: number; error: string };

/**
 * Creates a farm together with its default settings row and an initial admin
 * user, all in a single transaction. Returns a typed error for the common
 * conflict cases (duplicate slug) so callers can map them to HTTP status codes.
 */
export async function createFarm(input: CreateFarmInput): Promise<CreateFarmResult> {
  const slugCheck = normalizeSlug(input.slug);
  if (!slugCheck.ok) {
    return { ok: false, status: 400, error: slugCheck.error };
  }
  const slug = slugCheck.slug;

  const name = input.name.trim();
  if (!name) {
    return { ok: false, status: 400, error: "Farm name is required." };
  }

  const username = input.adminUsername.trim();
  if (!username) {
    return { ok: false, status: 400, error: "Admin username is required." };
  }
  if (input.adminPassword.length < 8) {
    return { ok: false, status: 400, error: "Password must be at least 8 characters." };
  }

  const [existingFarm] = await db.select().from(farmsTable).where(eq(farmsTable.slug, slug));
  if (existingFarm) {
    return { ok: false, status: 409, error: "That farm slug is already taken." };
  }

  const passwordHash = await bcrypt.hash(input.adminPassword, 10);

  try {
    return await db.transaction(async (tx) => {
      const [farm] = await tx
        .insert(farmsTable)
        .values({ slug, name, status: input.status ?? "active" })
        .returning();

      await tx.insert(farmSettingsTable).values({ farmId: farm.id, farmName: name });

      const [dupUser] = await tx
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.farmId, farm.id), eq(usersTable.username, username)));
      if (dupUser) {
        throw new Error("DUPLICATE_USER");
      }

      await tx
        .insert(usersTable)
        .values({ farmId: farm.id, username, passwordHash, role: "admin", active: true });

      return { ok: true as const, farm };
    });
  } catch (err) {
    if (err instanceof Error && err.message === "DUPLICATE_USER") {
      return { ok: false, status: 409, error: "That username is already taken for this farm." };
    }
    throw err;
  }
}
