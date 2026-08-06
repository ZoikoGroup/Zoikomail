/** Single source of truth for every path in the authentication surface. */
export const ROUTES = {
  root: '/',

  signIn: '/signin',
  mfa: '/signin/mfa',
  workspaceSelect: '/signin/workspace',
  failed: '/signin/failed',
  locked: '/signin/locked',
  blocked: '/signin/blocked',
  expired: '/signin/expired',
  revoked: '/signin/revoked',
  dormant: '/signin/dormant',
  recovery: '/signin/recovery',

  signUp: '/signup',

  /**
   * Where a newly created account lands after signing in. A placeholder until
   * the product surfaces exist — the authentication work stops here.
   */
  dashboard: '/dashboard',

  accountSuspended: '/account/suspended',
  invitationPending: '/account/invitation',
  noWorkspace: '/account/no-workspace',

  membershipSuspended: '/workspace/membership-suspended',
  workspaceSuspended: '/workspace/suspended',
  workspaceDeleting: '/workspace/deleting',

  welcome: '/welcome',

  legalTerms: '/legal/terms',
  legalPrivacy: '/legal/privacy',
  legalCookies: '/legal/cookies',
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteKey];
