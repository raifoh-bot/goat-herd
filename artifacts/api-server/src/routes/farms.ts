import { Router, type IRouter, type Request } from "express";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { db, farmsTable, farmApprovalTokensTable, usersTable } from "@workspace/db";
import { RegisterFarmBody } from "@workspace/api-zod";
import { createFarm } from "../lib/createFarm";
import { sendNewFarmNotificationEmail, sendFarmRegistrationReceivedEmail } from "../lib/email";
import { approveFarmById } from "../lib/approveFarm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// A one-click approval link stays valid for 7 days from registration.
const APPROVAL_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Only the SHA-256 hash of an approval token is ever stored. */
export function hashApprovalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function requestOrigin(req: Request): string {
  const override = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  return override || `${req.protocol}://${req.get("host")}`;
}

/**
 * Fire-and-forget: emails every active super-admin (with an email on file)
 * about a newly self-registered farm awaiting approval, including a secure
 * one-click approve link. Runs after the registration transaction has
 * committed and swallows every failure — a broken notification must never
 * affect the registration response.
 */
async function notifySuperadminsOfNewFarm(
  req: Request,
  farm: { id: number; name: string; slug: string },
  adminUsername: string,
): Promise<void> {
  try {
    // Single-use, expiring approval token. Only its hash is persisted; the raw
    // token exists solely inside the emailed link.
    const token = randomBytes(32).toString("hex");
    await db.insert(farmApprovalTokensTable).values({
      farmId: farm.id,
      tokenHash: hashApprovalToken(token),
      expiresAt: new Date(Date.now() + APPROVAL_TOKEN_TTL_MS),
    });

    const origin = requestOrigin(req);
    const details = {
      farmName: farm.name,
      farmSlug: farm.slug,
      adminUsername,
      registeredAt: new Date(),
      panelUrl: `${origin}/superadmin/farms`,
      // Fixed, same-origin path with only the token as a parameter — the link
      // can never be crafted to redirect anywhere off-site.
      approveUrl: `${origin}/api/farms/approve?token=${encodeURIComponent(token)}`,
    };

    const superadmins = await db
      .select()
      .from(usersTable)
      .where(
        and(
          isNull(usersTable.farmId),
          eq(usersTable.role, "superadmin"),
          eq(usersTable.active, true),
          isNotNull(usersTable.email),
        ),
      );

    await Promise.all(
      superadmins
        .filter((u) => u.email)
        .map((u) => sendNewFarmNotificationEmail(u.email!, details)),
    );
  } catch (err) {
    logger.error({ err, farmSlug: farm.slug }, "Failed to notify super-admins of new farm");
  }
}

/**
 * Public self-service farm registration. Creates a farm (in the
 * pending-approval state), its settings row, and an initial admin user.
 * Intentionally pre-tenant: it must work with no farm context resolved.
 * Nobody can sign in to the farm until a super-admin approves it.
 */
router.post("/farms/register", async (req, res): Promise<void> => {
  const parsed = RegisterFarmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim();
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const result = await createFarm({
    slug: parsed.data.slug,
    name: parsed.data.farmName,
    adminUsername: parsed.data.username,
    adminPassword: parsed.data.password,
    adminEmail: email,
    // Self-registered farms wait for super-admin approval before going live.
    status: "pending",
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  // Fire-and-forget notification; deliberately not awaited so a slow or failed
  // email can never delay or break the registration response.
  void notifySuperadminsOfNewFarm(req, result.farm, parsed.data.username.trim());

  // Fire-and-forget confirmation to the registrant that their submission is in
  // review. Same contract: a failed email never affects the registration.
  void sendFarmRegistrationReceivedEmail(email, {
    farmName: result.farm.name,
    farmSlug: result.farm.slug,
    farmUrl: `${requestOrigin(req)}/${result.farm.slug}`,
  }).catch((err) =>
    logger.error({ err, farmSlug: result.farm.slug }, "Failed to send registration-received email"),
  );

  res.status(201).json({
    id: result.farm.id,
    slug: result.farm.slug,
    name: result.farm.name,
    status: result.farm.status,
  });
});

/** Minimal same-origin HTML page for the emailed one-click approval link. */
function approvalPage(title: string, body: string, panelPath: string): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title} — MyGoatHerd</title></head>
  <body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background: #f9fafb; color: #1f2937; display: flex; justify-content: center; padding: 48px 16px;">
    <div style="max-width: 480px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px;">
      <h1 style="font-size: 20px; margin: 0 0 12px;">${title}</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #4b5563;">${body}</p>
      <p style="margin-top: 24px;"><a href="${panelPath}" style="color: #16a34a; font-weight: 600;">Open the super-admin panel</a></p>
    </div>
  </body>
</html>`;
}

/** Minimal HTML-escaping for user-provided values embedded in the page. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * One-click approval endpoint hit by the emailed link. Unauthenticated by
 * design — the secret is the token itself (32 random bytes, stored hashed,
 * expiring, single-use). Responds with a small same-origin HTML page and never
 * redirects, so a crafted link cannot send a super-admin off-site.
 */
router.get("/farms/approve", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const invalid = () =>
    res
      .status(400)
      .type("html")
      .send(
        approvalPage(
          "Link invalid or expired",
          "This approval link is invalid, has expired, or was already used. You can still approve or reject the farm from the super-admin panel.",
          "/superadmin/farms",
        ),
      );

  if (!token) {
    invalid();
    return;
  }

  const [record] = await db
    .select()
    .from(farmApprovalTokensTable)
    .where(eq(farmApprovalTokensTable.tokenHash, hashApprovalToken(token)));

  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    invalid();
    return;
  }

  const approved = await approveFarmById(req, record.farmId, "approval link");
  if (!approved.ok) {
    res
      .status(409)
      .type("html")
      .send(
        approvalPage(
          "Farm can't be approved",
          escapeHtml(approved.error),
          "/superadmin/farms",
        ),
      );
    return;
  }

  // Consume the token only after a successful approval so a failed attempt
  // doesn't burn the link.
  await db
    .update(farmApprovalTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(farmApprovalTokensTable.id, record.id));

  res
    .type("html")
    .send(
      approvalPage(
        "Farm approved",
        `${escapeHtml(approved.farm.name)} is now live. Its admin can sign in right away.`,
        "/superadmin/farms",
      ),
    );
});

export default router;
