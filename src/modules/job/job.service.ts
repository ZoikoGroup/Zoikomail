import type { JobType, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { ErrorCodes } from "../../common/errors/errorCodes.js";
export class JobService {
  enqueue(input: { tenantId: string; userId: string; type: JobType; payload: Prisma.InputJsonValue; idempotencyKey: string }, tx: Prisma.TransactionClient = prisma) {
    return tx.backgroundJob.upsert({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
      create: { tenantId: input.tenantId, createdByUserId: input.userId, type: input.type, payload: input.payload, idempotencyKey: input.idempotencyKey },
      update: {},
    });
  }
  list(tenantId: string) { return prisma.backgroundJob.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 100 }); }
  async get(id: string, tenantId: string) {
    const job = await prisma.backgroundJob.findFirst({ where: { id, tenantId } });
    if (!job) throw new AppError("Job not found", 404, ErrorCodes.NOT_FOUND);
    return job;
  }
  async claim() {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "background_jobs" SET "status"='RUNNING',"locked_at"=CURRENT_TIMESTAMP,
      "attempts"="attempts"+1,"updated_at"=CURRENT_TIMESTAMP
      WHERE "id"=(SELECT "id" FROM "background_jobs" WHERE "status" IN ('PENDING','RETRY')
      AND "run_at"<=CURRENT_TIMESTAMP ORDER BY "run_at" FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING "id"`;
    return rows[0] ? prisma.backgroundJob.findUnique({ where: { id: rows[0].id } }) : null;
  }
  complete(id: string, tenantId: string, result: Prisma.InputJsonValue) {
    return prisma.backgroundJob.update({ where: { id, tenantId }, data: { status: "COMPLETED", result, completedAt: new Date(), lockedAt: null } });
  }
  async fail(id: string, tenantId: string, error: string) {
    const job = await this.get(id, tenantId);
    const retry = job.attempts < job.maxAttempts;
    return prisma.backgroundJob.update({ where: { id, tenantId }, data: { status: retry ? "RETRY" : "FAILED", lastError: error.slice(0, 1000), lockedAt: null, runAt: retry ? new Date(Date.now() + 30_000 * 2 ** Math.max(0, job.attempts - 1)) : job.runAt } });
  }
}
export const jobService = new JobService();
