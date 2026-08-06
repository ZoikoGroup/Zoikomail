import { RegisterForm } from './components/RegisterForm';

export const metadata = { title: 'Create your workspace · Zoiko Mail' };

/**
 * Self-serve workspace creation.
 *
 * Note the tension with PRD §11.1, which describes access as invitation-only
 * during the controlled pilot. This surface exists because the product decided
 * to open workspace creation; the pilot restriction now lives in the
 * verification step rather than at the door.
 */
export default function SignUpPage() {
  return <RegisterForm />;
}
