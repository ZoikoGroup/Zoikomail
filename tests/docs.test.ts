import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();

describe("API documentation", () => {
  it("serves a complete OpenAPI document", async () => {
    const response = await request(app).get("/api/docs.json").expect(200);
    expect(response.body.openapi).toBe("3.0.3");
    expect(response.body.paths).toHaveProperty("/api/v1/auth/login");
    expect(response.body.paths).toHaveProperty("/api/v1/membership/members");
    expect(response.body.paths).toHaveProperty("/api/v1/membership/invitations");
    expect(response.body.paths).toHaveProperty("/api/v1/membership/invitations/accept");
    expect(response.body.paths).toHaveProperty("/api/v1/users/me");
    expect(response.body.paths).toHaveProperty("/api/v1/tenants/current");
    expect(response.body.paths).toHaveProperty("/api/v1/audit/events");
    expect(response.body.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
  });

  it("serves the interactive Swagger UI", async () => {
    const response = await request(app).get("/api/docs/").expect(200);
    expect(response.text).toContain("Zoiko Mail API Docs");
    expect(response.text).toContain('id="swagger-ui"');
  });
});
