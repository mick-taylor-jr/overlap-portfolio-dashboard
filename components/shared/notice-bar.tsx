'use client';

import { X } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { usePortfolio } from '@/lib/portfolio/context';

const TONE = {
  info: 'border-primary/25 bg-accent text-accent-foreground',
  success: 'border-success/30 bg-success-bg text-success',
  warning: 'border-warning/40 bg-warning-bg text-warning',
  danger: 'border-danger/30 bg-danger-bg text-danger',
};

/** One transient message at a time (shared-link loaded, import results, copy confirmations). */
export function NoticeBar() {
  const { notice, dismissNotice } = usePortfolio();
  return (
    <div aria-live="polite" role="status">
      {notice ? (
        <div key={notice.id} className={cn('flex items-start gap-3 rounded-md border px-3 py-2 text-[13px]', TONE[notice.tone])}>
          <p className="flex-1">{notice.text}</p>
          <button type="button" onClick={dismissNotice} aria-label="Dismiss message" className="rounded p-0.5 opacity-70 hover:opacity-100">
            <X className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
