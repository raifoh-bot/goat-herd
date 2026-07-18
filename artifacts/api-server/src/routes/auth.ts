import { Router, type IRouter, type Request } from "express";
import { and, eq, isNull, or } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { db, usersTable, passwordResetTokensTable } from "@workspace/db";
import {
  LoginBody,
  ChangeOwnPasswordBody,
  UpdateDashboardLayoutBody,
  UpdateOwnEmailBody,
  ForgotPasswordBody,
  ResetPasswordBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { isBearerBridgeEnabled } from "../lib/session";
import { normalizePersonalDashboardLayout } from "../lib/dashboardWidgets";
import { sendPasswordResetEmail } from "../lib/email";

const router: IRouter = Router();

// A reset link is valid for one hour from issue.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** A neutral response used by forgot-password to avoid account enumeration. */
const NEUTRAL_FORGOT_MESSAGE =
  "If an account matches, we've sent a password reset link to its email address.";

/**
 * Builds the absolute URL of the reset page for a given farm and token. The web
 * app lives at the domain root (`/<slug>/reset-password`) on the same host as
 * the API, so the request's own origin is the source of truth. `APP_BASE_URL`
 * can override the origin when the public URL differs from the request host.
 */
function buildResetUrl(req: Request, slug: string, token: string): string {
  const override = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  const origin = override || `${req.protocol}://${req.get("host")}`;
  return `${origin}/${slug}/reset-password?token=${encodeURIComponent(token)}`;
}

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
  let [user] = req.farm
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

  // The superadmin is global (no farm), but a stale farm context (persisted
  // slug or session) can accompany their login attempt. If the farm-scoped
  // lookup found nobody, fall back to the global superadmin account and log
  // them in without a farm rather than rejecting valid platform credentials.
  let loginFarm = req.farm ?? null;
  if (!user && req.farm) {
    const [superadmin] = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.username, username),
          eq(usersTable.role, "superadmin"),
          isNull(usersTable.farmId),
        ),
      );
    if (superadmin) {
      user = superadmin;
      loginFarm = null;
    }
  }

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
  if (loginFarm) {
    req.session.farmSlug = loginFarm.slug;
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
    farmSlug: loginFarm?.slug ?? null,
    firstLogin,
    // The session id doubles as a bearer token for clients whose session cookie
    // is blocked (the cross-site Replit preview iframe). Only issued when the
    // bridge is enabled (non-production); production stays cookie-only.
    ...(isBearerBridgeEnabled() ? { token: req.sessionID } : {}),
  });
});

/**
 * Public: begins a self-service password reset. Looks up an account in the
 * resolved farm by username OR email, and if found (and active, with an email on
 * file) creates a one-hour token and emails the reset link. Always responds 200
 * with a neutral message so the endpoint never reveals whether an account, or a
 * particular email, exists.
 */
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const identifier = parsed.data.identifier.trim();

  // The reset flow is farm-scoped: the request must resolve a tenant (the page
  // lives at /<slug>/forgot-password). Without one we still return neutrally.
  if (!identifier || !req.farm) {
    res.status(200).json({ message: NEUTRAL_FORGOT_MESSAGE });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.farmId, req.farm.id),
        or(eq(usersTable.username, identifier), eq(usersTable.email, identifier)),
      ),
    );

  // Only issue a link when we have an active account with an email to send to.
  if (user && user.active && user.email) {
    const token = randomBytes(32).toString("hex");
    await db.insert(passwordResetTokensTable).values({
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });
    const resetUrl = buildResetUrl(req, req.farm.slug, token);
    await sendPasswordResetEmail(user.email, resetUrl);
  }

  res.status(200).json({ message: NEUTRAL_FORGOT_MESSAGE });
});

/**
 * Public: completes a password reset. Validates the token (exists, not expired,
 * not already used), hashes the new password, updates the user, and stamps the
 * token as used so the link can never be replayed.
 */
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [record] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.token, parsed.data.token));

  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    res.status(400).json({ error: "This reset link is invalid or has expired." });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);

  // Update the password and consume the token together so a valid-but-slow
  // request can't be replayed. Stamp usedAt regardless of user existence.
  await db
    .update(usersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(usersTable.id, record.userId));

  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokensTable.id, record.id));

  res.sendStatus(204);
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

/**
 * Self-service: sets or updates the current user's own contact email so the
 * forgot-password flow can reach them. Any authenticated user may change their
 * own email; admin management of other users' emails lives in /users/:id.
 */
router.put("/auth/email", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateOwnEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim();
  if (!email) {
    res.status(400).json({ error: "Email cannot be blank" });
    return;
  }

  await db
    .update(usersTable)
    .set({ email, updatedAt: new Date() })
    .where(eq(usersTable.id, req.authUser!.id));

  res.json({
    ...req.authUser,
    email,
    farmSlug: req.session.farmSlug ?? null,
    dashboardLayout: normalizePersonalDashboardLayout(req.authUser!.dashboardLayout),
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
