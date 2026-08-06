'use client';

import { Check, Circle } from 'lucide-react';
import {
  evaluatePassword,
  passwordStrength,
  PASSWORD_RULES,
  type StrengthTone,
} from '@/constants/password-policy';
import { cn } from '@/utils/cn';

const BAR: Record<StrengthTone, string> = {
  crit: 'bg-crit',
  warn: 'bg-warn',
  ok: 'bg-ok',
};

const TEXT: Record<StrengthTone, string> = {
  crit: 'text-crit',
  warn: 'text-warn',
  ok: 'text-ok',
};

/**
 * Live requirement checklist for the password field.
 *
 * Three deliberate choices:
 *
 * 1. Nothing is marked as failing until the field has content. A wall of red
 *    on first paint scolds someone who has not yet typed a character.
 * 2. Met and unmet differ by icon shape as well as colour — a tick against an
 *    open circle — so the state survives colour-vision deficiency and
 *    forced-colors mode.
 * 3. No aria-live. A polite region firing on every keystroke is unusable;
 *    instead the list is wired to the input through aria-describedby, so a
 *    screen reader reads the current state on focus and on demand, and each
 *    row carries its own state in text.
 */
export function PasswordRequirements({
  value,
  id,
  className,
}: {
  value: string;
  /** Referenced by the password input's aria-describedby. */
  id: string;
  className?: string;
}) {
  const rules = evaluatePassword(value);
  const strength = passwordStrength(value);
  const started = value.length > 0;

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex items-center gap-2.5">
        <div aria-hidden className="flex flex-1 items-center gap-1">
          {PASSWORD_RULES.map((rule, index) => (
            <span
              key={rule.id}
              className={cn(
                'h-[3px] flex-1 rounded-full transition-colors duration-300 ease-premium',
                started && index < strength.met ? BAR[strength.tone] : 'bg-s3',
              )}
            />
          ))}
        </div>

        <span
          className={cn(
            'shrink-0 font-mono text-[9.5px] uppercase tracking-[0.11em] tnum transition-colors duration-300',
            started ? TEXT[strength.tone] : 'text-ink-3',
          )}
        >
          {started ? `${strength.met}/${strength.total}` : `${strength.total} rules`}
        </span>
      </div>

      <ul id={id} className="m-0 flex list-none flex-col gap-[5px] p-0">
        {rules.map((rule) => {
          const failing = started && !rule.met;

          return (
            <li key={rule.id} className="flex items-center gap-[7px]">
              {rule.met ? (
                <Check
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 text-ok transition-colors duration-200"
                  strokeWidth={2.4}
                />
              ) : (
                <Circle
                  aria-hidden
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 transition-colors duration-200',
                    failing ? 'text-crit' : 'text-ink-3',
                  )}
                  strokeWidth={1.6}
                />
              )}

              <span
                className={cn(
                  'text-[11.5px] leading-[1.5] transition-colors duration-200',
                  rule.met ? 'text-ink-2' : failing ? 'text-crit' : 'text-ink-3',
                )}
              >
                {rule.label}
              </span>

              <span className="sr-only">{rule.met ? ' — met' : ' — not yet met'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
