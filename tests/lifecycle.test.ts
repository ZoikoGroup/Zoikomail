import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { authHeader, registerUser } from "./helpers.js";
import { jobService } from "../src/modules/job/job.service.js";

const app = createApp();

describe("Background jobs and data lifecycle", () => {
  it("creates idempotent exports and approval-gated deletion jobs", async () => {
    const owner = await registerUser(app, { email: "lifecycle@zoiko.test" });
    const payload = { idempotencyKey: "export-run-0001", reason: "Customer backup" };
    const first = await request(app).post("/api/v1/lifecycle/exports").set(authHeader(owner.accessToken)).send(payload).expect(202);
    const second = await request(app).post("/api/v1/lifecycle/exports").set(authHeader(owner.accessToken)).send(payload).expect(202);
    expect(second.body.data.job.id).toBe(first.body.data.job.id);

    const deletion = await request(app).post("/api/v1/lifecycle/deletions").set(authHeader(owner.accessToken))
      .send({ idempotencyKey: "delete-request-01", reason: "Tenant closure requested" }).expect(202);
    expect(deletion.body.data.status).toBe("REQUESTED");
    const approved = await request(app).post(`/api/v1/lifecycle/${deletion.body.data.id}/approve`)
      .set(authHeader(owner.accessToken)).expect(202);
    expect(approved.body.data.request.status).toBe("APPROVED");

    const jobs = await request(app).get("/api/v1/jobs").set(authHeader(owner.accessToken)).expect(200);
    expect(jobs.body.data.jobs).toHaveLength(2);
  });

  it("claims, retries and completes jobs without cross-tenant visibility", async () => {
    const first = await registerUser(app, { email: "jobs-first@zoiko.test" });
    const second = await registerUser(app, { email: "jobs-second@zoiko.test" });
    const queued = await request(app).post("/api/v1/lifecycle/exports").set(authHeader(first.accessToken))
      .send({ idempotencyKey: "worker-job-0001" }).expect(202);
    await request(app).get(`/api/v1/jobs/${queued.body.data.job.id}`).set(authHeader(second.accessToken)).expect(404);

    const claimed = await jobService.claim();
    expect(claimed?.status).toBe("RUNNING");
    const retry = await jobService.fail(claimed!.id, first.tenantId, "Temporary failure");
    expect(retry.status).toBe("RETRY");
    await jobService.complete(retry.id, first.tenantId, { exportReady: true });
    const completed = await request(app).get(`/api/v1/jobs/${retry.id}`).set(authHeader(first.accessToken)).expect(200);
    expect(completed.body.data.status).toBe("COMPLETED");
  });
});
