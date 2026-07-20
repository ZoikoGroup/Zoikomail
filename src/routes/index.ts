import { Router } from "express";
import { authRouter } from "../modules/auth/auth.routes.js";
import { membershipRouter } from "../modules/membership/membership.routes.js";

const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/membership", membershipRouter);

export { apiRouter };
