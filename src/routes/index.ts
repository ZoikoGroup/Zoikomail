import { Router } from "express";
import { authRouter } from "../modules/auth/auth.routes.js";
import { membershipRouter } from "../modules/membership/membership.routes.js";
import { tenantRouter } from "../modules/tenant/tenant.routes.js";
import { userRouter } from "../modules/user/user.routes.js";
import { auditRouter } from "../modules/audit/audit.routes.js";

const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/membership", membershipRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/tenants", tenantRouter);
apiRouter.use("/audit", auditRouter);

export { apiRouter };
