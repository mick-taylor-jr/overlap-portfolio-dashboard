import { cn } from '@/components/ui/cn';

/** Required on every forward-looking number. */
export function Hypothetical({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground', className)}>
      Hypothetical illustration, not a forecast
    </span>
  );
}
