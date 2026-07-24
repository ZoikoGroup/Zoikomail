import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { authHeader, registerUser } from "./helpers.js";

const app = createApp();
const rules = {
  defaultEffect: "ALLOW",
  conditions: [{ field: "recipient.external", operator: "EQUALS", value: true, effect: "DENY" }],
};

describe("Tenant policy module", () => {
  it("creates versions, activates one version, and evaluates deterministically", async () => {
    const owner = await registerUser(app, { email: "policy-owner@zoiko.test" });
    const first = await request(app).post("/api/v1/policies").set(authHeader(owner.accessToken))
      .send({ type: "SENDING", name: "Sending v1", rules }).expect(201);
    const second = await request(app).post("/api/v1/policies").set(authHeader(owner.accessToken))
      .send({ type: "SENDING", name: "Sending v2", rules: { ...rules, defaultEffect: "DENY" } }).expect(201);
    expect(first.body.data.version).toBe(1);
    expect(second.body.data.version).toBe(2);

    await request(app).post(`/api/v1/policies/${first.body.data.id}/activate`)
      .set(authHeader(owner.accessToken)).expect(200);
    await request(app).post(`/api/v1/policies/${second.body.data.id}/activate`)
      .set(authHeader(owner.accessToken)).expect(200);

    expect((await prisma.tenantPolicy.findUnique({ where: { id: first.body.data.id } }))?.status).toBe("ARCHIVED");
    const denied = await request(app).post("/api/v1/policies/evaluate").set(authHeader(owner.accessToken))
      .send({ type: "SENDING", context: { recipient: { external: true } } }).expect(200);
    expect(denied.body.data).toMatchObject({ effect: "DENY", reason: "CONDITION_MATCHED", version: 2 });
  });

  it("fails closed without an active policy and prevents cross-tenant reads", async () => {
    const first = await registerUser(app, { email: "policy-boundary-one@zoiko.test" });
    const second = await registerUser(app, { email: "policy-boundary-two@zoiko.test" });
    const policy = await request(app).post("/api/v1/policies").set(authHeader(first.accessToken))
      .send({ type: "AI", name: "AI policy", rules }).expect(201);

    await request(app).get(`/api/v1/policies/${policy.body.data.id}`)
      .set(authHeader(second.accessToken)).expect(404);
    const evaluation = await request(app).post("/api/v1/policies/evaluate")
      .set(authHeader(second.accessToken)).send({ type: "AI", context: {} }).expect(200);
    expect(evaluation.body.data).toMatchObject({ effect: "DENY", reason: "NO_ACTIVE_POLICY" });
  });

  it("allows members to evaluate but not administer policies", async () => {
    const owner = await registerUser(app, { email: "policy-admin-owner@zoiko.test" });
    const member = await registerUser(app, { email: "policy-member@zoiko.test" });
    await request(app).post("/api/v1/membership/members").set(authHeader(owner.accessToken))
      .send({ email: member.email, role: "MEMBER" }).expect(201);
    const login = await request(app).post("/api/v1/auth/login")
      .send({ email: member.email, password: member.password, tenantId: owner.tenantId }).expect(200);
    const token = login.body.data.accessToken;
    await request(app).post("/api/v1/policies/evaluate").set(authHeader(token))
      .send({ type: "ABUSE", context: {} }).expect(200);
    await request(app).get("/api/v1/policies").set(authHeader(token)).expect(403);
  });
});
