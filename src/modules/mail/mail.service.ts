import { Prisma, type MailFolder, type MembershipRole, type RecipientType } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors/AppError.js";
import { ErrorCodes } from "../../common/errors/errorCodes.js";
import { auditService } from "../audit/audit.service.js";
import { policyService } from "../policy/policy.service.js";
import { attachmentStorage } from "./attachment.storage.js";
import { normalizeSubject, uniqueParticipants } from "../message/message.utils.js";
import type { CreateDraftInput, ListMailInput, UpdateDraftInput, UpdateMailboxItemInput } from "./mail.schema.js";

interface MailContext {
  tenantId: string;
  userId: string;
  membershipId: string;
  role: MembershipRole;
  email: string;
  requestId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const messageInclude = {
  recipients: { orderBy: [{ type: "asc" as const }, { email: "asc" as const }] },
  attachments: {
    select: { id: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true },
  },
  author: { select: { id: true, email: true, displayName: true } },
} satisfies Prisma.EmailMessageInclude;

function recipientRows(input: CreateDraftInput | UpdateDraftInput) {
  if (!input.recipients) return undefined;
  const seen = new Set<string>();
  return (["to", "cc", "bcc"] as const).flatMap((key) =>
    input.recipients![key].flatMap((email) => {
      const uniqueKey = `${key}:${email}`;
      if (seen.has(uniqueKey)) return [];
      seen.add(uniqueKey);
      return [{ email, type: key.toUpperCase() as RecipientType }];
    })
  );
}

export class MailService {
  private async mailbox(context: MailContext, tx: Prisma.TransactionClient = prisma) {
    return tx.mailbox.upsert({
      where: { membershipId: context.membershipId, tenantId: context.tenantId },
      create: {
        tenantId: context.tenantId,
        membershipId: context.membershipId,
        address: context.email.toLowerCase(),
      },
      update: {},
    });
  }

  async createDraft(input: CreateDraftInput, context: MailContext) {
    return prisma.$transaction(async (tx) => {
      const mailbox = await this.mailbox(context, tx);
      const now = new Date();
      const thread = await tx.messageThread.create({
        data: {
          tenantId: context.tenantId,
          subjectNormalized: normalizeSubject(input.subject),
          participants: uniqueParticipants([
            context.email,
            ...input.recipients.to,
            ...input.recipients.cc,
            ...input.recipients.bcc,
          ]),
          firstMessageAt: now,
          lastMessageAt: now,
        },
      });
      const message = await tx.emailMessage.create({
        data: {
          tenantId: context.tenantId,
          authorUserId: context.userId,
          threadId: thread.id,
          subject: input.subject,
          textBody: input.textBody,
          htmlBody: input.htmlBody,
          recipients: {
            create: recipientRows(input)!.map((recipient) => ({ ...recipient, tenantId: context.tenantId })),
          },
          mailboxItems: {
            create: { tenantId: context.tenantId, mailboxId: mailbox.id, folder: "DRAFTS", isRead: true },
          },
        },
        include: messageInclude,
      });
      await this.audit(tx, context, "MAIL_DRAFT_CREATED", message.id);
      return message;
    });
  }

  async updateDraft(messageId: string, input: UpdateDraftInput, context: MailContext) {
    return prisma.$transaction(async (tx) => {
      const mailbox = await this.mailbox(context, tx);
      const draft = await tx.emailMessage.findFirst({
        where: {
          id: messageId,
          tenantId: context.tenantId,
          authorUserId: context.userId,
          status: "DRAFT",
          mailboxItems: { some: { tenantId: context.tenantId, mailboxId: mailbox.id, folder: "DRAFTS" } },
        },
      });
      if (!draft) throw new AppError("Draft not found", 404, ErrorCodes.NOT_FOUND);

      const recipients = recipientRows(input);
      if (recipients) {
        await tx.messageRecipient.deleteMany({ where: { tenantId: context.tenantId, messageId } });
        await tx.messageRecipient.createMany({
          data: recipients.map((recipient) => ({ ...recipient, tenantId: context.tenantId, messageId })),
        });
      }
      const message = await tx.emailMessage.update({
        where: { id: draft.id, tenantId: context.tenantId },
        data: { subject: input.subject, textBody: input.textBody, htmlBody: input.htmlBody },
        include: messageInclude,
      });
      if (draft.threadId) {
        const allRecipients = await tx.messageRecipient.findMany({
          where: { tenantId: context.tenantId, messageId },
          select: { email: true },
        });
        await tx.messageThread.update({
          where: { id: draft.threadId, tenantId: context.tenantId },
          data: {
            subjectNormalized: normalizeSubject(message.subject),
            participants: uniqueParticipants([context.email, ...allRecipients.map((recipient) => recipient.email)]),
          },
        });
      }
      return message;
    });
  }

