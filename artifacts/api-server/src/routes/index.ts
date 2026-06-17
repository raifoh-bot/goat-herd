import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import goatsRouter from "./goats";
import dashboardRouter from "./dashboard";
import breedingsRouter from "./breedings";
import semenRouter from "./semen";
import storageRouter from "./storage";
import usersRouter from "./users";
import settingsRouter from "./settings";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Public routes (no authentication required).
router.use(healthRouter);
router.use(authRouter);

// Everything below this point requires an authenticated session.
router.use(requireAuth);

router.use(goatsRouter);
router.use(dashboardRouter);
router.use(breedingsRouter);
router.use(semenRouter);
router.use(storageRouter);
router.use(usersRouter);
router.use(settingsRouter);

export default router;
