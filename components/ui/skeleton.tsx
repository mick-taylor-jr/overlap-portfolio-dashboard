import { cn } from './cn';

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('skeleton block h-4', className)} />;
}
