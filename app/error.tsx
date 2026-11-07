'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const message = error instanceof Error ? error.message : 'Unknown error';
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-6 py-16">
      <h1 className="text-xl font-semibold tracking-tight">This view stopped working</h1>
      <p className="text-[14px] text-muted-foreground">
        Your portfolio is still saved in this browser. Try again; if the problem repeats, reset the portfolio or load a sample.
      </p>
      <pre className="overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-xs text-muted-foreground">{message}</pre>
      <div className="flex gap-2">
        <button type="button" onClick={() => retry()} className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
          Try again
        </button>
        <Link href="/methodology" className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm">
          Data and methodology
        </Link>
      </div>
    </main>
  );
}
