/**
 * Password policy for workspace creation.
 *
 * Five composition rules, evaluated live as the field is typed.
 *
 * Worth recording: Security §1.1 cites NIST SP 800-63B, which recommends
 * length over composition rules and argues that forcing character classes
 * pushes people toward predictable substitutions (Password1!). These five
 * rules are a product decision that overrides that guidance. The length
 * floor is kept as its own rule so it can be raised later without touching
 * the others, which is the change NIST would actually endorse.
 */

export interface PasswordRule {
  id: string;
  /** Shown in the checklist. Phrased as the requirement, not the failure. */
  label: string;
  test: (value: string) => boolean;
}

export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    test: (v) => v.length >= MIN_PASSWORD_LENGTH,
  },
  { id: 'upper', label: 'An uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'A lowercase letter', test: (v) => /[a-z]/.test(v) },
  { id: 'number', label: 'A number', test: (v) => /[0-9]/.test(v) },
  {
    id: 'symbol',
    label: 'A special character',
    // Anything that is not a letter, digit or whitespace. Deliberately broad:
    // restricting the symbol set is a common way to break password managers.
    test: (v) => /[^A-Za-z0-9\s]/.test(v),
  },
];

export interface RuleResult extends PasswordRule {
  met: boolean;
}

export function evaluatePassword(value: string): RuleResult[] {
  return PASSWORD_RULES.map((rule) => ({ ...rule, met: rule.test(value) }));
}

export function passwordMeetsPolicy(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}

export type StrengthTone = 'crit' | 'warn' | 'ok';

export interface Strength {
  met: number;
  total: number;
  label: string;
  tone: StrengthTone;
}

/**
 * Rules satisfied, not entropy. Calling it "strength" would overstate what
 * five boolean checks can tell you, so the label stays modest and the count
 * is shown alongside it.
 */
export function passwordStrength(value: string): Strength {
  const met = PASSWORD_RULES.filter((rule) => rule.test(value)).length;
  const total = PASSWORD_RULES.length;

  if (met === total) return { met, total, label: 'Meets all requirements', tone: 'ok' };
  if (met >= 3) return { met, total, label: 'Almost there', tone: 'warn' };
  return { met, total, label: 'Keep going', tone: 'crit' };
}

/** Trimmed-and-nonempty, used by the name fields. */
export function isFilled(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Deliberately permissive. Strict client-side email regexes reject valid
 * addresses; the authoritative check is the verification email itself.
 */
export function looksLikeEmail(value: string): boolean {
  const v = value.trim();
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v);
}