  async send(messageId: string, context: MailContext) {
    const draft = await prisma.emailMessage.findFirst({
      where: { id: messageId, tenantId: context.tenantId, authorUserId: context.userId, status: "DRAFT" },
      include: { recipients: true },
    });
    if (!draft) throw new AppError("Draft not found", 404, ErrorCodes.NOT_FOUND);
    if (!draft.recipients.some((recipient) => recipient.type === "TO")) {
      throw new AppError("At least one TO recipient is required", 400, ErrorCodes.VALIDATION_ERROR);
    }

    for (const recipient of draft.recipients) {
      const internal = await prisma.tenantMembership.findFirst({
        where: {
          tenantId: context.tenantId,
          status: "ACTIVE",
          user: { email: { equals: recipient.email, mode: "insensitive" }, status: "ACTIVE" },
        },
        select: { id: true },
      });
      const decision = await policyService.evaluate({
        type: "SENDING",
        context: { recipient: { email: recipient.email, external: !internal }, sender: { role: context.role } },
      }, context);
      if (decision.effect === "DENY") {
        await auditService.record({
          tenantId: context.tenantId,
          actorUserId: context.userId,
          eventType: "MAIL_SEND_POLICY_DENIED",
          targetType: "EmailMessage",
          targetId: draft.id,
          requestId: context.requestId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: { reason: decision.reason, recipientDomain: recipient.email.split("@")[1] ?? null },
        });
        throw new AppError(`Sending denied by tenant policy (${decision.reason})`, 403, ErrorCodes.FORBIDDEN);
      }
    }

    const senderMailbox = await this.mailbox(context);
    const reservation = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "mailboxes"
      SET "send_recipient_count" = CASE
            WHEN "send_window_started_at" <= CURRENT_TIMESTAMP - (${env.MAIL_SEND_WINDOW_MS} * INTERVAL '1 millisecond')
            THEN ${draft.recipients.length}
            ELSE "send_recipient_count" + ${draft.recipients.length}
          END,
          "send_window_started_at" = CASE
            WHEN "send_window_started_at" <= CURRENT_TIMESTAMP - (${env.MAIL_SEND_WINDOW_MS} * INTERVAL '1 millisecond')
            THEN CURRENT_TIMESTAMP
            ELSE "send_window_started_at"
          END,
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${senderMailbox.id}::uuid
        AND "tenant_id" = ${context.tenantId}::uuid
        AND "send_suspended_at" IS NULL
        AND (
          "send_window_started_at" <= CURRENT_TIMESTAMP - (${env.MAIL_SEND_WINDOW_MS} * INTERVAL '1 millisecond')
          OR "send_recipient_count" + ${draft.recipients.length} <= ${env.MAIL_MAX_RECIPIENTS_PER_WINDOW}
        )
      RETURNING "id"
    `);
    if (reservation.length === 0) {
      const current = await prisma.mailbox.findFirst({
        where: { id: senderMailbox.id, tenantId: context.tenantId },
        select: { sendSuspendedAt: true, sendSuspensionReason: true },
      });
      const suspended = Boolean(current?.sendSuspendedAt);
      await auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.userId,
        eventType: suspended ? "MAIL_SEND_SUSPENDED_DENIED" : "MAIL_SEND_RATE_LIMITED",
        targetType: "Mailbox",
        targetId: senderMailbox.id,
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: suspended
          ? { reason: current?.sendSuspensionReason ?? "Sending suspended" }
          : { recipientCount: draft.recipients.length, windowMs: env.MAIL_SEND_WINDOW_MS },
      });
      throw new AppError(
        suspended ? "Mailbox sending is suspended" : "Mailbox sending rate limit exceeded",
        suspended ? 403 : 429,
        suspended ? ErrorCodes.FORBIDDEN : ErrorCodes.RATE_LIMIT_EXCEEDED
      );
    }

    try {
      return await prisma.$transaction(async (tx) => {
      const sentAt = new Date();
      const recipients = await tx.messageRecipient.findMany({
        where: { tenantId: context.tenantId, messageId },
      });

      for (const recipient of recipients) {
        const membership = await tx.tenantMembership.findFirst({
          where: {
            tenantId: context.tenantId,
            status: "ACTIVE",
            user: { email: { equals: recipient.email, mode: "insensitive" }, status: "ACTIVE" },
          },
          include: { user: { select: { email: true } } },
        });
        if (membership) {
          const recipientMailbox = await this.mailbox({
            ...context,
            userId: membership.userId,
            membershipId: membership.id,
            email: membership.user.email,
          }, tx);
          if (recipientMailbox.id !== senderMailbox.id) {
          await tx.mailboxMessage.upsert({
              where: {
                mailboxId_messageId: { mailboxId: recipientMailbox.id, messageId },
                tenantId: context.tenantId,
              },
              create: { tenantId: context.tenantId, mailboxId: recipientMailbox.id, messageId, folder: "INBOX" },
              update: { folder: "INBOX" },
            });
          }
          await tx.messageRecipient.update({
            where: { id: recipient.id, tenantId: context.tenantId },
            data: { recipientMembershipId: membership.id, deliveryStatus: "DELIVERED" },
          });
          await tx.deliveryEvent.create({
            data: {
              tenantId: context.tenantId,
              messageId,
              recipientId: recipient.id,
              type: "DELIVERED",
              metadata: { transport: "INTERNAL" },
            },
          });
        } else {
          await tx.messageRecipient.update({
            where: { id: recipient.id, tenantId: context.tenantId },
            data: { deliveryStatus: "QUEUED" },
          });
          await tx.deliveryEvent.create({
            data: {
              tenantId: context.tenantId,
              messageId,
              recipientId: recipient.id,
              type: "QUEUED",
              metadata: { transport: "EXTERNAL_PROVIDER_PENDING" },
            },
          });
        }
      }

      await tx.mailboxMessage.update({
        where: {
          mailboxId_messageId: { mailboxId: senderMailbox.id, messageId },
          tenantId: context.tenantId,
        },
        data: { folder: "SENT", isRead: true },
      });
      const message = await tx.emailMessage.update({
        where: { id: messageId, tenantId: context.tenantId },
        data: { status: "SENT", sentAt },
        include: messageInclude,
      });
      if (message.threadId) {
        await tx.messageThread.update({
          where: { id: message.threadId, tenantId: context.tenantId },
          data: { lastMessageAt: sentAt },
        });
      }
      await this.audit(tx, context, "MAIL_SENT", message.id, { recipientCount: recipients.length });
      return message;
      });
    } catch (error) {
      await prisma.deliveryEvent.createMany({
        data: draft.recipients.map((recipient) => ({
          tenantId: context.tenantId,
          messageId,
          recipientId: recipient.id,
          type: "FAILED" as const,
          failureCode: "INTERNAL_SEND_FAILURE",
          failureReason: "The message could not be processed",
        })),
      });
      throw error;
    }
  }

  async listDeliveryEvents(messageId: string, context: MailContext) {
    const message = await prisma.emailMessage.findFirst({
      where: { id: messageId, tenantId: context.tenantId, authorUserId: context.userId },
      select: { id: true },
    });
    if (!message) throw new AppError("Message not found", 404, ErrorCodes.NOT_FOUND);
    return prisma.deliveryEvent.findMany({
      where: { tenantId: context.tenantId, messageId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async updateSendingStatus(
    mailboxId: string,
    input: { suspended: boolean; reason?: string },
    context: MailContext
  ) {
    const mailbox = await prisma.mailbox.findFirst({
      where: { id: mailboxId, tenantId: context.tenantId },
      select: { id: true },
    });
    if (!mailbox) throw new AppError("Mailbox not found", 404, ErrorCodes.NOT_FOUND);
    const updated = await prisma.mailbox.update({
      where: { id: mailbox.id, tenantId: context.tenantId },
      data: {
        sendSuspendedAt: input.suspended ? new Date() : null,
        sendSuspensionReason: input.suspended ? input.reason : null,
        ...(!input.suspended ? { sendRecipientCount: 0, sendWindowStartedAt: new Date() } : {}),
      },
      select: {
        id: true,
        address: true,
        sendSuspendedAt: true,
        sendSuspensionReason: true,
        sendRecipientCount: true,
        sendWindowStartedAt: true,
      },
    });
    await auditService.record({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType: input.suspended ? "MAILBOX_SENDING_SUSPENDED" : "MAILBOX_SENDING_RESUMED",
      targetType: "Mailbox",
      targetId: mailbox.id,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: input.suspended ? { reason: input.reason! } : undefined,
    });
    return updated;
  }

  async list(filters: ListMailInput, context: MailContext) {
    const mailbox = await this.mailbox(context);
    const where = { tenantId: context.tenantId, mailboxId: mailbox.id, folder: filters.folder };
    const [items, total] = await prisma.$transaction([
      prisma.mailboxMessage.findMany({
        where,
        include: { message: { include: messageInclude } },
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.mailboxMessage.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        message: {
          ...item.message,
          recipients: item.message.authorUserId === context.userId
            ? item.message.recipients
            : item.message.recipients.filter((recipient) => recipient.type !== "BCC"),
        },
      })),
      pagination: { ...filters, total, totalPages: Math.ceil(total / filters.limit) },
    };
  }

  async get(messageId: string, context: MailContext) {
    const mailbox = await this.mailbox(context);
    const item = await prisma.mailboxMessage.findFirst({
      where: { tenantId: context.tenantId, mailboxId: mailbox.id, messageId },
      include: { message: { include: messageInclude } },
    });
    if (!item) throw new AppError("Message not found", 404, ErrorCodes.NOT_FOUND);
    return {
      ...item,
      message: {
        ...item.message,
        recipients: item.message.authorUserId === context.userId
          ? item.message.recipients
          : item.message.recipients.filter((recipient) => recipient.type !== "BCC"),
      },
    };
  }

  async updateMailboxItem(messageId: string, input: UpdateMailboxItemInput, context: MailContext) {
    const mailbox = await this.mailbox(context);
    const item = await prisma.mailboxMessage.findFirst({
      where: { tenantId: context.tenantId, mailboxId: mailbox.id, messageId },
    });
    if (!item) throw new AppError("Message not found", 404, ErrorCodes.NOT_FOUND);
    if (input.folder === "INBOX" && !["INBOX", "TRASH"].includes(item.folder)) {
      throw new AppError("Only inbox messages can be restored", 400, ErrorCodes.VALIDATION_ERROR);
    }
    return prisma.mailboxMessage.update({
      where: { id: item.id, tenantId: context.tenantId },
      data: { isRead: input.isRead, folder: input.folder as MailFolder | undefined },
    });
  }

  async addAttachment(messageId: string, file: Express.Multer.File, context: MailContext) {
    const mailbox = await this.mailbox(context);
    const draft = await prisma.emailMessage.findFirst({
      where: {
        id: messageId,
        tenantId: context.tenantId,
        authorUserId: context.userId,
        status: "DRAFT",
        mailboxItems: { some: { tenantId: context.tenantId, mailboxId: mailbox.id, folder: "DRAFTS" } },
      },
      select: { id: true },
    });
    if (!draft) throw new AppError("Draft not found", 404, ErrorCodes.NOT_FOUND);
    if (mailbox.storageUsed + BigInt(file.size) > mailbox.storageLimit) {
      throw new AppError("Mailbox storage quota exceeded", 413, ErrorCodes.VALIDATION_ERROR);
    }

    const storageKey = await attachmentStorage.save(file.buffer);
    try {
      return await prisma.$transaction(async (tx) => {
        const reserved = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          UPDATE "mailboxes"
          SET "storage_used" = "storage_used" + ${file.size},
              "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${mailbox.id}::uuid
            AND "tenant_id" = ${context.tenantId}::uuid
            AND "storage_used" + ${file.size} <= "storage_limit"
          RETURNING "id"
        `);
        if (reserved.length === 0) {
          throw new AppError("Mailbox storage quota exceeded", 413, ErrorCodes.VALIDATION_ERROR);
        }
        const attachment = await tx.messageAttachment.create({
          data: {
            tenantId: context.tenantId,
            messageId,
            fileName: file.originalname.slice(0, 255),
            contentType: file.mimetype,
            sizeBytes: file.size,
            storageKey,
          },
          select: { id: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true },
        });
        await this.audit(tx, context, "MAIL_ATTACHMENT_UPLOADED", attachment.id, {
          messageId,
          fileName: attachment.fileName,
          sizeBytes: attachment.sizeBytes,
        });
        return attachment;
      });
    } catch (error) {
      await attachmentStorage.delete(storageKey);
      throw error;
    }
  }

  async downloadAttachment(messageId: string, attachmentId: string, context: MailContext) {
    const mailbox = await this.mailbox(context);
    const attachment = await prisma.messageAttachment.findFirst({
      where: {
        id: attachmentId,
        messageId,
        tenantId: context.tenantId,
        message: {
          tenantId: context.tenantId,
          mailboxItems: { some: { tenantId: context.tenantId, mailboxId: mailbox.id } },
        },
      },
    });
    if (!attachment) throw new AppError("Attachment not found", 404, ErrorCodes.NOT_FOUND);
    return {
      data: await attachmentStorage.read(attachment.storageKey),
      fileName: attachment.fileName,
      contentType: attachment.contentType,
    };
  }

  async deleteAttachment(messageId: string, attachmentId: string, context: MailContext) {
    const mailbox = await this.mailbox(context);
    const attachment = await prisma.messageAttachment.findFirst({
      where: {
        id: attachmentId,
        messageId,
        tenantId: context.tenantId,
        message: {
          tenantId: context.tenantId,
          authorUserId: context.userId,
          status: "DRAFT",
          mailboxItems: { some: { tenantId: context.tenantId, mailboxId: mailbox.id, folder: "DRAFTS" } },
        },
      },
    });
    if (!attachment) throw new AppError("Draft attachment not found", 404, ErrorCodes.NOT_FOUND);

    await prisma.$transaction(async (tx) => {
      await tx.messageAttachment.delete({ where: { id: attachment.id, tenantId: context.tenantId } });
      await tx.mailbox.update({
        where: { id: mailbox.id, tenantId: context.tenantId },
        data: { storageUsed: { decrement: attachment.sizeBytes } },
      });
      await this.audit(tx, context, "MAIL_ATTACHMENT_DELETED", attachment.id, { messageId });
    });
    await attachmentStorage.delete(attachment.storageKey);
    return { deleted: true };
  }

  private async audit(
    tx: Prisma.TransactionClient,
    context: MailContext,
    eventType: string,
    targetId: string,
    metadata?: Prisma.InputJsonValue
  ) {
    await auditService.record({
      tenantId: context.tenantId,
      actorUserId: context.userId,
      eventType,
      targetType: "EmailMessage",
      targetId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata,
    }, tx);
  }
}

export const mailService = new MailService();
