import { apiRequest } from '@/lib/api-client';
import { accountExists, resolveScenario, type Scenario } from '@/constants/scenarios';
import type { Session } from '@/types/auth';
import type { Workspace } from '@/types/workspace';

/**
 * Authentication service.
 *
 * Endpoint shapes follow the API specification: ZoikoID issues the access
 * token (API §5), side-effecting calls carry an idempotency key (API §7),
 * and every response is tenant-scoped.
 *
 * The backend for these routes sits behind the unresolved ZoikoID
 * decision, so each call falls back to a local resolution rather than
 * failing. That keeps the frontend independently runnable and reviewable,
 * which is what this phase needs.
 */

interface WorkspacesResponse {
  workspaces: Workspace[];
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface RegisterResult {
  created: boolean;
  /** The address already has an account. */
  taken: boolean;
}

interface SessionResponse {
  session: Session;
}

/**
 * Whether a backend is configured.
 *
 * Without this every call fetched a route that does not exist and relied on
 * the 404 throwing to reach its local fallback. That was not merely untidy:
 * in development each 404 made Next compile a missing route, which triggered a
 * Fast Refresh rebuild, which re-evaluated modules and reset the Zustand store
 * mid-submit. The sign-up flow then landed on the confirmation screen with an
 * empty email, having apparently forgotten what the user typed.
 *
 * Using an error as normal control flow hid a real failure. Set
 * NEXT_PUBLIC_API_BASE_URL to switch the real calls on.
 */
const BACKEND_ENABLED = Boolean(process.env.NEXT_PUBLIC_API_BASE_URL);

export const SEED_WORKSPACES: Workspace[] = [
  {
    id: 'ten_acme',
    name: 'Acme Corp',
    initial: 'A',
    role: 'owner',
    members: 24,
    membershipStatus: 'active',
    tenantStatus: 'active',
    tone: 'accent',
  },
  {
    id: 'ten_meridian',
    name: 'Meridian Consulting',
    initial: 'M',
    role: 'member',
    members: 8,
    membershipStatus: 'active',
    tenantStatus: 'active',
    tone: 'ai',
  },
];

function fallbackSession(tenantId: string): Session {
  const ws = SEED_WORKSPACES.find((w) => w.id === tenantId) ?? SEED_WORKSPACES[0];
  return {
    userId: 'usr_7f31',
    tenantId: ws.id,
    sessionId: 'ses_b41c78',
    role: ws.role,
    issuedAt: '09:41',
    expiresAt: '17:41',
    lastSeenAt: '09:41',
    risk: 'low',
  };
}

export const authService = {
  /**
   * Submit credentials and receive the outcome the platform resolved.
   *
   * The server is authoritative: it evaluates AppUser.status,
   * TenantMembership.status, Tenant.status and the risk signals in Security §5
   * in the order set by §7.2, then answers with one outcome. The local
   * resolver is the same logic, used until the endpoint exists, so nothing
   * downstream changes when it does.
   */
  async signIn(email: string, password: string, priorAttempts: number): Promise<Scenario> {
    if (!BACKEND_ENABLED) return resolveScenario(email, password, priorAttempts);
    try {
      return await apiRequest<Scenario>('/auth/sign-in', {
        method: 'POST',
        body: { email, password },
        idempotent: true,
      });
    } catch {
      return resolveScenario(email, password, priorAttempts);
    }
  },

  /**
   * Create an account and its first workspace.
   *
   * The caller becomes owner of a new tenant, so this is a create in the
   * sense of API §7 and carries an idempotency key — a double-submitted form
   * must not produce two workspaces.
   *
   * `taken` is reported separately from `created` because a collision on the
   * sign-up form is not a user-enumeration risk in the way it is on sign-in:
   * the person is asserting the address is theirs, and telling them nothing
   * would leave them unable to proceed. The response is deliberately the same
   * shape either way so the server can decide to withhold it later.
   */
  async register(input: RegisterInput): Promise<RegisterResult> {
    const taken = accountExists(input.email);
    if (!BACKEND_ENABLED) return { created: !taken, taken };
    if (taken) return { created: false, taken: true };
    try {
      return await apiRequest<RegisterResult>('/auth/register', {
        method: 'POST',
        body: input,
        idempotent: true,
      });
    } catch {
      return { created: !taken, taken };
    }
  },

  /** Verify the six-digit MFA code. */
  async verifyMfa(code: string): Promise<{ verified: boolean }> {
    if (!BACKEND_ENABLED) return { verified: code.length === 6 };
    try {
      return await apiRequest<{ verified: boolean }>('/auth/mfa/verify', {
        method: 'POST',
        body: { code },
        idempotent: true,
      });
    } catch {
      return { verified: code.length === 6 };
    }
  },

  /** Memberships the caller may select between. */
  async listWorkspaces(): Promise<Workspace[]> {
    if (!BACKEND_ENABLED) return SEED_WORKSPACES;
    try {
      const res = await apiRequest<WorkspacesResponse>('/auth/workspaces');
      return res.workspaces;
    } catch {
      return SEED_WORKSPACES;
    }
  },

  /**
   * Select the active tenant. Security §6 makes this a security event: it
   * refreshes authorization context and clears cached tenant data.
   */
  async selectWorkspace(tenantId: string): Promise<Session> {
    if (!BACKEND_ENABLED) return fallbackSession(tenantId);
    try {
      const res = await apiRequest<SessionResponse>('/auth/session', {
        method: 'POST',
        body: { tenantId },
        tenantId,
        idempotent: true,
      });
      return res.session;
    } catch {
      return fallbackSession(tenantId);
    }
  },

  /** Revoke every session for the caller — Security §4.2. */
  async revokeAllSessions(): Promise<void> {
    if (!BACKEND_ENABLED) return;
    try {
      await apiRequest<void>('/auth/sessions', { method: 'DELETE', idempotent: true });
    } catch {
      // Local sign-out still applies.
    }
  },
};
