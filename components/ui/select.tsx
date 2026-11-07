import type { SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

/** Native select styled to match. Native keeps keyboard and screen-reader behavior for free. */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cn('relative inline-flex', className)}>
      <select
        className="h-9 w-full appearance-none rounded-md border border-input bg-card py-0 pl-2.5 pr-8 text-sm focus-visible:border-ring"
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}
