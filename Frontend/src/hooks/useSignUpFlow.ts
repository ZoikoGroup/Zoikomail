'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/constants/routes';
import { registerDemoAccount } from '@/constants/scenarios';
import { authService, type RegisterInput } from '@/services/auth-service';
import { trackFunnel } from '@/services/telemetry';
import { useAuthStore } from '@/store/auth-store';

/** Matches the sign-in settle so the two flows feel like one product. */
const SETTLE_MS = 300;

/**
 * Workspace creation.
 *
 * Kept separate from useSignInFlow because the two answer different
 * questions: sign-in asks the platform to resolve an existing account,
 * creation asserts a new one. Sharing a hook would mean sharing the attempt
 * counter and the scenario table, neither of which applies here.
 */
export function useSignUpFlow() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [taken, setTaken] = useState(false);

  const setEmail = useAuthStore((s) => s.setEmail);
  const setFirstName = useAuthStore((s) => s.setFirstName);
  const setJustCreated = useAuthStore((s) => s.setJustCreated);

  const clearTaken = useCallback(() => setTaken(false), []);

  const createWorkspace = useCallback(
    async (input: RegisterInput) => {
      if (pending) return;

      setPending(true);
      setTaken(false);
      trackFunnel('signup_submitted', { domain: input.email.split('@')[1] ?? '' });

      let created = false;
      let alreadyTaken = false;

      try {
        const result = await authService.register(input);
        created = result.created;
        alreadyTaken = result.taken;
      } catch {
        // Never leave the button spinning on an unresolvable attempt.
        created = false;
      }

      if (!created) {
        setPending(false);
        setTaken(alreadyTaken);
        trackFunnel('signup_rejected', { reason: alreadyTaken ? 'taken' : 'error' });
        return;
      }

      // Carried forward so the verification screen can name the address, and
      // so navigating to sign-in from here arrives prefilled. The store is not
      // persisted, so a hard reload clears it — deliberate on a credential
      // surface, where an address left in localStorage is a small liability
      // for a small convenience.
      setEmail(input.email);
      setFirstName(input.firstName);
      setJustCreated(true);

      // Until the endpoint exists, the created account lives here so the new
      // credentials work at sign-in — the password just chosen, not the shared
      // demo one.
      registerDemoAccount(input.email, input.password, input.firstName);
      trackFunnel('workspace_created');

      // Straight to sign-in. No email confirmation step: nothing sends mail
      // yet, so a screen telling someone to check their inbox would be asking
      // them to wait for something that will never arrive.
      setTimeout(() => {
        setPending(false);
        router.push(ROUTES.signIn);
      }, SETTLE_MS);
    },
    [pending, router, setEmail, setFirstName, setJustCreated],
  );

  return { createWorkspace, pending, taken, clearTaken };
}
