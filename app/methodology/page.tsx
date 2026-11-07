import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CRYPTO_ETF_UNDERLYING, ISSUER_GROUPS, SECTOR_LABEL_MAPPINGS } from '@/lib/normalize';
import { SiteHeader } from '@/components/shell/site-header';
import { QueryProvider } from '@/components/shell/providers';
import { ProviderStatus } from '@/components/methodology/provider-status';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

export const metadata: Metadata = {
  title: 'Data and methodology: Overlap',
  description: 'Formulas, assumptions, data sources and known limitations behind the Overlap dashboard.',
};

const SECTIONS = [
  ['formulas', 'Formulas'],
  ['assumptions', 'Assumptions'],
  ['providers', 'Data providers'],
  ['limitations', 'Known limitations'],
  ['mappings', 'Mapping tables'],
  ['attributions', 'Attributions'],
] as const;

export default function MethodologyPage() {
  return (
    <QueryProvider>
      <SiteHeader current="methodology" />
      <main id="main" className="mx-auto grid w-full max-w-[1280px] flex-1 grid-cols-1 gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-6 flex flex-col gap-1.5 text-[13px]">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-muted-foreground hover:text-foreground">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <article className="flex max-w-[76ch] flex-col gap-10 text-[14.5px] leading-relaxed">
          <header className="flex flex-col gap-2">
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Data and methodology</h1>
            <p className="text-muted-foreground">
              How every number on the dashboard is computed, where the data comes from, and where it falls short. Weights and rates are stored as decimal fractions and
              rounded only for display. Unknown values stay unknown; they are never treated as zero.
            </p>
          </header>

          <Section id="formulas" title="Formulas">
            <Formula name="Look-through exposure">
              <Code>e_i = Σ_f w_f × h_(f,i)</Code>
              <p>
                <Var>w_f</Var> is a position&apos;s share of total portfolio value and <Var>h_(f,i)</Var> is security <Var>i</Var>&apos;s weight inside it. A stock you hold
                directly is a fund with one holding at weight 1. Whatever a fund does not disclose goes to an explicit &quot;Unresolved / not disclosed&quot; row, so
                exposures always add up to 100%.
              </p>
            </Formula>
            <Formula name="Pairwise fund overlap">
              <Code>overlap(A, B) = Σ_i min(h_(A,i), h_(B,i))</Code>
              <p>
                The share of holdings two funds have in common, from 0 to 100%. When either fund&apos;s disclosed holdings cover less than 100% of it, the figure is a
                lower bound and is shown as &quot;≥ X%&quot;.
              </p>
            </Formula>
            <Formula name="Concentration: HHI and effective N">
              <Code>HHI = Σ_i e_i²     effective N = 1 / HHI</Code>
              <p>
                Computed on resolved exposures only. Effective N is the number of equal-weight holdings that would give the same concentration; a portfolio with 500
                names but an effective N of 17 behaves like 17 equal positions. Top-1, top-5 and top-10 shares are reported alongside.
              </p>
            </Formula>
            <Formula name="Annual fees">
              <Code>annual fee = value × (expense ratio + other recurring rate) + advisory fee(total value)</Code>
              <p>
                The portfolio expense ratio is value-weighted over holdings whose ratio is known. Holdings with an unknown ratio are listed in a warning and left out of
                the average; they are not counted as 0%. Direct stocks, crypto and cash carry no fund expense ratio.
              </p>
            </Formula>
            <Formula name="Tiered advisory fees">
              <Code>fee = Σ_brackets rate_k × (assets inside bracket k)</Code>
              <p>
                Charged marginally, like income tax: on $2,500,000 with 1.00% to $1M, 0.75% to $3M and 0.50% above, the fee is $10,000 + $11,250 = $21,250, an effective
                0.85%, not 0.75% on the whole balance.
              </p>
            </Formula>
            <Formula name="Fee drag">
              <Code>FV(P, C, g, T) = P(1+g)^T + C((1+g)^T − 1)/g     (g = 0: P + C·T)</Code>
              <Code>drag = FV(P, C, r, T) − FV(P, C, r − e, T)</Code>
              <p>
                Net return equals gross return minus fees, compounded annually, with contributions at year end. Example: $100,000 for 30 years at 7% with 0.50% in fees
                ends at $661,437 instead of $761,226; fees cost $99,789, 13.1% of the no-fee value. The dashboard shows a grid of returns (0 to 9%) and horizons (10 to
                30 years) rather than one number, because the return is your assumption, not a forecast.
              </p>
            </Formula>
            <Formula name="Fee schedule comparison">
              <Code>FV_A / FV_B = ((1 + r − e_A) / (1 + r − e_B))^T</Code>
              <p>
                Every schedule gets the same balance, contributions, horizon and gross return. For a lump sum, the ratio of ending values depends on the fee gap and the
                horizon and only mildly on the return, so &quot;Schedule A ends X% below Schedule B&quot; holds at any identical return. At 7% over 30 years, 1.00% versus
                0.10% in fees ends 22.4% lower ($574,349 versus $740,169 on $100,000).
              </p>
            </Formula>
          </Section>

          <Section id="assumptions" title="Assumptions">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Forward-looking figures use returns you choose. They are hypothetical illustrations, not forecasts.</li>
              <li>Annual compounding over whole years; fees come off the return each year; contributions arrive at year end.</li>
              <li>Concentration flags (single name above 10%, sector above 35%, fund overlap above 60% by default) are adjustable rules of thumb, not advice.</li>
              <li>Crypto and cash have no GICS sector; they appear as their own row in the sector chart rather than as &quot;not disclosed&quot;.</li>
              <li>Equity funds that report sector weights but no asset allocation are counted as stocks in the asset-class view.</li>
              <li>
                Share links carry tickers, asset classes and weights, plus account labels, names and sectors you entered, rate-only fee settings (expense ratio overrides, loads, advisory fee) and synthetic flags. They never carry share counts or dollar values. Opening one scales the portfolio to a $100,000 notional. Portfolios are stored only in your
                browser; only ticker symbols are sent to the server to look up data.
              </li>
            </ul>
          </Section>

          <Section id="providers" title="Data providers">
            <p>
              Each number shows its source and as-of time. Live data is fetched server-side and cached; when a provider fails, the app falls back to the last cached value and
              then to bundled sample data, and labels it as such. The bundled sample data was compiled by hand from issuer pages and stockanalysis.com, not from the live
              providers.
            </p>
            <ProviderStatus />
          </Section>

          <Section id="limitations" title="Known limitations">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong className="font-medium">Top-10-only holdings.</strong> Yahoo Finance reports only about the ten largest holdings of a fund. Overlap computed from
                them is a lower bound, and the uncovered weight shows as &quot;Unresolved / not disclosed&quot;. Each chart states its holdings coverage.
              </li>
              <li>
                <strong className="font-medium">Lagging holdings.</strong> Fund holdings are published with a delay (often monthly or quarterly) and are cached for days,
                so exposures reflect the last disclosure rather than today.
              </li>
              <li>
                <strong className="font-medium">Share-class merging.</strong> &quot;Group by issuer&quot; merges listed share classes of the same company using a small
                static table (below). Other cross-listings and ADRs are not merged.
              </li>
              <li>
                <strong className="font-medium">Sample data.</strong> Bundled seed profiles cover about 30 popular funds and are marked &quot;Sample data, captured
                2026-11-07&quot;. They were compiled by hand from issuer pages and stockanalysis.com, which lists only the top 25 holdings, so sample overlap is a
                lower bound. Fund holdings are as of late September to October 2026 (each fund&apos;s date differs, Sep 30 to Oct 23, 2026), and prices are the latest close
                as of the capture date. They go stale as funds rebalance.
              </li>
              <li>
                <strong className="font-medium">Unofficial and free-tier sources.</strong> Yahoo Finance access is unofficial and can break or be rate-limited. Alpha
                Vantage&apos;s free tier allows only a small number of requests per day. Check each provider&apos;s terms before any commercial use.
              </li>
              <li>Bond fund holdings are individual issues; overlap between bond funds understates shared exposure to the same issuers.</li>
              <li>Taxes, trading costs, loads and cash drag are not modelled in fee drag.</li>
            </ul>
          </Section>

          <Section id="mappings" title="Mapping tables">
            <h3 className="text-[15px] font-semibold">Sector labels to GICS</h3>
            <p className="text-muted-foreground">Labels that match none of these go to &quot;Other&quot;.</p>
            <Table aria-label="Sector label mapping">
              <THead>
                <TR>
                  <TH>Provider label</TH>
                  <TH>Scheme</TH>
                  <TH>GICS sector</TH>
                </TR>
              </THead>
              <TBody>
                {SECTOR_LABEL_MAPPINGS.map((m) => (
                  <TR key={`${m.provider}-${m.label}`}>
                    <TD className="font-mono text-[12.5px]">{m.label}</TD>
                    <TD className="text-muted-foreground">
                      {m.provider}
                      {m.note ? <span className="block text-xs">{m.note}</span> : null}
                    </TD>
                    <TD>{m.gics}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <h3 className="mt-6 text-[15px] font-semibold">Share classes grouped by issuer</h3>
            <Table aria-label="Issuer groups">
              <THead>
                <TR>
                  <TH>Issuer</TH>
                  <TH>Symbols</TH>
                </TR>
              </THead>
              <TBody>
                {ISSUER_GROUPS.map((g) => (
                  <TR key={g.key}>
                    <TD>{g.name}</TD>
                    <TD className="font-mono text-[12.5px]">{g.symbols.join(', ')}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <h3 className="mt-6 text-[15px] font-semibold">Crypto funds mapped to their underlying</h3>
            <Table aria-label="Crypto ETF mapping">
              <THead>
                <TR>
                  <TH>Fund</TH>
                  <TH>Issuer</TH>
                  <TH>Underlying</TH>
                  <TH>Looked through</TH>
                </TR>
              </THead>
              <TBody>
                {Object.entries(CRYPTO_ETF_UNDERLYING).map(([sym, e]) => (
                  <TR key={sym}>
                    <TD className="font-mono text-[12.5px]">{sym}</TD>
                    <TD>{e.issuer}</TD>
                    <TD>{e.underlying}</TD>
                    <TD className="text-muted-foreground">{e.kind === 'spot' ? 'Yes (spot)' : (e.note ?? 'No (futures)')}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Section>

          <Section id="attributions" title="Attributions">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Crypto prices:{' '}
                <a href="https://www.coingecko.com" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                  Powered by CoinGecko
                </a>
                .
              </li>
              <li>Stock, ETF and fund quotes, holdings and search: Yahoo Finance, accessed through the unofficial yahoo-finance2 library.</li>
              <li>Fund profiles: Alpha Vantage ETF_PROFILE.</li>
              <li>
                Sample data: compiled by hand from issuer pages (Vanguard, iShares, SSGA, Schwab, Invesco, Fidelity, Grayscale) and stockanalysis.com, and bundled with the
                app; it did not come from Yahoo Finance or Alpha Vantage. A few sector breakdowns are from marketxls.com and sample crypto prices from the coingecko.com
                homepage. Holdings are as of Sep 30 to Oct 23, 2026 depending on the fund; prices are the latest close as of the 2026-11-07 capture date. Source pages per
                fund are listed in docs/DATA_SOURCES.md. The starter-pack sample is synthetic and represents no real securities.
              </li>
              <li>Overlap is informational only and is not investment advice.</li>
            </ul>
          </Section>
        </article>
      </main>
    </QueryProvider>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-6 flex-col gap-4">
      <h2 id={`${id}-h`} className="border-b border-border pb-2 text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Formula({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[15px] font-semibold">{name}</h3>
      {children}
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <p className="overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-[13px]">{children}</p>;
}

function Var({ children }: { children: ReactNode }) {
  return <i className="font-serif">{children}</i>;
}
