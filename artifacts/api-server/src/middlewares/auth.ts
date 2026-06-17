import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, type UserRole } from "@workspace/db";

/**
 * Rejects unauthenticated requests with 401. On success, loads the current
 * user from the database and attaches it to `req.authUser`. Sessions that
 * point at a missing or deactivated user are destroyed and rejected.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user || !user.active) {
    req.session.destroy(() => undefined);
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  req.authUser = { id: user.id, username: user.username, role: user.role };
  next();
};

/**
 * Restricts a route to the given roles. Must run after `requireAuth`.
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      res.status(403).json({ error: "You do not have permission to perform this action" });
      return;
    }
    next();
  };
}
