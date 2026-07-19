import { Router, type IRouter, type Request } from "express";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { RegisterFarmBody } from "@workspace/api-zod";
import { createFarm } from "../lib/createFarm";
import { sendNewFarmNotificationEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Fire-and-forget: emails every active super-admin (with an email on file)
 * about a newly self-registered farm. Runs after the registration transaction
 * has committed and swallows every failure — a broken notification must never
 * affect the registration response.
 */
async function notifySuperadminsOfNewFarm(
  req: Request,
  farm: { name: string; slug: string },
  adminUsername: string,
): Promise<void> {
  try {
    const override = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
    const origin = override || `${req.protocol}://${req.get("host")}`;
    const details = {
      farmName: farm.name,
      farmSlug: farm.slug,
      adminUsername,
      registeredAt: new Date(),
      panelUrl: `${origin}/superadmin/farms`,
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
 * Public self-service farm registration. Creates a farm, its settings row, and
 * an initial admin user. Intentionally pre-tenant: it must work with no farm
 * context resolved.
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
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  // Fire-and-forget notification; deliberately not awaited so a slow or failed
  // email can never delay or break the registration response.
  void notifySuperadminsOfNewFarm(req, result.farm, parsed.data.username.trim());

  res.status(201).json({
    id: result.farm.id,
    slug: result.farm.slug,
    name: result.farm.name,
    status: result.farm.status,
  });
});

export default router;
