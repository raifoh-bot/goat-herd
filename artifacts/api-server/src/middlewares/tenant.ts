import type { Request, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, farmsTable } from "@workspace/db";

/**
 * Determines the farm slug for a request.
 *
 * Resolution order:
 *  1. Subdomain — only when FARM_BASE_DOMAIN is configured (production). The
 *     leading DNS label of the host is treated as the farm slug. Gated behind
 *     the env var so Replit's *.replit.dev / *.repl.co hosts are never
 *     mis-parsed as farm slugs in development.
 *  2. `X-Farm-Slug` request header — used by the dev frontend (and tests),
 *     where there is no per-farm subdomain.
 *  3. `session.farmSlug` — persisted at login so subsequent same-session
 *     requests resolve the tenant without re-sending the header.
 */
function resolveSlug(req: Request): string | null {
  const baseDomain = process.env.FARM_BASE_DOMAIN?.toLowerCase().trim();
  const host = (req.headers.host ?? "").split(":")[0].toLowerCase();
  if (baseDomain && host.endsWith(`.${baseDomain}`)) {
    const sub = host.slice(0, host.length - baseDomain.length - 1);
    const label = sub.split(".")[0];
    if (label && label !== "www") return label;
  }

  const header = req.headers["x-farm-slug"];
  if (typeof header === "string" && header.trim()) {
    return header.trim().toLowerCase();
  }

  if (req.session?.farmSlug) return req.session.farmSlug;

  return null;
}

/**
 * Resolves the tenant for the request and attaches it to `req.farm`.
 *
 * - Unknown slug → 404.
 * - Suspended farm → 403.
 * - No slug → no-op (req.farm stays undefined). Routes that require a tenant
 *   should sit behind `requireTenant`; superadmin/apex routes do not.
 */
export const resolveTenant: RequestHandler = async (req, res, next) => {
  try {
    const slug = resolveSlug(req);
    if (!slug) {
      next();
      return;
    }

    const [farm] = await db.select().from(farmsTable).where(eq(farmsTable.slug, slug));
    if (!farm || farm.deletedAt) {
      // A deleted farm is indistinguishable from a non-existent one to tenants,
      // so its users can no longer resolve the tenant or sign in.
      res.status(404).json({ error: "Farm not found" });
      return;
    }
    if (farm.status === "suspended") {
      res.status(403).json({ error: "This farm has been suspended" });
      return;
    }
    if (farm.status === "pending") {
      // Self-registered farm not yet approved by a super-admin: nobody can sign
      // in or read data until approval. Distinct message so the UI can explain.
      res.status(403).json({
        error:
          "This farm is awaiting approval. You'll be able to sign in once a platform admin approves it.",
      });
      return;
    }
    if (farm.status === "rejected") {
      res.status(403).json({ error: "This farm's registration was not approved." });
      return;
    }

    req.farm = { id: farm.id, slug: farm.slug, name: farm.name, status: farm.status };
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Rejects requests that have no resolved tenant. Must run after resolveTenant
 * (and, for membership safety, after requireAuth).
 */
export const requireTenant: RequestHandler = (req, res, next) => {
  if (!req.farm) {
    res.status(400).json({
      error: "No farm context. Access your farm via its subdomain or sign in again.",
    });
    return;
  }
  next();
};

/**
 * Enforces read-only access for a platform superadmin who is viewing a tenant's
 * data (the "view as farm" support flow). A superadmin has no farm of their own
 * but can resolve any farm via `X-Farm-Slug` to inspect its records; this guard
 * guarantees that inspection can never mutate the farm's data. Only safe methods
 * (GET/HEAD/OPTIONS) are allowed through for superadmins.
 *
 * Must run after `requireAuth` and `requireTenant`, ahead of the tenant routers.
 * Regular farm users are unaffected — their write permissions are governed by
 * `requireRole` as usual.
 */
export const superadminReadOnly: RequestHandler = (req, res, next) => {
  if (req.authUser?.role === "superadmin") {
    const method = req.method.toUpperCase();
    const isSafe = method === "GET" || method === "HEAD" || method === "OPTIONS";
    if (!isSafe) {
      res.status(403).json({
        error: "Platform admins have read-only access when viewing a farm.",
      });
      return;
    }
  }
  next();
};

/**
 * Returns the resolved farm id for the request. Throws if called without a
 * tenant context — every caller sits behind `requireTenant`, so this only fires
 * on a programming error.
 */
export function farmId(req: Request): number {
  if (!req.farm) {
    throw new Error("farmId() called without a resolved tenant");
  }
  return req.farm.id;
}
