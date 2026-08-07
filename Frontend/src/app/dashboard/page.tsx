'use client';

import { HardHat } from 'lucide-react';
import { AuthCard, AuthHero } from '@/components/layout/AuthCard';
import { Button } from '@/components/ui/Button';
import { DetailList, Note, Panel } from '@/components/ui/Card';
import { useSignInFlow } from '@/hooks/useSignInFlow';
import { useAuthStore } from '@/store/auth-store';

export const dynamic = 'force-static';

/** Time only — the session started moments ago, so the date adds nothing. */
function clockTime(iso: string | undefined): string {
  if (!iso) return '—';
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? '—'
    : at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Where a signed-in account lands.
 *
 * The authentication surface ends here. Everything past this point — inbox,
 * commitments, connected accounts — is a separate build, and the schema work it
 * depends on is still open (Participant does not exist; Commitment is missing
 * commitmentType, sourceExcerpt, confidenceScore and aiActionId).
 *
 * Saying so plainly beats a fake dashboard. A placeholder that looks finished
 * is how a demo gets mistaken for a product.
 *
 * The session panel shows the real user_session row the API just wrote, not a
 * plausible-looking constant — a screen that invents its own data teaches the
 * reader to distrust the rest of it.
 */
export default function DashboardPage() {
  const email = useAuthStore((s) => s.email);
  const firstName = useAuthStore((s) => s.firstName);
  const details = useAuthStore((s) => s.signInDetails);
  const { signOut, busy } = useSignInFlow();

  return (
    <AuthCard>
      <AuthHero
        tone="warn"
        icon={<HardHat aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.7} />}
        title="Platform is developing…"
      >
        {firstName ? `You’re signed in, ${firstName}. ` : 'You’re signed in. '}
        Get back later — the workspace itself is still being built.
      </AuthHero>

      <Panel label="This sign-in">
        <DetailList
          rows={[
            { label: 'Account', value: email || '—' },
            { label: 'Signed in at', value: clockTime(details?.signedInAt) },
            { label: 'Session expires', value: clockTime(details?.expiresAt) },
            {
              label: 'Session',
              value: details?.sessionId ? details.sessionId.slice(0, 8) : '—',
            },
          ]}
        />
      </Panel>

      <Button variant="secondary" onClick={() => void signOut()} loading={busy('signout')}>
        Sign out
      </Button>

      <Note>
        {details
          ? 'Recorded in user_session. Authentication is complete; the inbox, commitment tracking and connected-account surfaces are a separate delivery.'
          : 'Running without the API, so no session row was written. Start the Backend service to record sign-ins.'}
      </Note>
    </AuthCard>
  );
}
