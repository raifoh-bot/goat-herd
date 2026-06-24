import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, usersTable } from "@workspace/db";
import { LoginBody, ChangeOwnPasswordBody, UpdateDashboardLayoutBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { isBearerBridgeEnabled } from "../lib/session";
import { normalizePersonalDashboardLayout } from "../lib/dashboardWidgets";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;

  // Usernames are unique per-farm, so the lookup must be scoped. When a tenant
  // is resolved, log in against that farm. With no tenant (the apex/no-farm
  // context) only platform superadmins may authenticate.
  const [user] = req.farm
    ? await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.username, username), eq(usersTable.farmId, req.farm.id)))
    : await db
        .select()
        .from(usersTable)
        .where(
          and(
            eq(usersTable.username, username),
            eq(usersTable.role, "superadmin"),
            isNull(usersTable.farmId),
          ),
        );

  // Always run a comparison to avoid leaking whether the username exists.
  const hash = user?.passwordHash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
  const passwordOk = await bcrypt.compare(password, hash);

  if (!user || !user.active || !passwordOk) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  // Whether this is the user's first ever login, used to drive the onboarding
  // redirect to Farm Settings. We only stamp last_login_at once the login has
  // fully succeeded (session regenerated + saved) so a mid-login failure can't
  // silently consume the one-time flag.
  const firstLogin = user.lastLoginAt == null;

  // Regenerate the session on login to issue a fresh id, preventing
  // session-fixation (an attacker-known pre-login id carrying over post-auth).
  try {
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    req.log.error({ err }, "Failed to regenerate session on login");
    res.status(500).json({ error: "Failed to log in" });
    return;
  }

  req.session.userId = user.id;
  // Persist the farm slug so subsequent same-session requests resolve the tenant
  // without re-sending the X-Farm-Slug header. Superadmins carry no farm.
  if (req.farm) {
    req.session.farmSlug = req.farm.slug;
  } else {
    req.session.farmSlug = undefined;
  }

  // Persist the session before responding so the returned bearer token (when
  // enabled) is immediately usable against the store.
  try {
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    req.log.error({ err }, "Failed to persist session on login");
    res.status(500).json({ error: "Failed to log in" });
    return;
  }

  // Login fully succeeded; stamp last_login_at so firstLogin only fires once.
  if (firstLogin) {
    await db
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id));
  }

  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    farmSlug: req.farm?.slug ?? null,
    firstLogin,
    // The session id doubles as a bearer token for clients whose session cookie
    // is blocked (the cross-site Replit preview iframe). Only issued when the
    // bridge is enabled (non-production); production stays cookie-only.
    ...(isBearerBridgeEnabled() ? { token: req.sessionID } : {}),
  });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy((err) => {
    if (err) {
      req.log.error({ err }, "Failed to destroy session");
      res.status(500).json({ error: "Failed to log out" });
      return;
    }
    res.clearCookie("mygoatherd.sid");
    res.sendStatus(204);
  });
});

router.get("/auth/me", requireAuth, (req, res): void => {
  res.json({
    ...req.authUser,
    farmSlug: req.session.farmSlug ?? null,
    // Preserve null (no personal override) so the client falls back to the
    // farm-wide layout; normalize a stored array against the current catalog.
    dashboardLayout: normalizePersonalDashboardLayout(req.authUser!.dashboardLayout),
  });
});

/**
 * Sets or clears the current user's personal dashboard layout. Any authenticated
 * user may arrange their own dashboard; sending `dashboardLayout: null` removes
 * the personal override so the user falls back to the farm-wide default.
 */
router.put("/auth/dashboard-layout", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateDashboardLayoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const layout = normalizePersonalDashboardLayout(parsed.data.dashboardLayout);

  await db
    .update(usersTable)
    .set({ dashboardLayout: layout, updatedAt: new Date() })
    .where(eq(usersTable.id, req.authUser!.id));

  res.json({
    ...req.authUser,
    farmSlug: req.session.farmSlug ?? null,
    dashboardLayout: layout,
  });
});

router.put("/auth/password", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChangeOwnPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.authUser!.id));

  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const currentOk = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!currentOk) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db
    .update(usersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  res.sendStatus(204);
});

export default router;
