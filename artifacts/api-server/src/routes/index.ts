import { Router, type IRouter } from "express";
import healthRouter from "./health";
import goatsRouter from "./goats";
import dashboardRouter from "./dashboard";
import breedingsRouter from "./breedings";
import semenRouter from "./semen";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(goatsRouter);
router.use(dashboardRouter);
router.use(breedingsRouter);
router.use(semenRouter);
router.use(storageRouter);

export default router;
