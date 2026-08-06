import { hash, verify, Algorithm } from '@node-rs/argon2';

/**
 * Password hashing.
 *
 * Argon2id — the OWASP first choice, and memory-hard, which is what makes a
 * GPU-based offline attack expensive rather than merely slow. Parameters follow
 * the OWASP minimum (19 MiB, 2 iterations, 1 degree of parallelism) and are
 * embedded in the digest, so raising them later leaves existing hashes valid.
 *
 * The plaintext password never leaves this module and is never logged, stored
 * or returned.
 */
const OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, OPTIONS);
}

/**
 * Verify a password against a stored digest.
 *
 * A malformed or truncated digest resolves to false rather than throwing: a
 * corrupt row should fail the sign-in, not return a 500 that tells an attacker
 * they found something interesting.
 */
export async function verifyPassword(digest: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(digest, plaintext);
  } catch {
    return false;
  }
}

/**
 * Composition rules for workspace creation, mirroring the frontend's checklist
 * so the server does not trust the client's validation.
 *
 * Security §1.1 cites NIST SP 800-63B, which prefers length over composition;
 * these five rules are a product decision that overrides that. The length floor
 * is checked separately so it can be raised on its own.
 */
export const PASSWORD_RULES = [
  { id: 'length', test: (v: string) => v.length >= 8 },
  { id: 'upper', test: (v: string) => /[A-Z]/.test(v) },
  { id: 'lower', test: (v: string) => /[a-z]/.test(v) },
  { id: 'number', test: (v: string) => /[0-9]/.test(v) },
  { id: 'symbol', test: (v: string) => /[^A-Za-z0-9\s]/.test(v) },
] as const;

export function passwordMeetsPolicy(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}
