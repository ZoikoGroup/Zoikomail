'use client';

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  invalid?: boolean;
  tail?: ReactNode;
  locked?: boolean;
  /**
   * Extra element to associate with the input, merged with the hint rather
   * than replacing it — the password field needs both its error message and
   * its requirement checklist announced.
   */
  describedBy?: string;
}

/**
 * Password managers only work when the autocomplete tokens are right, so
 * callers pass them explicitly rather than relying on a default.
 *
 * Error state carries a ring, aria-invalid and a described-by hint — never
 * colour alone.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, invalid = false, tail, locked = false, describedBy, className, ...rest },
  ref,
) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const described = [hintId, describedBy].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.11em] text-ink-3"
      >
        {label}
        {locked && <span aria-hidden>· fixed</span>}
      </label>

      <div
        className={cn(
          'flex items-center gap-2 rounded-field border bg-s2 px-[13px] py-[11px] text-field text-ink',
          'transition-shadow duration-150',
          invalid
            ? 'border-crit shadow-focus-crit'
            : 'border-bstrong focus-within:border-accent focus-within:bg-surface focus-within:shadow-focus',
          locked && 'opacity-80',
          className,
        )}
      >
        <input
          ref={ref}
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={described}
          readOnly={locked || undefined}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3"
          {...rest}
        />
        {tail && <span className="shrink-0 text-ink-3">{tail}</span>}
      </div>

      {hint && (
        <p
          id={hintId}
          className={cn(
            'font-mono text-[10px] leading-[1.6]',
            // When the field is invalid the hint is carrying the reason, so it
            // takes the error colour rather than sitting quietly in grey.
            invalid ? 'text-crit' : 'text-ink-3',
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
});
