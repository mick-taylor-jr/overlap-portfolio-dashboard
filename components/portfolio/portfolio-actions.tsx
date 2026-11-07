'use client';

import { useRef, useState } from 'react';
import { Download, FileJson, Link2, RotateCcw, Upload } from 'lucide-react';
import type { Analysis } from '@/lib/hooks/use-portfolio-analysis';
import { usePortfolio } from '@/lib/portfolio/context';
import { encodePortfolioShare } from '@/lib/portfolio/share';
import { downloadText, portfolioToCsv } from '@/lib/portfolio/csv';
import { portfolioSchema } from '@/lib/portfolio/schema';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { CsvImportDialog } from './csv-import-dialog';

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'portfolio';
}

export function PortfolioActions({ analysis }: { analysis: Analysis }) {
  const { state, dispatch, notify } = usePortfolio();
  const [csvOpen, setCsvOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const empty = state.portfolio.positions.length === 0;

  const share = async () => {
    const priced = analysis.rows.filter((r) => r.value !== null);
    const hash = encodePortfolioShare(state.portfolio, analysis.rows);
    if (!hash) return notify('warning', 'Nothing to share yet: no position has a value.');
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    setShareUrl(url);
    const skipped = analysis.rows.length - priced.length;
    try {
      await navigator.clipboard.writeText(url);
      notify(
        'success',
        `Share link copied. It carries tickers, weights, account labels, rate-only fee settings and synthetic flags, never share counts or dollar amounts${skipped ? `; ${skipped} unpriced ${skipped === 1 ? 'position was' : 'positions were'} left out` : ''}.`,
      );
    } catch {
      notify('info', 'Copy the share link below. It carries tickers, weights, account labels, rate-only fee settings and synthetic flags, never share counts or dollar amounts.');
    }
  };

  const exportJson = () =>
    downloadText(`${slug(state.portfolio.name)}.json`, JSON.stringify({ format: 'overlap-portfolio', version: 1, portfolio: state.portfolio }, null, 2), 'application/json');
  const exportCsv = () => downloadText(`${slug(state.portfolio.name)}.csv`, portfolioToCsv(state.portfolio), 'text/csv');

  const importJson = async (file: File) => {
    try {
      const raw: unknown = JSON.parse(await file.text());
      const candidate = raw && typeof raw === 'object' && 'portfolio' in raw ? (raw as { portfolio: unknown }).portfolio : raw;
      const parsed = portfolioSchema.safeParse(candidate);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return notify('danger', `That file is not an Overlap portfolio: ${issue ? `${issue.path.join('.') || 'file'}: ${issue.message}` : 'unexpected format'}.`);
      }
      dispatch({ type: 'replace', portfolio: parsed.data });
      notify('success', `Imported "${parsed.data.name}" with ${parsed.data.positions.length} positions.`);
    } catch {
      notify('danger', 'That file is not valid JSON.');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button variant="outline" size="sm" onClick={share} disabled={empty}>
        <Link2 aria-hidden /> Share
      </Button>
      <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}>
        <Upload aria-hidden /> Import CSV
      </Button>
      <Button variant="ghost" size="sm" onClick={() => jsonInput.current?.click()}>
        <FileJson aria-hidden /> Import JSON
      </Button>
      <input
        ref={jsonInput}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importJson(f);
          e.target.value = '';
        }}
      />
      <Button variant="ghost" size="sm" onClick={exportJson} disabled={empty}>
        <Download aria-hidden /> JSON
      </Button>
      <Button variant="ghost" size="sm" onClick={exportCsv} disabled={empty}>
        <Download aria-hidden /> CSV
      </Button>
      <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)} disabled={empty}>
        <RotateCcw aria-hidden /> Reset
      </Button>

      {shareUrl ? (
        <div className="basis-full">
          <label htmlFor="share-url" className="sr-only">
            Share link
          </label>
          <input
            id="share-url"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 h-8 w-full rounded border border-border bg-muted px-2 font-mono text-[11px] text-muted-foreground"
            data-testid="share-url"
          />
        </div>
      ) : null}

      <CsvImportDialog open={csvOpen} onClose={() => setCsvOpen(false)} />
      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset portfolio?"
        description="This removes every position and your fee settings from this browser. Export first if you want a copy."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>
            Keep portfolio
          </Button>
          <Button
            variant="default"
            className="bg-danger hover:bg-danger/90"
            onClick={() => {
              dispatch({ type: 'reset' });
              setConfirmReset(false);
              setShareUrl(null);
              notify('info', 'Portfolio reset.');
            }}
          >
            Reset portfolio
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
