import { cn } from '@/components/ui/cn';

/** Ticker symbols are identifiers, so they get the mono face; nothing else does. */
export function Sym({ children, className }: { children: string; className?: string }) {
  return <span className={cn('font-mono text-[12.5px] font-medium tracking-tight', className)}>{children}</span>;
}
