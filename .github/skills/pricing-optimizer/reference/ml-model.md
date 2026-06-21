# ML model — Buy Box win probability

## The job

Learn how **relative price position** maps to **winning the Buy Box**, so we can ask price-search questions a hard rule can't answer:
- *"What is the **highest** price that still wins?"* → recover the Buy Box with **minimum** margin loss.
- *"How much can I raise before I risk losing it?"* → capture headroom safely.

## Feature & label

```python
def price_position(our_price, competitor_price):
    # percentage undercut: >0 means we are cheaper than the competitor
    return (competitor_price - our_price) / competitor_price * 100.0
```

- **Feature (X):** `price_position` — one number per SKU, in **percent**.
- **Label (y):** `1` if `buyBox == "Won"`, else `0`.
- **Model:** `LogisticRegression(C=2.0)` — light regularisation so the curve is smooth, not a step.

### Why `× 100` is mandatory

Raw fractions are ~0.1 in magnitude. Under `C=2.0` regularisation the fitted coefficient is ~0.5 and the **maximum achievable win-probability is ~0.40 — it never crosses `WIN_TARGET = 0.55`.** Result: `best_recover_price` always returns `None`, every Lost SKU wrongly falls through to `BELOW_FLOOR`, and the agent is never exercised.

Scaling the feature to a **percentage** (`× 100`) lets the model fit a sharp separating boundary near "we equal the competitor." Coefficient jumps to ~1.2 and probabilities span 0.0 → 1.0 correctly. **Do not remove the `× 100`.**

### Calibration check (post-fix, WIN_TARGET = 0.55)

| SKU | Buy Box | winProbNow | Reading |
|---|---|---|---|
| SKU-002 / 004 / 006 | Won | 0.86 / 0.92 / 1.00 | confident wins ✔ |
| SKU-001 / 003 / 008 | Lost | 0.00 | needs a cut to recover ✔ |
| SKU-005 | Lost | 0.21 | marginal ✔ |
| SKU-007 | Lost | 0.00 | lost AND unrecoverable (below-floor) ✔ |

If you ever see *every* SKU at win-prob ≈ 0.37–0.40, the feature scaling regressed.

## Price-search functions

```python
WIN_TARGET = 0.55  # probability we treat as "likely to win"

def best_recover_price(competitor_price, margin_floor, win_target=WIN_TARGET):
    """Highest price >= floor the model expects to win. None => true BELOW_FLOOR."""
    candidates = range(int(np.ceil(margin_floor)), int(competitor_price) + 1)
    winners = [p for p in candidates if win_probability(p, competitor_price) >= win_target]
    return max(winners) if winners else None

def safe_raise_price(competitor_price, current_price, margin_floor, win_target=WIN_TARGET):
    """Highest price we can raise to while staying >= floor and still likely winning."""
    ceiling = int(competitor_price)
    candidates = range(int(current_price), ceiling + 1)
    winners = [p for p in candidates if p >= margin_floor and win_probability(p, competitor_price) >= win_target]
    return max(winners) if winners else None
```

Key invariant: **both return the *highest* qualifying price** — recover/raise while sacrificing the least margin. Both are bounded at the competitor price (we don't price above the competitor) and at/above the floor.

## Why ML over the rule-based `suggestPrice`

`pricing.service.ts` uses a fixed `competitorPrice − ₹10` undercut. That's a hardcoded guess. The model instead *searches a learned probability curve* for the optimal profitable price, and the same curve answers both the "recover" and "raise" questions. The notebook is the upgrade that swaps the fixed rule for this search.
