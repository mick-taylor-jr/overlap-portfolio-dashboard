'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
}

/** WAI-ARIA tabs with roving focus (arrow keys, Home, End). Panels are rendered by the caller with TabPanel. */
export function Tabs<T extends string>({
  items,
  value,
  onValueChange,
  label,
  idBase,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onValueChange: (v: T) => void;
  label: string;
  idBase: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.value === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onValueChange(items[next].value);
      refs.current[next]?.focus();
    }
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className={cn('relative flex gap-1 overflow-x-auto', className)}>
      {items.map((t, i) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${idBase}-tab-${t.value}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${t.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(t.value)}
            className={cn(
              'relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition-colors',
              selected ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idBase, value, active, children }: { idBase: string; value: string; active: boolean; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel-${value}`} aria-labelledby={`${idBase}-tab-${value}`} hidden={!active} tabIndex={0} className="outline-none">
      {active ? children : null}
    </div>
  );
}

/** Small segmented control (radio group semantics) for view toggles. */
export function Segmented<T extends string>({
  options,
  value,
  onValueChange,
  label,
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onValueChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-md border border-border bg-muted p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onValueChange(o.value)}
          className={cn(
            'h-7 rounded px-2.5 text-xs font-medium transition-colors',
            o.value === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
