import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

export interface RecordAuditEventInput {
  tenantId: string;
  actorUserId?: string | null;
  eventType: string;
  targetType?: string | null;
  targetId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export class AuditService {
  async record(
    input: RecordAuditEventInput,
    tx: Prisma.TransactionClient = prisma
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId ?? null,
        eventType: input.eventType,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  }
}

export const auditService = new AuditService();
