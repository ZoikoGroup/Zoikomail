import { Router } from "express";
import {
  authenticate,
  tenantContext,
  validate,
} from "../../common/middleware/index.js";
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from "./auth.schema.js";
import * as authController from "./auth.controller.js";

const authRouter = Router();

authRouter.post(
  "/register",
  validate(registerSchema),
  authController.register
);

authRouter.post("/login", validate(loginSchema), authController.login);

authRouter.post(
  "/refresh",
  validate(refreshSchema),
  authController.refresh
);

authRouter.post(
  "/logout",
  validate(logoutSchema),
  authController.logout
);

authRouter.get(
  "/me",
  authenticate,
  tenantContext,
  authController.me
);

export { authRouter };
