import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-5 gap-y-1 px-4 py-4 text-xs text-muted-foreground sm:px-6">
        <span>Informational only, not investment advice.</span>
        <span>
          Market data from Yahoo Finance (unofficial) and Alpha Vantage; bundled sample data when they are unavailable.{' '}
          <Link href="/methodology#attributions" className="underline underline-offset-2 hover:text-foreground">
            Data credits
          </Link>
        </span>
        <a href="https://www.coingecko.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
          Powered by CoinGecko
        </a>
      </div>
    </footer>
  );
}
