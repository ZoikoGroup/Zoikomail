'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { AuthCard, AuthHeading } from '@/components/layout/AuthCard';
import { Banner } from '@/components/common/Banner';
import { TextField } from '@/components/forms/TextField';
import { Button } from '@/components/ui/Button';
import { Divider, Note } from '@/components/ui/Card';
import { ROUTES } from '@/constants/routes';
import { useSignInFlow } from '@/hooks/useSignInFlow';
import { useAuthStore } from '@/store/auth-store';
import { trackFunnel } from '@/services/telemetry';

/**
 * The only external surface: email, password, Proceed.
 *
 * No state list, no navigator, no hint of the fourteen other screens. What
 * happens after Proceed is resolved by the platform from account status,
 * membership status, tenant status and risk signals — the user never chooses.
 *
 * `retry` shows the generic failure banner when the caller has been sent back
 * here after a rejected attempt.
 */
export function CredentialForm({ retry = false }: { retry?: boolean }) {
  const email = useAuthStore((s) => s.email);
  const password = useAuthStore((s) => s.password);
  const setEmail = useAuthStore((s) => s.setEmail);
  const setPassword = useAuthStore((s) => s.setPassword);
  const credentialsEntered = useAuthStore((s) => s.credentialsEntered);

  const lastOutcome = useAuthStore((s) => s.lastOutcome);
  const attempts = useAuthStore((s) => s.attempts);
  const attemptsRemaining = useAuthStore((s) => s.attemptsRemaining);
  const justCreated = useAuthStore((s) => s.justCreated);

  const { proceed, busy } = useSignInFlow();
  const [reveal, setReveal] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    trackFunnel('signin_viewed');
  }, []);

  // Driven by state, not by the route. A second rejection lands on the page
  // already showing, so a route-only signal would leave the screen unchanged.
  const rejected = retry || lastOutcome === 'failed';
  const remaining = attemptsRemaining();

  // Move focus to the error so a screen-reader user hears the cause without
  // having to hunt for it. Keyed on the attempt count so a repeat rejection
  // re-announces rather than sitting silent.
  useEffect(() => {
    if (rejected) bannerRef.current?.focus();
  }, [rejected, attempts]);

  const ready = credentialsEntered();

  return (
    <AuthCard>
      <AuthHeading title="Sign in">Use the work email your workspace invited.</AuthHeading>

      {/*
        Shown once, only when arriving straight from workspace creation. Without
        it the redirect reads as the form having reset itself — the person
        pressed "Create account" and landed on a sign-in page with no
        acknowledgement that anything happened.
      */}
      {justCreated && !rejected && (
        <Banner tone="ok" live>
          <b>Account created.</b> Sign in with the email and password you just chose.
        </Banner>
      )}

      {rejected && (
        <div ref={bannerRef} tabIndex={-1} className="outline-none">
          <Banner tone="crit" live>
            <b>We couldn&rsquo;t sign you in.</b> Check your email and password and try again.
            {remaining > 0 && remaining < 5 && (
              <>
                {' '}
                {remaining} {remaining === 1 ? 'attempt' : 'attempts'} remaining before this account
                locks.
              </>
            )}
          </Banner>
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void proceed();
        }}
        className="flex flex-col gap-4"
        noValidate
      >
        <TextField
          label="Work email"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          spellCheck={false}
          autoFocus
          invalid={rejected}
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <TextField
          label="Password"
          type={reveal ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          invalid={rejected}
          placeholder="••••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          tail={
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? 'Hide password' : 'Show password'}
              title={reveal ? 'Hide password' : 'Show password'}
              className="grid h-5 w-5 place-items-center rounded text-ink-3 transition-colors hover:text-ink-2"
            >
              {reveal ? (
                <EyeOff aria-hidden className="h-3.5 w-3.5" strokeWidth={1.9} />
              ) : (
                <Eye aria-hidden className="h-3.5 w-3.5" strokeWidth={1.9} />
              )}
            </button>
          }
        />

        {/*
          Recovery sits with the password field, which is where people look for
          it — and where every credible product puts it. It used to be the only
          link under the card; that position now belongs to workspace creation.
        */}
        <div className="-mt-1 flex justify-end">
          <Link
            href={ROUTES.recovery}
            className="text-[11.5px] font-semibold text-ink-3 no-underline transition-colors hover:text-accent hover:underline"
          >
            Forgotten your password?
          </Link>
        </div>

        <Button type="submit" variant="primary" disabled={!ready} loading={busy('proceed')}>
          Proceed
          <ArrowRight aria-hidden className="h-3.5 w-3.5" strokeWidth={1.9} />
        </Button>
      </form>

      <Divider />

      <Link
        href={ROUTES.signUp}
        className="group flex items-center justify-between gap-3 rounded-field border border-border bg-s2 px-[13px] py-[11px] no-underline transition-[background-color,border-color] duration-150 ease-premium hover:border-bstrong hover:bg-s3"
      >
        <span className="flex flex-col">
          <span className="text-xs2 font-semibold text-ink">New to Zoiko Mail?</span>
          <span className="mt-0.5 text-[11.5px] text-ink-3">Create your workspace</span>
        </span>
        <ArrowRight
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 text-accent transition-transform duration-150 ease-premium group-hover:translate-x-0.5"
          strokeWidth={1.9}
        />
      </Link>

      <Note>
        Access is limited to the controlled pilot. New workspaces are verified by email, and sending limits
        are raised only after review.
      </Note>
    </AuthCard>
  );
}
