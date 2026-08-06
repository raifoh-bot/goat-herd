import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, usersTable } from "@workspace/db";
import { CreateUserBody, UpdateUserBody, SetUserPasswordBody } from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { farmId } from "../middlewares/tenant";

const router: IRouter = Router();

// All user-management endpoints are restricted to Admin and Owner.
router.use("/users", requireRole("admin", "owner"));

function toPublicUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    fullName: user.fullName ?? null,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/** Trims an email from a request body; returns null when it is blank. */
function normalizeEmail(email: string | null | undefined): string | null {
  if (email == null) return null;
  const trimmed = email.trim();
  return trimmed ? trimmed : null;
}

router.get("/users", async (req, res): Promise<void> => {
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.farmId, farmId(req)))
    .orderBy(desc(usersTable.createdAt));
  res.json(users.map(toPublicUser));
});

router.post("/users", async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const username = parsed.data.username.trim();
  if (!username) {
    res.status(400).json({ error: "Username is required" });
    return;
  }

  const email = normalizeEmail(parsed.data.email);
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.username, username), eq(usersTable.farmId, farmId(req))));
  if (existing) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  // Optional display name; blank collapses to null (no name on file).
  const fullName = parsed.data.fullName?.trim() || null;

  const [user] = await db
    .insert(usersTable)
    .values({
      username,
      email,
      fullName,
      passwordHash,
      role: parsed.data.role,
      farmId: farmId(req),
    })
    .returning();

  res.status(201).json(toPublicUser(user));
});

router.put("/users/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
  if (parsed.data.active !== undefined) updateData.active = parsed.data.active;
  if (parsed.data.email !== undefined) {
    const email = normalizeEmail(parsed.data.email);
    if (!email) {
      res.status(400).json({ error: "Email cannot be blank" });
      return;
    }
    updateData.email = email;
  }
  if (parsed.data.fullName !== undefined) {
    // A blank or null name clears it; Drizzle needs an explicit null to clear.
    updateData.fullName = parsed.data.fullName?.trim() || null;
  }

  // Prevent an admin/owner from deactivating or demoting their own account,
  // which could lock the herd out of all administrative access.
  if (req.authUser && req.authUser.id === id) {
    if (parsed.data.active === false) {
      res.status(400).json({ error: "You cannot deactivate your own account" });
      return;
    }
    if (parsed.data.role === "farmhand") {
      res.status(400).json({ error: "You cannot remove your own administrative access" });
      return;
    }
  }

  const [user] = await db
    .update(usersTable)
    .set(updateData)
    .where(and(eq(usersTable.id, id), eq(usersTable.farmId, farmId(req))))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(toPublicUser(user));
});

router.put("/users/:id/password", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = SetUserPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const [user] = await db
    .update(usersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(and(eq(usersTable.id, id), eq(usersTable.farmId, farmId(req))))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
