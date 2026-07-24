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
  tags: ["System", "Authentication", "Users", "Tenants", "Memberships", "Policies", "Mail", "Messages", "Threads", "Domains", "AI", "Actions", "Notifications", "Integrations", "Audit"].map((name) => ({ name })),
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
    "/api/v1/policies": {
      get: { tags: ["Policies"], summary: "List versioned tenant policies (OWNER/ADMIN)", security: bearer, responses: { "200": ok("Policies returned") } },
      post: {
        tags: ["Policies"], summary: "Create a new draft policy version (OWNER/ADMIN)", security: bearer,
        requestBody: jsonBody({ $ref: "#/components/schemas/CreatePolicyRequest" }),
        responses: { "201": ok("Draft policy created") },
      },
    },
    "/api/v1/policies/evaluate": {
      post: {
        tags: ["Policies"], summary: "Evaluate the active tenant policy; fails closed if none exists", security: bearer,
        requestBody: jsonBody({ $ref: "#/components/schemas/EvaluatePolicyRequest" }),
        responses: { "200": ok("ALLOW or DENY decision returned") },
      },
    },
    "/api/v1/policies/{policyId}": {
      get: {
        tags: ["Policies"], summary: "Get one tenant policy", security: bearer,
        parameters: [{ name: "policyId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": ok("Policy returned"), "404": { $ref: "#/components/responses/NotFound" } },
      },
    },
    "/api/v1/policies/{policyId}/activate": {
      post: {
        tags: ["Policies"], summary: "Activate a policy and archive the previous active version", security: bearer,
        parameters: [{ name: "policyId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": ok("Policy activated") },
      },
    },
    "/api/v1/mail": {
      get: {
        tags: ["Mail"], summary: "List the current user's mailbox folder", security: bearer,
        parameters: [
          { name: "folder", in: "query", schema: { type: "string", enum: ["DRAFTS", "INBOX", "SENT", "TRASH"], default: "INBOX" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
        ],
        responses: { "200": ok("Mailbox items returned") },
      },
    },
    "/api/v1/messages": {
      get: {
        tags: ["Messages"], summary: "List and search messages accessible to the current mailbox", security: bearer,
        parameters: [
          { name: "folder", in: "query", schema: { type: "string", enum: ["DRAFTS", "INBOX", "SENT", "TRASH"] } },
          { name: "q", in: "query", schema: { type: "string", maxLength: 200 } },
          { name: "unreadOnly", in: "query", schema: { type: "boolean", default: false } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
        ],
        responses: { "200": ok("Messages returned") },
      },
    },
    "/api/v1/messages/{messageId}": {
      get: {
        tags: ["Messages"], summary: "Get one accessible normalized message", security: bearer,
        parameters: [{ name: "messageId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": ok("Message returned"), "404": { $ref: "#/components/responses/NotFound" } },
      },
    },
    "/api/v1/threads": {
      get: {
        tags: ["Threads"], summary: "List normalized conversation threads", security: bearer,
        parameters: [
          { name: "q", in: "query", schema: { type: "string", maxLength: 200 } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
        ],
        responses: { "200": ok("Threads returned") },
      },
    },
    "/api/v1/threads/{threadId}": {
      get: {
        tags: ["Threads"], summary: "Get an authorized thread timeline", security: bearer,
        parameters: [{ name: "threadId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": ok("Thread timeline returned"), "404": { $ref: "#/components/responses/NotFound" } },
      },
    },
    "/api/v1/domains": {
      get: { tags: ["Domains"], summary: "List tenant domains", security: bearer, responses: { "200": ok("Domains returned") } },
      post: { tags: ["Domains"], summary: "Add a custom domain", security: bearer, responses: { "201": ok("Domain and verification record created") } },
    },
    "/api/v1/domains/{domainId}/diagnostics": {
      post: { tags: ["Domains"], summary: "Verify TXT, MX, SPF, DKIM and DMARC records", security: bearer, responses: { "200": ok("DNS diagnostics returned") } },
    },
    "/api/v1/ai/actions": {
      get: { tags: ["AI"], summary: "List the user's governed AI actions", security: bearer, responses: { "200": ok("AI actions returned") } },
      post: { tags: ["AI"], summary: "Request a policy-checked AI action without invoking a provider", security: bearer, responses: { "202": ok("AI action queued") } },
    },
    "/api/v1/actions": {
      get: { tags: ["Actions"], summary: "List owned commitments", security: bearer, responses: { "200": ok("Actions returned") } },
      post: { tags: ["Actions"], summary: "Create or assign a source-linked commitment", security: bearer, responses: { "201": ok("Action created") } },
    },
    "/api/v1/notifications": {
      get: { tags: ["Notifications"], summary: "List in-app notifications", security: bearer, responses: { "200": ok("Notifications returned") } },
    },
    "/api/v1/integrations": {
      get: { tags: ["Integrations"], summary: "List source-linked integration records", security: bearer, responses: { "200": ok("Integration links returned") } },
      post: { tags: ["Integrations"], summary: "Create a pending Zoiko integration link without external calls", security: bearer, responses: { "201": ok("Integration link created") } },
    },
    "/api/v1/mail/drafts": {
      post: {
        tags: ["Mail"], summary: "Create a draft", security: bearer,
        requestBody: jsonBody({ $ref: "#/components/schemas/CreateDraftRequest" }),
        responses: { "201": ok("Draft created") },
      },
    },
    "/api/v1/mail/drafts/{messageId}": {
      patch: {
        tags: ["Mail"], summary: "Update an owned draft", security: bearer,
        parameters: [{ name: "messageId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: jsonBody({ $ref: "#/components/schemas/CreateDraftRequest" }),
        responses: { "200": ok("Draft updated"), "404": { $ref: "#/components/responses/NotFound" } },
      },
    },
    "/api/v1/mail/drafts/{messageId}/send": {
      post: {
        tags: ["Mail"], summary: "Send a draft after tenant policy evaluation", security: bearer,
        parameters: [{ name: "messageId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": ok("Internal recipients delivered and external recipients queued"), "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/v1/mail/drafts/{messageId}/attachments": {
      post: {
        tags: ["Mail"], summary: "Upload one attachment to an owned draft", security: bearer,
        parameters: [{ name: "messageId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object", required: ["file"],
                properties: { file: { type: "string", format: "binary" } },
              },
            },
          },
        },
        responses: { "201": ok("Attachment uploaded"), "413": { description: "File or mailbox quota exceeded" }, "415": { description: "File type not allowed" } },
      },
    },
    "/api/v1/mail/{messageId}/attachments/{attachmentId}": {
      get: {
        tags: ["Mail"], summary: "Download an authorized message attachment", security: bearer,
        parameters: [
          { name: "messageId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "attachmentId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: { "200": { description: "Attachment bytes" }, "404": { $ref: "#/components/responses/NotFound" } },
      },
    },
    "/api/v1/mail/{messageId}/delivery-events": {
      get: {
        tags: ["Mail"], summary: "List delivery events for a message authored by the current user", security: bearer,
        parameters: [{ name: "messageId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": ok("Delivery events returned"), "404": { $ref: "#/components/responses/NotFound" } },
      },
    },
    "/api/v1/mail/admin/mailboxes/{mailboxId}/sending": {
      patch: {
        tags: ["Mail"], summary: "Suspend or resume mailbox sending (OWNER/ADMIN)", security: bearer,
        parameters: [{ name: "mailboxId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object", required: ["suspended"],
                properties: {
                  suspended: { type: "boolean" },
                  reason: { type: "string", minLength: 3, maxLength: 500 },
                },
              },
            },
          },
        },
        responses: { "200": ok("Mailbox sending status updated"), "403": { $ref: "#/components/responses/Forbidden" } },
      },
    },
    "/api/v1/mail/drafts/{messageId}/attachments/{attachmentId}": {
      delete: {
        tags: ["Mail"], summary: "Delete an attachment from an owned draft", security: bearer,
        parameters: [
          { name: "messageId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "attachmentId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: { "200": ok("Attachment deleted"), "404": { $ref: "#/components/responses/NotFound" } },
      },
    },
    "/api/v1/mail/{messageId}": {
      get: {
        tags: ["Mail"], summary: "Get a message from the current user's mailbox", security: bearer,
        parameters: [{ name: "messageId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": ok("Message returned"), "404": { $ref: "#/components/responses/NotFound" } },
      },
      patch: {
        tags: ["Mail"], summary: "Mark read, move to trash, or restore an inbox message", security: bearer,
        parameters: [{ name: "messageId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: jsonBody({ $ref: "#/components/schemas/UpdateMailboxItemRequest" }),
        responses: { "200": ok("Mailbox item updated") },
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
      CreatePolicyRequest: {
        type: "object", required: ["type", "name", "rules"],
        properties: {
          type: { type: "string", enum: ["AI", "SENDING", "RETENTION", "DELETION", "ABUSE"] },
          name: { type: "string" }, description: { type: "string", nullable: true },
          rules: { $ref: "#/components/schemas/PolicyRules" },
        },
      },
      EvaluatePolicyRequest: {
        type: "object", required: ["type", "context"],
        properties: { type: { type: "string", enum: ["AI", "SENDING", "RETENTION", "DELETION", "ABUSE"] }, context: { type: "object", additionalProperties: true } },
      },
      PolicyRules: {
        type: "object", required: ["defaultEffect"],
        properties: {
          defaultEffect: { type: "string", enum: ["ALLOW", "DENY"] },
          conditions: { type: "array", items: { type: "object", required: ["field", "operator", "value", "effect"], properties: { field: { type: "string" }, operator: { type: "string", enum: ["EQUALS", "NOT_EQUALS", "IN", "GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL"] }, value: {}, effect: { type: "string", enum: ["ALLOW", "DENY"] } } } },
        },
      },
      CreateDraftRequest: {
        type: "object", required: ["recipients"],
        properties: {
          subject: { type: "string", maxLength: 998 },
          textBody: { type: "string", nullable: true },
          htmlBody: { type: "string", nullable: true },
          recipients: {
            type: "object", required: ["to"],
            properties: {
              to: { type: "array", minItems: 1, maxItems: 100, items: { type: "string", format: "email" } },
              cc: { type: "array", maxItems: 100, items: { type: "string", format: "email" } },
              bcc: { type: "array", maxItems: 100, items: { type: "string", format: "email" } },
            },
          },
        },
      },
      UpdateMailboxItemRequest: {
        type: "object", minProperties: 1,
        properties: { isRead: { type: "boolean" }, folder: { type: "string", enum: ["INBOX", "TRASH"] } },
      },
    },
  },
} as const;
