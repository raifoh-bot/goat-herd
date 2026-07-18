import { Router, type IRouter } from "express";
import healthRouter from "./health";
import farmsRouter from "./farms";
import authRouter from "./auth";
import goatsRouter from "./goats";
import dashboardRouter from "./dashboard";
import breedingsRouter from "./breedings";
import healthEventsRouter from "./health-events";
import semenRouter from "./semen";
import semenTanksRouter from "./semenTanks";
import showsRouter from "./shows";
import storageRouter from "./storage";
import usersRouter from "./users";
import settingsRouter from "./settings";
import superadminRouter from "./superadmin";
import { requireAuth } from "../middlewares/auth";
import { resolveTenant, requireTenant, superadminReadOnly } from "../middlewares/tenant";

const router: IRouter = Router();

// Public routes that must work WITHOUT a tenant context.
router.use(healthRouter);
router.use(farmsRouter); // POST /farms/register (self-service signup)

// Resolve the tenant (subdomain / header / session) for everything below.
// Unknown slug → 404, suspended → 403, no slug → req.farm stays undefined.
router.use(resolveTenant);

// Auth endpoints (login reads req.farm; logout/me/password are self-contained).
router.use(authRouter);

// Everything below this point requires an authenticated session.
router.use(requireAuth);

// Superadmin platform management — not bound to a single farm.
router.use(superadminRouter);

// Object storage is authenticated but farm-agnostic.
router.use(storageRouter);

// Everything below requires a resolved tenant.
router.use(requireTenant);

// A superadmin resolving a farm is in read-only "view as farm" mode: allow
// reads, block every mutation regardless of the individual route's role check.
router.use(superadminReadOnly);

router.use(goatsRouter);
router.use(dashboardRouter);
router.use(breedingsRouter);
router.use(healthEventsRouter);
router.use(semenRouter);
router.use(semenTanksRouter);
router.use(showsRouter);
router.use(usersRouter);
router.use(settingsRouter);

export default router;
