import { Router } from "express";
import {
  asyncHandler,
  authenticate,
  requireRole,
  tenantContext,
} from "../../common/middleware/index.js";
import { sendSuccess } from "../../common/utils/response.js";

const membershipRouter = Router();

membershipRouter.get(
  "/admin-check",
  authenticate,
  tenantContext,
  requireRole("ADMIN", "OWNER"),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      200,
      {
        message: "Admin access granted",
        tenantId: req.tenantContext!.tenantId,
        role: req.tenantContext!.role,
      },
      req.requestId
    );
  })
);

export { membershipRouter };
