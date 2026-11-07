import { Info } from 'lucide-react';
import { fmtPct } from '@/lib/format';
import { cn } from '@/components/ui/cn';

/**
 * Data-coverage indicator for a chart. Below 100% the figures are lower bounds; we say so in words
 * (not just color) so the reader can't miss it.
 */
export function CoverageNote({ coverage, what = 'holdings', className }: { coverage: number | null; what?: string; className?: string }) {
  if (coverage === null) return null;
  const full = coverage >= 0.9995;
  return (
    <p className={cn('flex items-start gap-1.5 text-xs', full ? 'text-muted-foreground' : 'text-warning', className)}>
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        {full
          ? `Holdings coverage 100%: every holding is disclosed.`
          : `Holdings coverage ${fmtPct(coverage, 0)}: ${what} shown ${what === 'overlap' ? 'is a lower bound' : 'are lower bounds'}; the rest sits in "Unresolved / not disclosed".`}
      </span>
    </p>
  );
}
