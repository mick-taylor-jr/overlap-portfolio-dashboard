import { AlertTriangle } from 'lucide-react';

/** Shown wherever the portfolio's fund rate feeds a calculation and some expense ratios are unknown. */
export function UnknownRatiosWarning({ count }: { count: number }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[13px] text-warning" data-testid="unknown-ratios-warning">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {count} {count === 1 ? 'holding has an unknown expense ratio and is' : 'holdings have unknown expense ratios and are'} not included; real fees are higher.
      </span>
    </p>
  );
}
