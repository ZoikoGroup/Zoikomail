import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();

describe("Production runtime foundation", () => {
  it("returns request IDs and hardened HTTP headers", async () => {
    const response = await request(app)
      .get("/api/health")
      .set("X-Request-Id", "runtime-test-request")
      .expect(200);

    expect(response.headers["x-request-id"]).toBe("runtime-test-request");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("reports database readiness", async () => {
    const response = await request(app).get("/api/ready").expect(200);
    expect(response.body.data).toMatchObject({ status: "READY", database: "UP" });
  });

  it("compresses sufficiently large responses when requested", async () => {
    const response = await request(app)
      .get("/api/docs.json")
      .set("Accept-Encoding", "gzip")
      .expect(200);
    expect(response.headers["content-encoding"]).toBe("gzip");
  });
});
