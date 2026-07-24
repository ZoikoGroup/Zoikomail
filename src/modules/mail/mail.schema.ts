import { z } from "zod";

const emailSchema = z.string().trim().email().max(320).transform((value) => value.toLowerCase());
const recipientsSchema = z.object({
  to: z.array(emailSchema).min(1).max(100),
  cc: z.array(emailSchema).max(100).default([]),
  bcc: z.array(emailSchema).max(100).default([]),
});

export const createDraftSchema = z.object({
  subject: z.string().trim().max(998).default(""),
  textBody: z.string().max(2_000_000).nullable().optional(),
  htmlBody: z.string().max(2_000_000).nullable().optional(),
  recipients: recipientsSchema,
});

export const updateDraftSchema = createDraftSchema.partial();
export const messageIdParamsSchema = z.object({ messageId: z.string().uuid() });
export const attachmentParamsSchema = z.object({
  messageId: z.string().uuid(),
  attachmentId: z.string().uuid(),
});
export const mailboxIdParamsSchema = z.object({ mailboxId: z.string().uuid() });
export const updateSendingStatusSchema = z.object({
  suspended: z.boolean(),
  reason: z.string().trim().min(3).max(500).optional(),
}).superRefine((value, context) => {
  if (value.suspended && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Reason is required when suspending sending" });
  }
});
export const listMailSchema = z.object({
  folder: z.enum(["DRAFTS", "INBOX", "SENT", "TRASH"]).default("INBOX"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const updateMailboxItemSchema = z.object({
  isRead: z.boolean().optional(),
  folder: z.enum(["INBOX", "TRASH"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one change is required");

export type CreateDraftInput = z.infer<typeof createDraftSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
export type ListMailInput = z.infer<typeof listMailSchema>;
export type UpdateMailboxItemInput = z.infer<typeof updateMailboxItemSchema>;
