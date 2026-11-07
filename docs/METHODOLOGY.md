# Methodology

All weights are decimal fractions (0.05 = 5%). Notation: `w_f` is component `f`'s share of total portfolio value; `h_{f,i}` is security `i`'s weight inside component `f`. A directly held stock or coin is a component with one holding at weight 1.

## Look-through exposure
`e_i = Σ_f w_f × h_{f,i}`

Each company's exposure is the sum of what every fund contributes to it, so the UI can show which funds make up each bar. When a fund's known holdings don't add up to 100% (`coverage < 1`), the remainder goes into **Unresolved / not disclosed**. It is never dropped. Sector and asset-class exposure work the same way, using each fund's sector weights and asset allocation.

**Group by issuer** merges share classes of the same company (GOOG + GOOGL → Alphabet, BRK-A + BRK-B → Berkshire Hathaway) using a small static table. **Group by ticker** keeps them separate. Spot crypto ETFs (IBIT, FBTC, GBTC, ETHA, ...) are looked through to the coin they hold, so crypto exposure isn't hidden inside the fund bucket.

## Pairwise overlap
`overlap(A, B) = Σ_i min(h_{A,i}, h_{B,i})`, between 0 and 1.

If either fund's holdings are only partly known, the true overlap can only be higher, so it is shown as "≥ X%".

## Concentration
- **HHI** = `Σ e_i²` over resolved exposures. **Effective number of holdings** = `1 / HHI`: the number of equal-sized positions with the same concentration.
- **Top-1 / Top-5 / Top-10 share** of the portfolio.
- **Flags** fire when a single name, a single sector or a fund pair goes above a threshold you set (defaults: 10%, 35%, 60%). They are descriptive heuristics, not advice.

## Fees
- Annual fee per holding = `value × (expense ratio + other recurring)`. The portfolio figure is the dollar total plus a value-weighted average over holdings whose ratio is known. Unknown ratios are listed and excluded, never counted as zero.
- **Tiered advisory fees are marginal.** Each bracket's rate applies only to the assets inside that bracket. Example: $2.5M with 1.00% to $1M, 0.75% to $3M: 10,000 + 11,250 = **$21,250 (0.85%)**.

## Fee drag (hypothetical illustration, not a forecast)
Convention: **net return = gross return − fees**, compounded annually, contributions at the end of each year.

```
FV(P, C, g, T) = P(1+g)^T + C((1+g)^T − 1)/g        (g = 0: P + C·T)
drag = FV(P, C, r, T) − FV(P, C, r − e, T)
```

The default view is a grid across several gross-return assumptions (0–9%) and horizons (10/20/30 years), not one "expected" number.

## Comparing fee schedules without predicting returns
Every schedule is run at the **same** starting balance, contributions, horizon and gross return. For lump sums, the ratio of ending values is

`((1 + r − e₁) / (1 + r − e₂))^T`

which barely changes with `r`. The fee gap is close to the same at any return you assume. Example: $100,000 for 30 years at 7% gross: 0.10% fees end at $740,169, 1.00% fees end at $574,349, a $165,820 difference (the higher-fee path ends 22.4% lower).

## Verified test vectors
| Case | Expected |
|---|---|
| P=100k, r=7%, e=0.50%, T=30 | Gross 761,225.50 · Net 661,436.62 · Drag 99,788.89 (13.11%) |
| + C=10k/yr | Gross 1,705,833.37 · Net 1,525,185.26 · Drag 180,648.11 (10.59%) |
| e₁=0.10% vs e₂=1.00% | 740,169.45 vs 574,349.12 · Diff 165,820.33 · ratio 0.776 |
| P=0, C=10k, g=0, T=30 | 300,000 |
| Tiered $2.5M | 21,250 (0.85%) |
| 60% A / 40% B look-through | AAPL 40%, MSFT 28%, NVDA 12%, GOOGL 20% · HHI 0.2928 · eff. N 3.415 · overlap 0.50 |
