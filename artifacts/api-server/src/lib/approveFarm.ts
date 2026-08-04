import type { Request } from "express";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, farmsTable, farmApprovalTokensTable, usersTable, type Farm } from "@workspace/db";
import { sendFarmApprovedEmail } from "./email";
import { logger } from "./logger";

export type ApproveFarmResult = { ok: true; farm: Farm } | { ok: false; error: string };

function requestOrigin(req: Request): string {
  const override = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  return override || `${req.protocol}://${req.get("host")}`;
}

/**
 * Activates a pending — or previously rejected — farm. Shared by the one-click
 * email link and the super-admin panel endpoint. Only a live farm in the
 * `pending` or `rejected` state can be approved; everything else returns a
 * typed error. Approving a rejected farm clears its rejection audit metadata
 * (the super-admin changed their mind, so the record must not keep saying
 * "rejected"). On success every remaining approval token for the farm is
 * invalidated, and (fire-and-forget) the registrant admin is notified by email
 * if they provided an address.
 */
export async function approveFarmById(
  req: Request,
  farmId: number,
  via: string,
): Promise<ApproveFarmResult> {
  const [farm] = await db
    .update(farmsTable)
    .set({
      status: "active",
      rejectedAt: null,
      rejectedReason: null,
      rejectedByUsername: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(farmsTable.id, farmId),
        inArray(farmsTable.status, ["pending", "rejected"]),
        isNull(farmsTable.deletedAt),
      ),
    )
    .returning();

  if (!farm) {
    return { ok: false, error: "This farm is not awaiting approval." };
  }

  // Invalidate any outstanding approval links for this farm.
  await db
    .update(farmApprovalTokensTable)
    .set({ usedAt: new Date() })
    .where(
      and(eq(farmApprovalTokensTable.farmId, farm.id), isNull(farmApprovalTokensTable.usedAt)),
    );

  req.log?.info({ farmId: farm.id, farmSlug: farm.slug, via }, "farm approved");

  // Fire-and-forget: tell the registrant their farm is live. Failures are
  // logged and swallowed — a broken email must never affect the approval.
  void (async () => {
    try {
      const [admin] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.farmId, farm.id), eq(usersTable.role, "admin")));
      if (admin?.email) {
        await sendFarmApprovedEmail(admin.email, {
          farmName: farm.name,
          loginUrl: `${requestOrigin(req)}/${farm.slug}/login`,
        });
      }
    } catch (err) {
      logger.error({ err, farmSlug: farm.slug }, "Failed to send farm-approved email");
    }
  })();

  return { ok: true, farm };
}
