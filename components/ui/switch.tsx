'use client';

import { cn } from './cn';

export function Switch({
  checked,
  onCheckedChange,
  label,
  id,
  className,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  id?: string;
  className?: string;
}) {
  return (
    <label htmlFor={id} className={cn('inline-flex cursor-pointer items-center gap-2 text-[13px]', className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors',
          checked ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          aria-hidden
          className={cn('inline-block size-4 rounded-full bg-card shadow-sm transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')}
        />
      </button>
      <span>{label}</span>
    </label>
  );
}
