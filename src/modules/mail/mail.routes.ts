import { Router } from "express";
import { authenticate, requireRole, tenantContext, validate } from "../../common/middleware/index.js";
import * as controller from "./mail.controller.js";
import { attachmentUpload } from "./attachment.middleware.js";
import { attachmentParamsSchema, createDraftSchema, listMailSchema, mailboxIdParamsSchema, messageIdParamsSchema, updateDraftSchema, updateMailboxItemSchema, updateSendingStatusSchema } from "./mail.schema.js";

const mailRouter = Router();
mailRouter.use(authenticate, tenantContext, requireRole("OWNER", "ADMIN", "MEMBER"));
mailRouter.get("/", validate(listMailSchema, "query"), controller.list);
mailRouter.post("/drafts", validate(createDraftSchema), controller.createDraft);
mailRouter.post("/drafts/:messageId/attachments", validate(messageIdParamsSchema, "params"), attachmentUpload, controller.addAttachment);
mailRouter.get("/:messageId/attachments/:attachmentId", validate(attachmentParamsSchema, "params"), controller.downloadAttachment);
mailRouter.delete("/drafts/:messageId/attachments/:attachmentId", validate(attachmentParamsSchema, "params"), controller.deleteAttachment);
mailRouter.get("/:messageId/delivery-events", validate(messageIdParamsSchema, "params"), controller.listDeliveryEvents);
mailRouter.patch(
  "/admin/mailboxes/:mailboxId/sending",
  requireRole("OWNER", "ADMIN"),
  validate(mailboxIdParamsSchema, "params"),
  validate(updateSendingStatusSchema),
  controller.updateSendingStatus
);
mailRouter.get("/:messageId", validate(messageIdParamsSchema, "params"), controller.get);
mailRouter.patch("/:messageId", validate(messageIdParamsSchema, "params"), validate(updateMailboxItemSchema), controller.updateMailboxItem);
mailRouter.patch("/drafts/:messageId", validate(messageIdParamsSchema, "params"), validate(updateDraftSchema), controller.updateDraft);
mailRouter.post("/drafts/:messageId/send", validate(messageIdParamsSchema, "params"), controller.send);

export { mailRouter };
