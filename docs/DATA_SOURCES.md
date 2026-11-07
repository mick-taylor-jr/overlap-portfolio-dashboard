# Data sources

This file records where every bundled number comes from, what the live provider payloads look like,
and what has been verified against a live response versus only read in documentation.

Legend used below:
- **[LIVE]**: verified from a live page or response fetched on 2026-11-06 (US Eastern).
- **[DOCS]**: taken from provider documentation, type definitions or third-party descriptions; not
  confirmed against a live payload.
- **[GAP]**: could not be obtained; the seed leaves the field null/empty instead of guessing.

## 1. Bundled seed dataset (`data/seed/`)

All seed values carry `source: "seed"`, `stale: true`, and `capturedAt: "2026-11-07"` (the loader in
`lib/seed/index.ts` overrides each record's `asOf` with `capturedAt`). Research was done on
2026-11-06 US Eastern; the capture date 2026-11-07 was set by the project plan.

How it is built: every figure was copied by hand from the source page into
`scripts/seed/raw/*.txt` (percent, as displayed). `node scripts/seed/build.mjs` converts percent to
decimal, normalizes tickers with `lib/normalize`, maps sector labels to GICS with `toGicsSector`,
computes `holdingsCoverage = sum(holding weights)`, and writes the JSON. It never fills gaps.
`scripts/seed/coverage.json` is the machine-readable version of the table below.
`lib/samples/seed-data.test.ts` validates all three files against `fundProfileSchema` /
`quoteSchema` / `cryptoPriceSchema` and checks internal consistency, so bad data fails CI.

### 1.1 Fund profiles (`fund-profiles.json`) [LIVE]

Coverage is the sum of the listed holdings' weights. It is a **lower bound** input for overlap:
stockanalysis.com shows only the top 25 holdings without a subscription.

| Symbol | Expense ratio | Expense-ratio source | Holdings source | Holdings as of | Listed | Coverage | Total holdings | Sector source (as of) |
|---|---|---|---|---|---|---|---|---|
| SPY | 0.0945% | ssga.com SPY page (gross ER) | stockanalysis.com/etf/spy/holdings | 2026-10-23 | 25 | 52.5% | 504 | ssga.com SPY page (2026-10-26) |
| VOO | 0.03% | Vanguard fact sheet F0968 (2026-09-30) | stockanalysis.com/etf/voo/holdings | 2026-09-30 | 25 | 53.2% | 505 | Vanguard fact sheet F0968 (2026-09-30) |
| IVV | 0.03% | ishares.com IVV page | stockanalysis.com/etf/ivv/holdings | 2026-10-20 | 25 | 52.7% | 505 | ishares.com IVV page (2026-11-05) |
| VTI | 0.03% | Vanguard fact sheet F0970 (2026-09-30) | stockanalysis.com/etf/vti/holdings | 2026-09-30 | 25 | 47.2% | 3519 | Vanguard fact sheet F0970 (2026-09-30) |
| ITOT | 0.03% | ishares.com ITOT page | stockanalysis.com/etf/itot/holdings | 2026-10-16 | 25 | 47.1% | 2435 | ishares.com ITOT page (2026-11-05) |
| SCHB | 0.03% | schwabassetmanagement.com SCHB | stockanalysis.com/etf/schb/holdings | 2026-10-15 | 25 | 47.6% | 2420 | schwabassetmanagement.com SCHB (2026-09-30) |
| QQQ | 0.18% | invesco.com QQQ page ("total expense ratio is 0.18%") | stockanalysis.com/etf/qqq/holdings | 2026-10-26 | 25 | 71.6% | 104 | marketxls.com/etfs/qqq/sectors (third-party; rows sum to 92.63%) (2026-10-01) |
| QQQM | 0.15% | stockanalysis.com/etf/qqqm (issuer page not retrieved) | stockanalysis.com/etf/qqqm/holdings | 2026-10-22 | 25 | 71.5% | 106 | marketxls.com/etfs/qqqm/sectors (third-party; rows sum to 94.93%) (2026-10-04) |
| VGT | 0.09% | Vanguard fact sheet F0958 (2026-09-30) | stockanalysis.com/etf/vgt/holdings | 2026-09-30 | 25 | 77.5% | 318 | Vanguard fact sheet F0958 (all subindustries are IT) (2026-09-30) |
| XLK | 0.08% | ssga.com XLK page (gross ER) | stockanalysis.com/etf/xlk/holdings | 2026-10-23 | 25 | 84.4% | 76 | ssga.com XLK industry allocation (all IT industries) (2026-11-05) |
| SCHD | 0.06% | schwabassetmanagement.com SCHD | stockanalysis.com/etf/schd/holdings | 2026-10-23 | 25 | 80.6% | 102 | schwabassetmanagement.com SCHD (2026-09-30) |
| VYM | 0.04% | Vanguard fact sheet F0923 (2026-09-30) | stockanalysis.com/etf/vym/holdings | 2026-09-30 | 25 | 42.6% | 593 | Vanguard fact sheet F0923 (2026-09-30) |
| VXUS | 0.05% | Vanguard fact sheet F3369 (2026-09-30) | stockanalysis.com/etf/vxus/holdings | 2026-09-30 | 23 | 19.8% | 8901 | Vanguard fact sheet F3369 (2026-09-30) |
| VEA | 0.03% | Vanguard fact sheet F0936 (2026-09-30) | stockanalysis.com/etf/vea/holdings | 2026-09-30 | 24 | 21.5% | 3903 | Vanguard fact sheet F0936 (2026-09-30) |
| IEFA | 0.07% | ishares.com IEFA page | stockanalysis.com/etf/iefa/holdings | 2026-09-29 | 25 | 22.3% | 2623 | ishares.com IEFA page (2026-11-05) |
| VT | 0.06% | Vanguard fact sheet F3141 (2026-09-30) | stockanalysis.com/etf/vt/holdings | 2026-09-30 | 23 | 30.9% | 10185 | Vanguard fact sheet F3141 (2026-09-30) |
| AGG | 0.03% | ishares.com AGG page | stockanalysis.com/etf/agg/holdings | 2026-07-30 | 9 | 3.6% | 13459 | n/a (bond fund); cash and/or derivatives 0.75% (2026-10-23) (2026-10-23) |
| BND | 0.03% | Vanguard fact sheet F0928 (2026-09-30) | stockanalysis.com/etf/bnd/holdings | 2026-09-30 | 9 | 3.6% | 11434 | n/a (bond fund) (2026-09-30) |
| TLT | 0.15% | ishares.com TLT page | stockanalysis.com/etf/tlt/holdings | 2026-09-14 | 10 | 41.0% | 47 | n/a (bond fund); treasuries 100.01%, cash -0.01% (2026-10-23) (2026-10-23) |
| SCHG | 0.04% | schwabassetmanagement.com SCHG | stockanalysis.com/etf/schg/holdings | 2026-10-17 | 25 | 78.5% | 189 | schwabassetmanagement.com SCHG (2026-09-30) |
| VUG | 0.03% | Vanguard fact sheet F0967 (2026-09-30) | stockanalysis.com/etf/vug/holdings | 2026-09-30 | 25 | 79.4% | 135 | Vanguard fact sheet F0967 (2026-09-30) |
| VTV | 0.03% | Vanguard fact sheet F0966 (2026-09-30) | stockanalysis.com/etf/vtv/holdings | 2026-09-30 | 25 | 39.4% | 298 | Vanguard fact sheet F0966 (2026-09-30) |
| RSP | 0.2% | stockanalysis.com/etf/rsp (issuer page not retrieved) | stockanalysis.com/etf/rsp/holdings | 2026-10-22 | 25 | 6.2% | 509 | marketxls.com/etfs/rsp/sectors (third-party) (2026-10-04) |
| XLF | 0.08% | ssga.com XLF page (gross ER, 2026-11-06) | stockanalysis.com/etf/xlf/holdings | 2026-10-23 | 25 | 78.0% | 76 | ssga.com XLF industry allocation (all Financials industries) (2026-11-05) |
| XLV | 0.08% | ssga.com XLV page (gross ER, 2026-11-06) | stockanalysis.com/etf/xlv/holdings | 2026-10-23 | 25 | 84.0% | 61 | ssga.com XLV industry allocation (all Health Care industries) (2026-11-05) |
| ARKK | 0.75% | stockanalysis.com/etf/arkk (ark-funds.com not retrievable) | stockanalysis.com/etf/arkk/holdings | 2026-10-26 | 25 | 83.1% | 46 | marketxls.com/etfs/arkk/sectors (third-party; rows sum to 88.87%) (2026-10-01) |
| IBIT | 0.25% | ishares.com IBIT page (sponsor fee) | issuer (single-asset trust) | 2026-10-23 | 1 | 100.0% | 1 | n/a (crypto) (2026-10-23) |
| FBTC | 0.25% | fidelity.com/etfs/fbtc ("expense ratio of 25 basis points, as of August 1, 2024") | issuer (single-asset trust) | 2026-11-06 | 1 | 100.0% | not stated | n/a (crypto) (2026-11-06) |
| GBTC | 1.5% | etfs.grayscale.com/gbtc (management fee; 0.00077152 BTC/share, 124,516.4339 BTC, 2026-11-05) | issuer (single-asset trust) | 2026-11-05 | 1 | 100.0% | not stated | n/a (crypto) (2026-11-05) |
| ETHA | 0.25% | ishares.com ETHA page (sponsor fee) | issuer (single-asset trust) | 2026-11-05 | 1 | 100.0% | 1 | n/a (crypto) (2026-11-05) |

Notes per field:

- **Expense ratio.** Stored as a decimal (0.0945% -> 0.000945). Issuer page or issuer fact sheet
  wherever it could be retrieved. SPY uses SSGA's *gross* expense ratio (0.0945%). QQQM, RSP and
  ARKK use stockanalysis.com because the issuer pages could not be retrieved (Invesco product pages
  render data client-side; ark-funds.com refused the fetch). Crypto trusts use the sponsor fee
  (IBIT/ETHA 0.25% per ishares.com; FBTC 0.25% per fidelity.com "as of August 1, 2024"; GBTC 1.50%
  "management fee" per etfs.grayscale.com). Fee waivers, if any, are not modeled.
- **Holdings.** stockanalysis.com top-25 tables (data provided by Finnhub per the page). Weights are
  % of fund. Name fixes only: stockanalysis labels XOM as "ExxonMobil Holdings Corporation"; we use
  "Exxon Mobil Corporation". Class labels "(Class A/B/C)" were added to GOOGL/GOOG/BRK-B.
  - Rows with no ticker that are not securities were **excluded** (they are cash or liquidity
    vehicles, which would otherwise pollute company overlap): VXUS "Slcmt1142" 1.66% and
    "Mktliq 12/31/2049" 0.59%; VEA "Slbbh1142" 1.07%; VT "Slbbh1142" 0.54% and "Mktliq" 0.39%;
    BND "Mktliq 12/31/2049" 0.92%; AGG "BlackRock Cash Cl Inst SL Agency" 2.85%. That is why those
    funds list fewer than 25 (or 10) rows.
  - ARKK has two private holdings with no ticker; they are kept under synthetic symbols
    `PRIVATE:OPENAI` (4.51%) and `PRIVATE:KALSHI` (1.74%) so their weight is not dropped.
  - International holdings keep stockanalysis' exchange-prefixed symbols (`TPE:2330`, `AMS:ASML`,
    `KRX:005930`...), normalized (IEFA's `AMS: ASML` -> `AMS:ASML`) so VXUS/VEA/IEFA/VT overlap
    lines up. Some foreign names appear as US OTC tickers (`BABAF`) or US listings (`SHOP`).
  - QQQ, QQQM and ARKK list `SPCX` (Space Exploration Technologies Corp.), as reported by the source.
  - **Bond funds** (AGG, BND, TLT): top Treasury lines only, using synthetic keys
    `UST-<coupon>-<maturity>` (coupon in 1/8ths, e.g. `UST-4.625-2035-02-15`) so identical Treasury
    issues match across AGG/BND/TLT. AGG's source rounds coupons to 2 dp (4.63); they were mapped to
    the 1/8th coupon (4.625). `sectorWeights` is `{}` and `assetAllocation.bond` is ~1, so bond funds
    do not pollute stock or sector overlap.
  - **Crypto trusts** (IBIT, FBTC, GBTC, ETHA): one holding, the CoinGecko id (`bitcoin` /
    `ethereum`) at weight 1, so crypto exposure is not hidden in the fund bucket. Issuers report
    "Number of Holdings: 1" for IBIT and ETHA; FBTC and GBTC do not state a count (`null`). GBTC
    reported 0.00077152 BTC per share and 124,516.4339 BTC total (2026-11-05).
- **Total holdings count.** Issuer figure where available (issuer pages count securities only),
  otherwise stockanalysis' "Showing 25 of N" (which can include cash lines). Examples: VOO 505
  (Vanguard) vs 518 (stockanalysis); ARKK 46 (stockanalysis overview) vs 45 (its holdings page).
- **Sector weights.** Converted to decimals and mapped to GICS names via `toGicsSector`:
  - GICS sources: SSGA (SPY), iShares (IVV, ITOT, IEFA; label "Communication" -> Communication
    Services; the "Cash and/or Derivatives" row is omitted), Schwab (SCHB, SCHD, SCHG), Vanguard
    VOO fact sheet.
  - **ICB/Morningstar-style sources (approximate)**: Vanguard fact sheets for VTI, VYM, VXUS, VEA,
    VT, VUG, VTV use "Technology", "Telecommunications", "Basic Materials". These are mapped to
    Information Technology / Communication Services / Materials, but the schemes differ: e.g. ICB
    puts Alphabet and Meta in Technology, while GICS puts them in Communication Services. So VUG's
    "Information Technology" 72.1% is not comparable to SCHG's GICS 54.14%.
  - **Sector funds** (VGT, XLK, XLF, XLV): issuers publish industry/sub-industry breakdowns only,
    all inside one GICS sector, so the seed stores that sector at 1.0.
  - **Third-party** (marketxls.com) for QQQ, QQQM, RSP, ARKK, because issuer data could not be
    retrieved. These rows do not sum to 100% (QQQ 92.63%, QQQM 94.93%, ARKK 88.87%); the remainder
    is left unassigned (not invented).
  - Bond and crypto funds: `{}`.
- **Asset allocation.** Only where the source states it: IVV/ITOT/IEFA (iShares "Cash and/or
  Derivatives" 0.06% / 0.21% / 0.63%), AGG (cash 0.75%), TLT (treasuries 100.01%, cash -0.01%,
  stored as bond 1 / cash 0), BND (Vanguard "short-term reserves 0.0%"), crypto trusts
  (`{ crypto: 1 }`, an extra key beyond stock/bond/cash/other). **[GAP]** All other equity funds
  have no `assetAllocation`; consumers should fall back on fund type rather than assume 100% stock.

Known staleness: holdings dates range from 2026-07-30 (AGG) to 2026-10-26. Vanguard VGT (8:1) and
VUG (6:1) split on 2026-04-21 (verified on Vanguard's press release), which explains their low
per-share prices.

### 1.2 Quotes (`quotes.json`) [LIVE]

60 quotes: the 30 seed funds and 30 large US stocks. Each `price` is a real daily close from
`stockanalysis.com/<stocks|etf>/<symbol>/history/` and the record's `asOf` is that close date
(2026-10-22 to 2026-11-06). Where the history page was stale or unavailable, the symbol overview
page's "At close" figure was used (VXUS, VUG, V, UNH, HD, WMT, PEP, CRM) or a history URL variant
(XOM). The pages were cached at different times, so **dates differ by symbol**; the app shows them
as "Sample data, captured 2026-11-07" anyway. Rejected while capturing: stockanalysis'
`/list/sp-500-stocks/` page (no date, values inconsistent with the dated history pages) and
history pages that were served from a 2025 cache.

### 1.3 Crypto (`crypto.json`) [LIVE]

USD prices from the coingecko.com homepage table, fetched 2026-11-06 (the page shows no timestamp):
bitcoin, ethereum, tether, ripple, solana, usd-coin, dogecoin, cardano, chainlink, avalanche-2,
litecoin, polkadot. Cross-checked against the individual coin pages for BTC, ETH and SOL. The
public API (`api.coingecko.com/api/v3/simple/price`) could not be fetched from the research tool
(robots-disallowed), so no raw API payload was captured.

## 2. Provider payload shapes

### 2.1 Alpha Vantage `ETF_PROFILE`

- **[LIVE]** `https://www.alphavantage.co/query?function=ETF_PROFILE&symbol=QQQ&apikey=demo`
  returned only a notice that the `demo` key "is for demo purposes only" and asking to claim a free
  key, not a profile. **No payload was captured; `fixtures/alphavantage-etf-profile-QQQ.json` was
  not created** rather than invent one. Capture one with a real free key (it costs 1 of 25 daily
  requests) before relying on the field details below.
- **[LIVE]** Free tier: alphavantage.co/premium states the standard limit is "25 API requests per
  day" (no per-minute figure stated for free). Premium plans: "No daily limits", 75 to 1200
  requests/min.
- **[DOCS]** (third-party write-ups only, the docs page could not be read past truncation): the
  response has top-level `net_assets`, `net_expense_ratio`, `portfolio_turnover`, `dividend_yield`,
  `inception_date`, `leveraged`, plus `sectors: [{ sector, weight }]` and `holdings: [...]`. A
  published client converts `weight` with `astype(float)`, which suggests weights arrive as
  **strings**; whether they are decimal fractions or percent is **unverified**, and so is whether
  `holdings` is full or truncated. Sector labels are assumed to be upper-case GICS names
  (`INFORMATION TECHNOLOGY`); `toGicsSector` is case- and punctuation-insensitive, so either casing
  maps correctly. Adapters must parse weights defensively (string -> number; if the weights sum to
  ~100, divide by 100) and compute coverage from the result.

### 2.2 yahoo-finance2 `quoteSummary` (`fundProfile`, `topHoldings`) [DOCS]

From the installed package's type definitions (`yahoo-finance2@4.0.5`,
`esm/src/modules/quoteSummary-iface.d.ts`):

- `topHoldings`: `{ stockPosition?, bondPosition?, cashPosition?, otherPosition?, preferredPosition?,
  convertiblePosition?: number; holdings: { symbol, holdingName, holdingPercent: number }[];
  sectorWeightings: { [yahooKey]: number }[]; equityHoldings; bondRatings; bondHoldings }`.
  `sectorWeightings` is an **array of single-key objects** with keys `realestate`,
  `consumer_cyclical`, `basic_materials`, `consumer_defensive`, `technology`,
  `communication_services`, `financial_services`, `utilities`, `industrials`, `energy`,
  `healthcare` (all mapped in `SECTOR_LABEL_MAPPINGS`).
- `holdings` is Yahoo's **top ~10 only** (a hard limitation, as the product spec says; not
  re-verified live). Overlap computed from it is a lower bound; coverage = sum of `holdingPercent`.
