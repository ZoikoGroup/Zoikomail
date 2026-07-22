const jsonBody = (schema: Record<string, unknown>) => ({ required: true, content: { "application/json": { schema } } });
const bearer = [{ bearerAuth: [] }];
const ok = (description: string) => ({ description });

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Zoiko Mail API",
    version: "1.0.0",
    description: "Multi-tenant Zoiko Mail API. Tenant context is always derived from the verified access token.",
  },
  servers: [{ url: "http://localhost:5000", description: "Local development" }],
  tags: ["System", "Authentication", "Users", "Tenants", "Memberships", "Audit"].map((name) => ({ name })),
  paths: {
    "/api/health": {
      get: { tags: ["System"], summary: "Health check", responses: { "200": ok("API is healthy") } },
    },
    "/api/ready": {
      get: { tags: ["System"], summary: "Database readiness check", responses: { "200": ok("API and database are ready"), "500": ok("Database unavailable") } },
    },
    "/api/v1/auth/register": {
      post: {
        tags: ["Authentication"], summary: "Register a user and tenant",
        requestBody: jsonBody({ $ref: "#/components/schemas/RegisterRequest" }),
        responses: { "201": ok("User, tenant, OWNER membership and session created"), "409": { $ref: "#/components/responses/Conflict" } },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Authentication"], summary: "Login or request tenant selection",
        requestBody: jsonBody({ $ref: "#/components/schemas/LoginRequest" }),
        responses: { "200": ok("Session or tenant selection returned"), "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/auth/refresh": {
      post: {
        tags: ["Authentication"], summary: "Rotate refresh token",
        requestBody: jsonBody({ $ref: "#/components/schemas/RefreshTokenRequest" }),
        responses: { "200": ok("New access and refresh tokens"), "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Authentication"], summary: "Revoke one refresh token",
        requestBody: jsonBody({ $ref: "#/components/schemas/RefreshTokenRequest" }),
        responses: { "200": ok("Logged out") },
      },
    },
    "/api/v1/auth/me": {
      get: { tags: ["Authentication"], summary: "Get current session", security: bearer, responses: { "200": ok("Current session data") } },
    },
    "/api/v1/auth/change-password": {
      post: {
        tags: ["Authentication"], summary: "Change password and revoke refresh sessions", security: bearer,
        requestBody: jsonBody({ $ref: "#/components/schemas/ChangePasswordRequest" }),
        responses: { "200": ok("Password changed"), "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/v1/auth/logout-all": {
      post: { tags: ["Authentication"], summary: "Revoke all refresh sessions in this tenant", security: bearer, responses: { "200": ok("Sessions revoked") } },
    },
    "/api/v1/users/me": {
      get: { tags: ["Users"], summary: "Get own profile", security: bearer, responses: { "200": ok("Profile returned") } },
      patch: {
        tags: ["Users"], summary: "Update own profile", security: bearer,
        requestBody: jsonBody({ $ref: "#/components/schemas/UpdateProfileRequest" }),
        responses: { "200": ok("Profile updated"), "400": { $ref: "#/components/responses/ValidationError" } },
      },
    },
    "/api/v1/tenants/current": {
      get: { tags: ["Tenants"], summary: "Get JWT tenant settings", security: bearer, responses: { "200": ok("Tenant returned") } },
      patch: {
        tags: ["Tenants"], summary: "Update tenant settings (OWNER/ADMIN)", security: bearer,
        requestBody: jsonBody({ $ref: "#/components/schemas/UpdateTenantRequest" }),
        responses: { "200": ok("Tenant updated"), "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/v1/membership/members": {
      get: { tags: ["Memberships"], summary: "List members (OWNER/ADMIN)", security: bearer, responses: { "200": ok("Members returned") } },
      post: {
        tags: ["Memberships"], summary: "Add an existing registered user", security: bearer,
        requestBody: jsonBody({ $ref: "#/components/schemas/AddMemberRequest" }),
        responses: { "201": ok("Membership created"), "409": { $ref: "#/components/responses/Conflict" } },
      },
    },
    "/api/v1/membership/members/{membershipId}": {
      parameters: [{ $ref: "#/components/parameters/MembershipId" }],
      patch: {
        tags: ["Memberships"], summary: "Update role or status", security: bearer,
        requestBody: jsonBody({ $ref: "#/components/schemas/UpdateMemberRequest" }),
        responses: { "200": ok("Membership updated"), "404": { $ref: "#/components/responses/NotFound" } },
      },
      delete: { tags: ["Memberships"], summary: "Soft-remove a member", security: bearer, responses: { "200": ok("Membership removed"), "409": { $ref: "#/components/responses/Conflict" } } },
    },
    "/api/v1/membership/invitations": {
      post: {
        tags: ["Memberships"], summary: "Create or rotate a time-limited invitation", security: bearer,
        requestBody: jsonBody({ $ref: "#/components/schemas/AddMemberRequest" }),
        responses: { "201": ok("Invitation created; raw token is returned once"), "409": { $ref: "#/components/responses/Conflict" } },
      },
    },
    "/api/v1/membership/invitations/accept": {
      post: {
        tags: ["Memberships"], summary: "Accept an invitation as its intended authenticated user", security: bearer,
        requestBody: jsonBody({ $ref: "#/components/schemas/AcceptInvitationRequest" }),
        responses: { "200": ok("Membership activated"), "401": { $ref: "#/components/responses/Unauthorized" }, "410": ok("Invitation expired") },
      },
    },
    "/api/v1/membership/invitations/{membershipId}": {
      delete: {
        tags: ["Memberships"], summary: "Cancel a pending invitation", security: bearer,
        parameters: [{ $ref: "#/components/parameters/MembershipId" }],
        responses: { "200": ok("Invitation cancelled"), "404": { $ref: "#/components/responses/NotFound" } },
      },
    },
    "/api/v1/audit/events": {
      get: {
        tags: ["Audit"], summary: "List audit events (OWNER/ADMIN)", security: bearer,
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
          { name: "eventType", in: "query", schema: { type: "string" } },
          { name: "actorUserId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "targetType", in: "query", schema: { type: "string" } },
          { name: "targetId", in: "query", schema: { type: "string" } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: { "200": ok("Paginated events returned"), "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/v1/audit/events/{eventId}": {
      get: {
        tags: ["Audit"], summary: "Get one audit event", security: bearer,
        parameters: [{ name: "eventId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": ok("Event returned"), "404": { $ref: "#/components/responses/NotFound" } },
      },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    parameters: { MembershipId: { name: "membershipId", in: "path", required: true, schema: { type: "string", format: "uuid" } } },
    responses: {
      ValidationError: { description: "Request validation failed" }, Unauthorized: { description: "Authentication failed" },
      Forbidden: { description: "Tenant or role access denied" }, NotFound: { description: "Tenant-scoped resource not found" }, Conflict: { description: "Resource state conflict" },
    },
    schemas: {
      RegisterRequest: {
        type: "object", required: ["email", "password", "displayName", "tenantName"],
        properties: { email: { type: "string", format: "email" }, password: { type: "string", format: "password", minLength: 8 }, displayName: { type: "string" }, tenantName: { type: "string" }, planCode: { type: "string", default: "starter" } },
      },
      LoginRequest: {
        type: "object", required: ["email", "password"],
        properties: { email: { type: "string", format: "email" }, password: { type: "string", format: "password" }, tenantId: { type: "string", format: "uuid" } },
      },
      RefreshTokenRequest: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } },
      ChangePasswordRequest: {
        type: "object", required: ["currentPassword", "newPassword"],
        properties: { currentPassword: { type: "string", format: "password" }, newPassword: { type: "string", format: "password", minLength: 8 } },
      },
      UpdateProfileRequest: {
        type: "object", minProperties: 1,
        properties: { displayName: { type: "string" }, avatarUrl: { type: "string", format: "uri", nullable: true }, phoneNumber: { type: "string", nullable: true }, timezone: { type: "string", example: "Asia/Kolkata" }, language: { type: "string", example: "en-IN" } },
      },
      UpdateTenantRequest: {
        type: "object", minProperties: 1,
        properties: { name: { type: "string" }, timezone: { type: "string" }, language: { type: "string" }, logoUrl: { type: "string", format: "uri", nullable: true }, allowedDomains: { type: "array", items: { type: "string" } }, settings: { type: "object", additionalProperties: true, nullable: true } },
      },
      AddMemberRequest: {
        type: "object", required: ["email", "role"], properties: { email: { type: "string", format: "email" }, role: { $ref: "#/components/schemas/MembershipRole" } },
      },
      UpdateMemberRequest: {
        type: "object", minProperties: 1, properties: { role: { $ref: "#/components/schemas/MembershipRole" }, status: { type: "string", enum: ["ACTIVE", "SUSPENDED"] } },
      },
      AcceptInvitationRequest: {
        type: "object", required: ["invitationToken"], properties: { invitationToken: { type: "string", minLength: 32 } },
      },
      MembershipRole: { type: "string", enum: ["OWNER", "ADMIN", "MEMBER", "SUPPORT"] },
    },
  },
} as const;
