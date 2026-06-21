# Worked examples (real numbers from a live run)

## Hero — SKU-001, the recoverable lamp

**Input:**

| field | value |
|---|---|
| ourPrice | ₹1299 |
| competitorPrice | ₹1199 |
| buyBox | Lost |
| marginFloor | ₹1050 |

**Trace:**

1. **Ingest** — `priceGap = 1199 − 1299 = −100` (competitor undercut us), `marginHeadroom = 1299 − 1050 = +249` (room to drop).
2. **ML** — position now `= (1199 − 1299)/1199 × 100 = −8.3%` → `win_probability = 0.00`. We're pricier, so we lost.
3. **Search** — `best_recover_price(1199, 1050)` scans ₹1050…₹1199, keeps prices with win-prob ≥ 0.55, returns the **highest** = **₹1199**.
4. **Triage** → `LOST_RECOVERABLE`, `suggestedPrice = ₹1199`.
5. **Agent** → *"Set price to ₹1199 to match the competitor and recover the Buy Box; this maintains a margin of ₹149 above the floor, trading some margin for a high probability of Buy Box win."* Guardrail: `1199 ≥ 1050` ✔.
6. **Apply** → ourPrice `1299 → 1199`, status `Repriced` ✔.

**Why ₹1199 and not lower?** It's the *highest* price that still wins — recover the Buy Box while sacrificing the least margin. ₹1100 would also win but throws away ₹99 for nothing. Still ₹149 above floor.

## Full actionable run (5 SKUs)

| SKU | category | from → to | margin vs floor | verdict |
|---|---|---|---|---|
| SKU-001 | LOST_RECOVERABLE | 1299 → **1199** | +149 | recover Buy Box |
| SKU-003 | LOST_RECOVERABLE | 2499 → **2199** | +399 | recover Buy Box |
| SKU-005 | LOST_RECOVERABLE | 3799 → **3750** | +550 | recover Buy Box |
| SKU-008 | LOST_RECOVERABLE | 2199 → **2100** | +350 | recover Buy Box |
| SKU-006 | WON_HEADROOM | 1150 → **1390** | +490 | raise, capture headroom |

Holding (no action): SKU-002, SKU-004. Blocked: SKU-007.

## Villain — SKU-007, the unprofitable trap

**Input:**

| field | value |
|---|---|
| ourPrice | ₹449 |
| competitorPrice | ₹399 |
| marginFloor | ₹420 |

The competitor (₹399) is **below our floor** (₹420). Matching them = selling at a loss.

**Trace:** Triage step 1 fires (`competitor < floor`) → `BELOW_FLOOR`, `suggestedPrice = None`. The LLM is **never called**. `apply_reprice` would refuse it. Output:

> *"SKU-007: competitor ₹399 is below floor ₹420. No profitable action — matching the competitor would lose money. Flag for manual review."*

This is the guardrail proof: the system will **never** recommend an unprofitable price, even when a naive "always undercut" rule would.