- `holdingPercent` and the position fields are decimal fractions in Yahoo's raw API (e.g. 0.07 =
  7%); not re-verified live.
- `fundProfile.feesExpensesInvestment`: `{ annualReportExpenseRatio?, grossExpRatio?, netExpRatio?,
  annualHoldingsTurnover?, totalNetAssets? }`.
- **[LIVE]** finance.yahoo.com/quote/QQQ/holdings/ showed "Holdings data is currently not
  available for QQQ" when fetched; Yahoo's web data can be missing even when the API works.

### 2.3 CoinGecko (Demo plan)

- **[LIVE]** Pricing page: Demo plan is 100 calls/min and 10,000 call credits/month, "Attribution
  required"; the License column is blank for Demo while paid tiers say "Commercial".
- **[LIVE]** Changelog, 2026-05-17: Demo per-minute limit raised from 30 to 100 ("new limits are
  already in effect"). The older rate-limit docs page still says ~30/min, so budget conservatively.
- **[LIVE]** Authentication docs: base URL `https://api.coingecko.com/api/v3/`; key in header
  `x-cg-demo-api-key` (query param `x_cg_demo_api_key` works but is discouraged); each HTTP 200
  uses one credit.
- **[LIVE]** Attribution guide (brand.coingecko.com/resources/attribution-guide): use one of "Data
  provided by CoinGecko", "Price data by CoinGecko", "Source: CoinGecko" or "Powered by CoinGecko
  API", linked to https://www.coingecko.com or https://www.coingecko.com/en/api; place it visibly
  next to the data; do not alter logos or imply partnership. Optional
  `?utm_source=<project>&utm_medium=referral`.
- **[LIVE]** Changelog 2026-10-20: `/simple/price` gained 21 more fiat currencies (no effect here).

## 3. Normalization tables (`lib/normalize`)

- `normalizeTicker`: uppercase/trim; `.` `/` and spaces -> `-` (`brk.b` -> `BRK-B`), except a
  dot between digits (bond keys); `EXCH: SYM` -> `EXCH:SYM`.
- `ISSUER_GROUPS` / `issuerKey`: GOOG+GOOGL, BRK-A+BRK-B, FOX+FOXA, NWS+NWSA, UA+UAA, BF-A+BF-B,
  LEN+LEN-B, HEI+HEI-A, Z+ZG; everything else passes through.
- `CRYPTO_ETF_UNDERLYING`: spot bitcoin (IBIT, FBTC, GBTC, BITB, ARKB, HODL, BTCO, EZBC), spot
  ether (ETHA, FETH, ETHE). **BITO is futures-based**: listed with `kind: 'futures'` and
  `cryptoEtfUnderlying('BITO')` returns `null`, so it is not looked through.
- `CRYPTO_TICKER_TO_ID`: BTC, ETH, SOL, ADA, XRP, DOGE, AVAX (`avalanche-2`), LINK, DOT, LTC, USDC
  (`usd-coin`), USDT (`tether`). Static fallback for when CoinGecko `/search` is unavailable.
- `SECTOR_LABEL_MAPPINGS` / `toGicsSector`: GICS names, Yahoo keys, Alpha Vantage upper-case
  labels, starter-pack labels (`Technology`, `Healthcare`), iShares `Communication`, ICB labels
  (`Telecommunications`, `Basic Materials`, flagged approximate); unknown -> `Other`.

## 4. Starter pack (`data/starter-pack-portfolio_holdings.csv`)

Explicitly synthetic (`synthetic=true` on all 120 rows, 6 accounts, 15 securities, all USD,
as_of 2026-09-30). Bundled for the client as a string in `lib/samples/starter-pack.ts`
(generated by `scripts/seed/build.mjs`). `parseStarterPackHoldings` maps each row to an equity
position with `feeOverrides.expenseRatio = annual_fee_bps / 10000`, rejects non-USD and
blank/invalid/non-positive amounts with explicit per-line errors (never 0), and the reconciliation
test checks per-account totals of `market_value_usd` against the parsed positions.

## Full holdings (added 2026-11-07)

| Fund | Holdings | Coverage | Source | As of |
|---|---|---|---|---|
| IVV | 503 | 99.9% | iShares `latest-holdings.csv`, linked from the IVV product page on ishares.com | 2026-11-05 |
| SPY | 503 | 99.9% | SSGA `holdings-daily-us-en-spy.xlsx`, linked from the SPY product page on ssga.com | 2026-11-05 |

Both files were read in a browser and converted with `scripts/seed/apply-full-holdings.mjs`. The raw extracts are in `scripts/seed/full-holdings/`. Equity rows only; cash and derivatives (under 0.1%) stay as undisclosed weight. Each profile's `holdingsSource` field records where its holdings came from. Result: SPY/IVV overlap = 99.3%, an exact figure rather than a lower bound. Vanguard (VOO, VTI) and Invesco (QQQ) do not link a holdings file from their product pages, so those funds keep their top-25 lists, and their overlaps are still shown as lower bounds.
