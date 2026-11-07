# Decisions

A running log of judgment calls. Newest at the bottom.

## 2026-11-06: Stack versions
Checked npm on build night instead of assuming: Next.js 16.4.5, React 19.3, Tailwind 4.3, Zod 4.6, Vitest 5.1, Recharts 3.10, TanStack Query 5.107, yahoo-finance2 4.0.5, fast-check 4.10.

## Fonts are bundled locally
`next/font/google` downloads fonts at build time. The `geist` npm package bundles them, so builds work offline and in restricted CI.

## Money math uses plain numbers, not integer cents
The RedHawk starter pack recommends BigInt cents for ledger work. Overlap does compounding and percentage math (fee drag, look-through weights), where cents-exact integers add no accuracy and make exponentiation awkward. All math stays in IEEE doubles. Rounding happens only at the display layer, and tests check results to the cent against independently computed vectors. No decimal library was introduced.

## Weights are decimal fractions everywhere internally
0.05 means 5%. Conversion happens only in `lib/format.ts`.

## Unknown is never zero
A fund with no expense ratio shows "unknown", is excluded from the weighted average, and appears in a visible warning. Uncovered holdings weight goes into an explicit "Unresolved / not disclosed" bucket.

## Overlap from partial holdings is a lower bound
Yahoo `topHoldings` returns about the top 10. `overlap(A,B) = Σ min(h_A,i, h_B,i)` over known holdings can only grow as more holdings are revealed, so any pair where either fund has coverage < 1 is labeled "≥ X%". HHI and effective N are computed on resolved exposures only, and the UI shows coverage next to them.

## Tiered advisory fees are marginal
Each bracket's rate applies only to the AUM inside that bracket (like income tax). $2.5M on 1.00% to $1M, 0.75% to $3M comes out to $21,250 (0.85% effective).

## Schedule comparison simulates year by year
When a schedule includes a tiered advisory fee, the effective rate changes as the balance grows, so the comparison steps through years: `e_t = fund + other + effectiveAdvisory(balance_t)` and `balance_{t+1} = balance_t × (1 + r − e_t) + C`. For flat schedules this equals the closed-form FV, which is tested.

## Fee convention
Net return = gross − fees, compounded annually, contributions at year end. This is stated in the UI next to every projection, and every forward-looking number is labeled "Hypothetical illustration, not a forecast".

## Share links carry weights, not dollars
The URL hash holds symbols, asset classes and weights only (lz-string compressed). Opening a shared link scales the weights to a $100,000 notional and says so.

## Starter pack data is included and labeled synthetic
The RedHawk starter pack's `portfolio_holdings.csv` (120 synthetic rows, 6 accounts) can be loaded with one click. It shows multi-account aggregation (Challenge 17, MVP 1) and uses its `annual_fee_bps` (Challenge 18, MVP 1). Every value from it is labeled synthetic.

## UI was explicitly requested
The starter pack's default guidance is "no UI unless the team asks". The team's build spec asks for a full dashboard, so this is a requested extension.

## Build environment can't reach data APIs
The build sandbox can reach npm but not Alpha Vantage, CoinGecko, Yahoo or SEC. Seed data was researched from issuer and public pages through web tools and is dated. Provider adapters are unit-tested against fixtures from documentation. Live response shapes get verified against the deployed Vercel functions, which can reach the APIs, and any differences are recorded in DATA_SOURCES.md.
