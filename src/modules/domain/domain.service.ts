import { randomBytes } from "node:crypto";
import { resolveMx, resolveTxt } from "node:dns/promises";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../common/errors/AppError.js";
import { ErrorCodes } from "../../common/errors/errorCodes.js";
import { auditService } from "../audit/audit.service.js";

async function txt(name: string) {
  try { return (await resolveTxt(name)).map((parts) => parts.join("")); } catch { return []; }
}

export class DomainService {
  list(tenantId: string) {
    return prisma.mailDomain.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
  }
  async add(domainName: string, tenantId: string, userId: string) {
    const existing = await prisma.mailDomain.findFirst({ where: { tenantId, domainName } });
    if (existing) throw new AppError("Domain already exists", 409, ErrorCodes.CONFLICT);
    const domain = await prisma.mailDomain.create({
      data: { tenantId, domainName, verificationToken: `zoiko-mail-verification=${randomBytes(24).toString("hex")}` },
    });
    await auditService.record({ tenantId, actorUserId: userId, eventType: "DOMAIN_ADDED", targetType: "MailDomain", targetId: domain.id });
    return domain;
  }
  async diagnostics(domainId: string, tenantId: string, userId: string) {
    const domain = await prisma.mailDomain.findFirst({ where: { id: domainId, tenantId } });
    if (!domain) throw new AppError("Domain not found", 404, ErrorCodes.NOT_FOUND);
    const [rootTxt, dmarc, dkim, mx] = await Promise.all([
      txt(domain.domainName), txt(`_dmarc.${domain.domainName}`), txt(`default._domainkey.${domain.domainName}`),
      resolveMx(domain.domainName).catch(() => []),
    ]);
    const data = {
      verificationStatus: rootTxt.includes(domain.verificationToken) ? "VERIFIED" as const : "PENDING" as const,
      mxStatus: mx.length ? "VALID" as const : "INVALID" as const,
      spfStatus: rootTxt.some((v) => v.toLowerCase().startsWith("v=spf1")) ? "VALID" as const : "INVALID" as const,
      dkimStatus: dkim.some((v) => v.toLowerCase().includes("v=dkim1")) ? "VALID" as const : "INVALID" as const,
      dmarcStatus: dmarc.some((v) => v.toLowerCase().startsWith("v=dmarc1")) ? "VALID" as const : "INVALID" as const,
      lastCheckedAt: new Date(),
    };
    const updated = await prisma.mailDomain.update({ where: { id: domain.id, tenantId }, data });
    await auditService.record({ tenantId, actorUserId: userId, eventType: "DOMAIN_DNS_CHECKED", targetType: "MailDomain", targetId: domain.id });
    return { ...updated, records: { verificationTxt: domain.verificationToken, dkimHost: `default._domainkey.${domain.domainName}`, dmarcHost: `_dmarc.${domain.domainName}` } };
  }
}
export const domainService = new DomainService();
