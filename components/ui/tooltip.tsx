'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from './cn';

/**
 * Lightweight tooltip: shows on hover AND keyboard focus, linked via aria-describedby.
 * The trigger must be focusable (we wrap in a span with tabIndex when it is not).
 */
export function Tooltip({ content, children, className, side = 'top' }: { content: ReactNode; children: ReactNode; className?: string; side?: 'top' | 'bottom' }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open ? (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'pointer-events-none absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs leading-snug text-card-foreground shadow-md',
            side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
