'use client';

import { useEffect, useId, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { inputClass } from '@/components/ui/input';

type Kind = 'percent' | 'usd' | 'int' | 'number';

function toText(v: number | null, kind: Kind): string {
  if (v === null || !Number.isFinite(v)) return '';
  if (kind === 'percent') return String(Number((v * 100).toFixed(4)));
  if (kind === 'usd') return String(Number(v.toFixed(2)));
  return String(v);
}

function parse(text: string, kind: Kind): number | null | 'invalid' {
  const t = text.trim().replace(/[,$%\s]/g, '');
  if (t === '') return null;
  if (!/^-?\d*\.?\d+$/.test(t)) return 'invalid';
  const n = Number(t);
  if (kind === 'int' && !Number.isInteger(n)) return 'invalid';
  return kind === 'percent' ? n / 100 : n;
}

/**
 * Numeric input that keeps the user's text while typing and commits parsed values live.
 * Percent fields show "1.25" (meaning 1.25%) but emit decimals (0.0125). Empty = null, never 0.
 */
export function NumberField({
  value,
  onChange,
  kind = 'number',
  label,
  hideLabel,
  min,
  max,
  allowEmpty = false,
  placeholder,
  className,
  inputClassName,
  id: idProp,
  describedBy,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  kind?: Kind;
  label: string;
  hideLabel?: boolean;
  /** Bounds in the emitted unit (decimals for percent). */
  min?: number;
  max?: number;
  allowEmpty?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  id?: string;
  describedBy?: string;
}) {
  const auto = useId();
  const id = idProp ?? auto;
  const [text, setText] = useState(() => toText(value, kind));
  const [error, setError] = useState<string | null>(null);

  // Follow external changes (e.g. reset, prefill) unless the text already represents that value.
  useEffect(() => {
    const parsed = parse(text, kind);
    if (parsed === 'invalid' || parsed !== value) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- controlled-text sync from props
      setText(toText(value, kind));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, kind]);

  const commit = (t: string) => {
    setText(t);
    const p = parse(t, kind);
    if (p === 'invalid') return setError('Enter a number');
    if (p === null) {
      if (!allowEmpty) return setError('Required');
      setError(null);
      return onChange(null);
    }
    if (min !== undefined && p < min) return setError(`Minimum ${toText(min, kind)}${kind === 'percent' ? '%' : ''}`);
    if (max !== undefined && p > max) return setError(`Maximum ${toText(max, kind)}${kind === 'percent' ? '%' : ''}`);
    setError(null);
    onChange(p);
  };

  const errId = `${id}-err`;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className={cn('text-xs font-medium text-muted-foreground', hideLabel && 'sr-only')}>
        {label}
      </label>
      <div className="relative">
        {kind === 'usd' ? <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span> : null}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          onChange={(e) => commit(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={[error ? errId : null, describedBy].filter(Boolean).join(' ') || undefined}
          className={cn(inputClass, 'num text-right tabular-nums', kind === 'usd' && 'pl-6', kind === 'percent' && 'pr-6', inputClassName)}
        />
        {kind === 'percent' ? <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span> : null}
      </div>
      {error ? (
        <span id={errId} role="alert" className="text-[11px] text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
