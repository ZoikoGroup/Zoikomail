'use client';

import { HardHat } from 'lucide-react';
import { AuthCard, AuthHero } from '@/components/layout/AuthCard';
import { Button } from '@/components/ui/Button';
import { DetailList, Note, Panel } from '@/components/ui/Card';
import { useSignInFlow } from '@/hooks/useSignInFlow';
import { useAuthStore } from '@/store/auth-store';

export const dynamic = 'force-static';

/**
 * Where a newly created account lands after signing in.
 *
 * The authentication surface ends here. Everything past this point — inbox,
 * commitments, connected accounts — is a separate build, and the schema work it
 * depends on is still open (Participant does not exist; Commitment is missing
 * commitmentType, sourceExcerpt, confidenceScore and aiActionId).
 *
 * Saying so plainly beats a fake dashboard. A placeholder that looks finished
 * is how a demo gets mistaken for a product.
 */
export default function DashboardPage() {
  const email = useAuthStore((s) => s.email);
  const firstName = useAuthStore((s) => s.firstName);
  const { signOut, busy } = useSignInFlow();

  return (
    <AuthCard>
      <AuthHero
        tone="warn"
        icon={<HardHat aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.7} />}
        title="Dashboard is in development"
      >
        {firstName ? `You’re signed in, ${firstName}. ` : 'You’re signed in. '}
        The workspace itself is still being built — please come back later.
      </AuthHero>

      <Panel label="Session">
        <DetailList
          rows={[
            { label: 'Signed in as', value: email || '—' },
            { label: 'Role', value: 'Owner' },
            { label: 'Workspace', value: 'Active' },
          ]}
        />
      </Panel>

      <Button variant="secondary" onClick={() => void signOut()} loading={busy('signout')}>
        Sign out
      </Button>

      <Note>
        Authentication is complete and verified. The inbox, commitment tracking and connected-account
        surfaces are a separate delivery.
      </Note>
    </AuthCard>
  );
}
