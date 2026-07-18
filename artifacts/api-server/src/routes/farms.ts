import { Router, type IRouter } from "express";
import { RegisterFarmBody } from "@workspace/api-zod";
import { createFarm } from "../lib/createFarm";

const router: IRouter = Router();

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

  res.status(201).json({
    id: result.farm.id,
    slug: result.farm.slug,
    name: result.farm.name,
    status: result.farm.status,
  });
});

export default router;
