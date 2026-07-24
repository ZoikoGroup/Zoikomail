import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { authHeader, registerUser } from "./helpers.js";
import { prisma } from "../src/config/prisma.js";
import { env } from "../src/config/env.js";

const app = createApp();

async function activateAllowSendingPolicy(accessToken: string) {
  const created = await request(app)
    .post("/api/v1/policies")
    .set(authHeader(accessToken))
    .send({
      type: "SENDING",
      name: "Allow sending",
      rules: { defaultEffect: "ALLOW", conditions: [] },
    })
    .expect(201);
  await request(app)
    .post(`/api/v1/policies/${created.body.data.id}/activate`)
    .set(authHeader(accessToken))
    .expect(200);
}

describe("Mail module", () => {
  it("creates a draft and fails closed when no sending policy is active", async () => {
    const owner = await registerUser(app, { email: "mail-policy@zoiko.test" });
    const draft = await request(app)
      .post("/api/v1/mail/drafts")
      .set(authHeader(owner.accessToken))
      .send({
        subject: "Policy check",
        textBody: "Hello",
        recipients: { to: ["external@example.com"] },
      })
      .expect(201);

    const denied = await request(app)
      .post(`/api/v1/mail/drafts/${draft.body.data.id}/send`)
      .set(authHeader(owner.accessToken))
      .expect(403);
    expect(denied.body.error.message).toContain("NO_ACTIVE_POLICY");
  });

  it("delivers internal mail to inbox and queues external recipients", async () => {
    const owner = await registerUser(app, { email: "sender@zoiko.test" });
    const member = await registerUser(app, { email: "recipient@zoiko.test" });
    await request(app)
      .post("/api/v1/membership/members")
      .set(authHeader(owner.accessToken))
      .send({ email: member.email, role: "MEMBER" })
      .expect(201);
    const memberLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: member.email, password: member.password, tenantId: owner.tenantId })
      .expect(200);
    await activateAllowSendingPolicy(owner.accessToken);

    const draft = await request(app)
      .post("/api/v1/mail/drafts")
      .set(authHeader(owner.accessToken))
      .send({
        subject: "Welcome",
        textBody: "Internal delivery",
        recipients: { to: [member.email, "outside@example.com"] },
      })
      .expect(201);
    const sent = await request(app)
      .post(`/api/v1/mail/drafts/${draft.body.data.id}/send`)
      .set(authHeader(owner.accessToken))
      .expect(200);

    expect(sent.body.data.status).toBe("SENT");
    expect(sent.body.data.recipients).toEqual(expect.arrayContaining([
      expect.objectContaining({ email: member.email, deliveryStatus: "DELIVERED" }),
      expect.objectContaining({ email: "outside@example.com", deliveryStatus: "QUEUED" }),
    ]));
    const deliveryEvents = await request(app)
      .get(`/api/v1/mail/${draft.body.data.id}/delivery-events`)
      .set(authHeader(owner.accessToken))
      .expect(200);
    expect(deliveryEvents.body.data.events.map((event: { type: string }) => event.type)).toEqual(
      expect.arrayContaining(["DELIVERED", "QUEUED"])
    );

    const inbox = await request(app)
      .get("/api/v1/mail?folder=INBOX")
      .set(authHeader(memberLogin.body.data.accessToken))
      .expect(200);
    expect(inbox.body.data.items).toHaveLength(1);
    expect(inbox.body.data.items[0].message.subject).toBe("Welcome");

    await request(app)
      .patch(`/api/v1/mail/${draft.body.data.id}`)
      .set(authHeader(memberLogin.body.data.accessToken))
      .send({ isRead: true, folder: "TRASH" })
      .expect(200);
    const trash = await request(app)
      .get("/api/v1/mail?folder=TRASH")
      .set(authHeader(memberLogin.body.data.accessToken))
      .expect(200);
    expect(trash.body.data.items[0].isRead).toBe(true);
  });

  it("prevents another tenant from reading a message by id", async () => {
    const first = await registerUser(app, { email: "mail-first@zoiko.test" });
    const second = await registerUser(app, { email: "mail-second@zoiko.test" });
    const draft = await request(app)
      .post("/api/v1/mail/drafts")
      .set(authHeader(first.accessToken))
      .send({ subject: "Private", recipients: { to: ["outside@example.com"] } })
      .expect(201);

    await request(app)
      .get(`/api/v1/mail/${draft.body.data.id}`)
      .set(authHeader(second.accessToken))
      .expect(404);
  });

  it("uploads, authorizes, downloads and deletes a draft attachment", async () => {
    const owner = await registerUser(app, { email: "attachment-owner@zoiko.test" });
    const outsider = await registerUser(app, { email: "attachment-outsider@zoiko.test" });
    const draft = await request(app)
      .post("/api/v1/mail/drafts")
      .set(authHeader(owner.accessToken))
      .send({ subject: "Attachment", recipients: { to: ["outside@example.com"] } })
      .expect(201);

    const uploaded = await request(app)
      .post(`/api/v1/mail/drafts/${draft.body.data.id}/attachments`)
      .set(authHeader(owner.accessToken))
      .attach("file", Buffer.from("confidential attachment"), {
        filename: "evidence.txt",
        contentType: "text/plain",
      })
      .expect(201);
    expect(uploaded.body.data).toMatchObject({
      fileName: "evidence.txt",
      contentType: "text/plain",
      sizeBytes: 23,
    });
    expect(uploaded.body.data.storageKey).toBeUndefined();

    await request(app)
      .get(`/api/v1/mail/${draft.body.data.id}/attachments/${uploaded.body.data.id}`)
      .set(authHeader(outsider.accessToken))
      .expect(404);

    const downloaded = await request(app)
      .get(`/api/v1/mail/${draft.body.data.id}/attachments/${uploaded.body.data.id}`)
      .set(authHeader(owner.accessToken))
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(downloaded.body.toString()).toBe("confidential attachment");
    expect(downloaded.headers["content-disposition"]).toContain("evidence.txt");

    await request(app)
      .delete(`/api/v1/mail/drafts/${draft.body.data.id}/attachments/${uploaded.body.data.id}`)
      .set(authHeader(owner.accessToken))
      .expect(200);
    await request(app)
      .get(`/api/v1/mail/${draft.body.data.id}/attachments/${uploaded.body.data.id}`)
      .set(authHeader(owner.accessToken))
      .expect(404);
  });

  it("rejects unsafe types and enforces mailbox storage quota", async () => {
    const owner = await registerUser(app, { email: "attachment-quota@zoiko.test" });
    const draft = await request(app)
      .post("/api/v1/mail/drafts")
      .set(authHeader(owner.accessToken))
      .send({ subject: "Quota", recipients: { to: ["outside@example.com"] } })
      .expect(201);

    await request(app)
      .post(`/api/v1/mail/drafts/${draft.body.data.id}/attachments`)
      .set(authHeader(owner.accessToken))
      .attach("file", Buffer.from("script"), { filename: "bad.exe", contentType: "application/x-msdownload" })
      .expect(415);

    await prisma.mailbox.update({
      where: { membershipId: owner.membershipId },
      data: { storageLimit: 2 },
    });
    await request(app)
      .post(`/api/v1/mail/drafts/${draft.body.data.id}/attachments`)
      .set(authHeader(owner.accessToken))
      .attach("file", Buffer.from("too large for quota"), { filename: "quota.txt", contentType: "text/plain" })
      .expect(413);
  });

  it("enforces persistent send limits and audited mailbox suspension", async () => {
    const owner = await registerUser(app, { email: "send-controls@zoiko.test" });
    await activateAllowSendingPolicy(owner.accessToken);
    const firstDraft = await request(app)
      .post("/api/v1/mail/drafts")
      .set(authHeader(owner.accessToken))
      .send({ subject: "Rate limited", recipients: { to: ["outside@example.com"] } })
      .expect(201);
    const mailbox = await prisma.mailbox.findUniqueOrThrow({
      where: { membershipId: owner.membershipId },
    });
    await prisma.mailbox.update({
      where: { id: mailbox.id },
      data: {
        sendRecipientCount: env.MAIL_MAX_RECIPIENTS_PER_WINDOW,
        sendWindowStartedAt: new Date(Date.now() + 86_400_000),
      },
    });
    expect((await prisma.mailbox.findUniqueOrThrow({ where: { id: mailbox.id } })).sendRecipientCount)
      .toBe(env.MAIL_MAX_RECIPIENTS_PER_WINDOW);
    await request(app)
      .post(`/api/v1/mail/drafts/${firstDraft.body.data.id}/send`)
      .set(authHeader(owner.accessToken))
      .expect(429);

    await request(app)
      .patch(`/api/v1/mail/admin/mailboxes/${mailbox.id}/sending`)
      .set(authHeader(owner.accessToken))
      .send({ suspended: true, reason: "Abuse review" })
      .expect(200);
    await request(app)
      .post(`/api/v1/mail/drafts/${firstDraft.body.data.id}/send`)
      .set(authHeader(owner.accessToken))
      .expect(403);

    await request(app)
      .patch(`/api/v1/mail/admin/mailboxes/${mailbox.id}/sending`)
      .set(authHeader(owner.accessToken))
      .send({ suspended: false })
      .expect(200);
    await request(app)
      .post(`/api/v1/mail/drafts/${firstDraft.body.data.id}/send`)
      .set(authHeader(owner.accessToken))
      .expect(200);

    const auditTypes = (await prisma.auditEvent.findMany({
      where: { tenantId: owner.tenantId },
      select: { eventType: true },
    })).map((event) => event.eventType);
    expect(auditTypes).toEqual(expect.arrayContaining([
      "MAIL_SEND_RATE_LIMITED",
      "MAILBOX_SENDING_SUSPENDED",
      "MAIL_SEND_SUSPENDED_DENIED",
      "MAILBOX_SENDING_RESUMED",
    ]));
  });
});
