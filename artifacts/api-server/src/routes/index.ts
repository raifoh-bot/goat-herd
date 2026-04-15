import { Router, type IRouter } from "express";
import healthRouter from "./health";
import goatsRouter from "./goats";
import dashboardRouter from "./dashboard";
import breedingsRouter from "./breedings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(goatsRouter);
router.use(dashboardRouter);
router.use(breedingsRouter);

export default router;
