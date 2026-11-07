import Link from 'next/link';
import { ThemeToggle } from './theme-toggle';

export function SiteHeader({ current }: { current: 'app' | 'methodology' }) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Overlap, portfolio dashboard home">
          <Mark />
          <span className="text-[17px] font-semibold tracking-tight">Overlap</span>
        </Link>
        <span className="hidden text-[13px] text-muted-foreground md:inline">Look-through concentration and fees</span>
        <nav aria-label="Primary" className="ml-auto flex min-w-0 items-center gap-0.5 text-[13px] sm:gap-1">
          <Link
            href="/"
            aria-current={current === 'app' ? 'page' : undefined}
            className="rounded px-1.5 py-1.5 text-muted-foreground sm:px-2 hover:text-foreground aria-[current=page]:text-foreground"
          >
            Dashboard
          </Link>
          <Link
            href="/methodology"
            aria-current={current === 'methodology' ? 'page' : undefined}
            className="rounded px-1.5 py-1.5 text-muted-foreground sm:px-2 hover:text-foreground aria-[current=page]:text-foreground"
          >
            <span className="hidden sm:inline">Data and methodology</span>
            <span className="sm:hidden">Methodology</span>
          </Link>
          <span className="ml-1 shrink-0 sm:ml-2">
            <ThemeToggle />
          </span>
        </nav>
      </div>
    </header>
  );
}

/** Two overlapping squares: the product's whole idea in one glyph. */
function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect x="1.5" y="1.5" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-muted-foreground" />
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-primary" />
      <rect x="8.5" y="8.5" width="5" height="5" fill="currentColor" className="text-primary" />
    </svg>
  );
}
