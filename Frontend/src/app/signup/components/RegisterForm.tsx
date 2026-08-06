'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { AuthCard, AuthHeading } from '@/components/layout/AuthCard';
import { Banner } from '@/components/common/Banner';
import { PasswordRequirements } from '@/components/forms/PasswordRequirements';
import { TextField } from '@/components/forms/TextField';
import { Button } from '@/components/ui/Button';
import { Divider, Note } from '@/components/ui/Card';
import { ROUTES } from '@/constants/routes';
import { isFilled, looksLikeEmail, passwordMeetsPolicy } from '@/constants/password-policy';
import { useSignUpFlow } from '@/hooks/useSignUpFlow';
import { trackFunnel } from '@/services/telemetry';

/**
 * Workspace creation.
 *
 * Validation runs on submit, not on every keystroke. Marking a field invalid
 * while someone is still typing their surname is the single most common way
 * these forms feel hostile. The password checklist is the deliberate
 * exception: it updates live because it is guidance rather than judgement,
 * and it never turns red before the field has content.
 */
export function RegisterForm() {
  const { createWorkspace, pending, taken, clearTaken } = useSignUpFlow();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const requirementsId = useId();
  const bannerRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    trackFunnel('signup_viewed');
  }, []);

  useEffect(() => {
    if (taken) bannerRef.current?.focus();
  }, [taken]);

  const errors = {
    firstName: isFilled(firstName) ? null : 'Enter your first name.',
    lastName: isFilled(lastName) ? null : 'Enter your last name.',
    email: looksLikeEmail(email) ? null : 'Enter a valid email address.',
    password: passwordMeetsPolicy(password) ? null : 'Your password does not meet the requirements yet.',
  };

  const valid = Object.values(errors).every((error) => error === null);
  const show = (field: keyof typeof errors) => submitted && errors[field] !== null;

  // Every field has content — the same gate the sign-in form uses, so the two
  // buttons behave identically. Correctness is judged on submit.
  const ready = [firstName, lastName, email, password].every((v) => v.length > 0);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    clearTaken();

    if (!valid) {
      // Send focus to the first thing that needs attention rather than making
      // the user hunt for the red field.
      const target = errors.firstName
        ? firstRef
        : errors.lastName
          ? lastRef
          : errors.email
            ? emailRef
            : passwordRef;
      target.current?.focus();
      return;
    }

    void createWorkspace({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      password,
    });
  }

  return (
    <AuthCard>
      <AuthHeading title="Create your workspace">
        You&rsquo;ll be its owner, and can invite your team once it&rsquo;s set up.
      </AuthHeading>

      {taken && (
        <div ref={bannerRef} tabIndex={-1} className="outline-none">
          <Banner tone="warn" live>
            <b>That address already has an account.</b>{' '}
            <Link href={ROUTES.signIn} className="font-semibold text-warn underline">
              Sign in instead
            </Link>
            , or use a different address.
          </Banner>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            ref={firstRef}
            label="First name"
            name="firstName"
            autoComplete="given-name"
            autoFocus
            placeholder="Ada"
            invalid={show('firstName')}
            hint={show('firstName') ? errors.firstName ?? undefined : undefined}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />

          <TextField
            ref={lastRef}
            label="Last name"
            name="lastName"
            autoComplete="family-name"
            placeholder="Lovelace"
            invalid={show('lastName')}
            hint={show('lastName') ? errors.lastName ?? undefined : undefined}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </div>

        <TextField
          ref={emailRef}
          label="Work email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          placeholder="you@company.com"
          invalid={show('email')}
          hint={show('email') ? errors.email ?? undefined : undefined}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (taken) clearTaken();
          }}
        />

        <div className="flex flex-col gap-2.5">
          <TextField
            ref={passwordRef}
            label="Password"
            type={reveal ? 'text' : 'password'}
            name="password"
            autoComplete="new-password"
            placeholder="••••••••••"
            invalid={show('password')}
            describedBy={requirementsId}
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

          <PasswordRequirements id={requirementsId} value={password} />
        </div>

        <Button type="submit" variant="primary" disabled={!ready} loading={pending}>
          Create account
          <ArrowRight aria-hidden className="h-3.5 w-3.5" strokeWidth={1.9} />
        </Button>
      </form>

      <Divider />

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs2 text-ink-2">Already have an account?</span>
        <Link
          href={ROUTES.signIn}
          className="text-xs2 font-semibold text-accent no-underline hover:underline"
        >
          Sign in
        </Link>
      </div>

      <Note>
        Creating a workspace means agreeing to our{' '}
        <Link href={ROUTES.legalTerms} className="text-ink-2 underline">
          Terms
        </Link>{' '}
        and{' '}
        <Link href={ROUTES.legalPrivacy} className="text-ink-2 underline">
          Privacy Policy
        </Link>
        . You&rsquo;ll be signed in with these details on the next screen.
      </Note>
    </AuthCard>
  );
}
