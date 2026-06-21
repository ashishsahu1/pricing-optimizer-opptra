---
name: pricing-optimizer
description: >-
  Domain knowledge for the Opptra Pricing Optimizer — an ML + agentic system that
  turns competitor-price snapshots into one-click repricing decisions, bounded by a
  margin floor. USE WHEN working in this repo on: Buy Box win-probability modelling,
  the 4-way triage (LOST_RECOVERABLE / WON_HEADROOM / BELOW_FLOOR / HOLD), the
  margin-floor guardrail, the Azure AI Foundry recommendation agent, best_recover_price
  / safe_raise_price price search, pricing.service.ts, the Angular price-bar UI, or the
  scripts/pricing_optimizer_poc.ipynb notebook. Triggers: "pricing optimizer", "buy box",
  "margin floor", "win probability", "triage SKU", "suggest price", "recover buy box",
  "reprice", "competitor price", "Foundry recommendation agent".
---

# Opptra Pricing Optimizer

## What this is (one line)

Turn a snapshot of competitor prices into **decisions** — *"set SKU-001 to ₹1199, recover the Buy Box, stay ₹149 above floor"* — instead of more dashboards. Every suggestion is hard-bounded by a **margin floor**: the system will never recommend a price that loses money.

## The story (read this first — it makes everything else click)

Ranjit runs pricing for an online store. Every morning he opens a spreadsheet with hundreds of products. Money is leaking somewhere, but he can't *see* where. He doesn't want more numbers — he wants a tap on the shoulder: *"Fix this one, here's the exact price, do it now."* That tap is this system. Follow one product through its day:

**The product — SKU-001, a ₹1299 lamp:**
- We sell it at **₹1299**.
- A competitor sells the same thing at **₹1199** (₹100 cheaper).
- Because we're pricier we **lost the Buy Box** (the default "Buy Now" spot that gets ~80% of sales) — we're basically invisible.
- Our **floor is ₹1050** — below that we stop making money.

So: too expensive, lost the sale spot, but we have room to drop. Ranjit would never spot this in a sea of rows. The system does:

1. **It reads the snapshot.** Lays the raw numbers into a clean table. (the `df` DataFrame)
2. **It learns what winning looks like.** A small ML model studied the 8 products and which win/lose, and discovered the pattern itself: *"cheaper than competitor → we win the Buy Box; pricier → we lose it."* Now it can answer what a hard rule can't — *"what's the **highest** price that still wins, so we give up the least margin?"* For the lamp that's **₹1199** (match the competitor exactly; dropping further would just burn margin for nothing).
3. **It sorts every product into 4 buckets** — 🟢 Lost-but-recoverable, 🟢 Winning-with-headroom, 🔴 Below-floor (don't touch, flag a human), ⚪ Hold. Only the greens are "act now." That's the *show-me-the-problem-not-the-data* promise.
4. **The AI writes the recommendation.** Azure GPT-4.1 turns the facts + the ₹1199 target into one manager-ready sentence. **Critical safety bit:** before that sentence is allowed through, the system parses the price back out of the AI's own text and checks it's still ≥ floor. If the AI hallucinated ₹900, it's **rejected and rewritten**. An unprofitable suggestion can never reach the screen.
5. **One click applies it.** Price flips ₹1299 → ₹1199, status → `Repriced`, live on the marketplace.

**The villain — SKU-007:** our floor is ₹420 but the competitor sells at ₹399 (*below* our floor). A naive system screams "undercut them, drop to ₹398!" and quietly loses money forever. Ours catches it, files it under 🔴 Below-floor, **never suggests a price, never even calls the AI**, and tells Ranjit to look manually. That single case is the proof the system respects the one rule that matters.

**The moral:** it reads the prices, learns who's winning, picks the smartest *profitable* price, explains it like a colleague, refuses to lose money, and lets you apply it in one click.

## The two layers

| Layer | Lives in | Role |
|---|---|---|
| **Angular UI** | `frontend/` | Deterministic, rule-based triage + one-click apply. Ships today. |
| **ML + Agentic POC** | `scripts/pricing_optimizer_poc.ipynb` | Replaces hand-rules with a learned win-probability model + an LLM agent. Proves the next version. |

Both share the **same 8-SKU snapshot**, the **same 4 triage categories**, and the **same margin-floor guardrail**, so the notebook is a drop-in upgrade path — not a separate experiment.

## The 5-stage pipeline

```
Ingest → ML (win-probability) → Triage (4 buckets + target price) → Agent (write reco) → Apply
```

| # | Stage | Notebook cell | Produces |
|---|---|---|---|
| 1 | Ingest | `SKU_SNAPSHOT → df` | frame + `priceGap`, `marginHeadroom` |
| 2 | ML | `LogisticRegression` | `win_probability(price, competitor)` curve |
| 3 | Triage | `triage()` | `category` + `suggestedPrice` |
| 4 | Agent | `recommend()` | floor-safe one-sentence reco (LLM + retry) |
| 5 | Apply | `apply_reprice()` | status → `Repriced` |

## Hard rules (never break these when editing)

1. **Margin floor is absolute.** No code path may output `suggestedPrice < marginFloor`. The triage, the price search, the agent guardrail, AND `apply_reprice` each re-check it. Keep all four checks.
2. **`BELOW_FLOOR` means competitor < floor.** These get `suggestedPrice = None`, are never sent to the LLM, and are flagged for a human.
3. **`best_recover_price` returns the HIGHEST winning price** (≥ floor, win-prob ≥ `WIN_TARGET`) — minimum margin sacrifice, not maximum undercut.
4. **The agent is constrained + validated**, never free-form. If you touch `recommend()`, keep the parse-back-and-reject-below-floor loop.
5. **Secrets only via `.env`** (`scripts/.env`, git-ignored). Never hardcode `FOUNDRY_API_KEY`. Missing creds must degrade gracefully to `_template_reco`.

## Common gotcha (already fixed — don't reintroduce)

The ML feature `price_position = (competitor − ours) / competitor` is tiny (~0.1). With `LogisticRegression(C=2.0)` that gets washed out by regularisation and the curve **never reaches `WIN_TARGET = 0.55`**, so every Lost SKU wrongly collapses to `BELOW_FLOOR`. **Fix in place:** the feature is scaled to a percentage (`× 100`). Keep the `× 100`.

## Detailed references

- `reference/ml-model.md` — the win-probability model, feature design, calibration, price-search functions.
- `reference/triage-and-agent.md` — the 4-way decision tree and the agentic guardrail loop.
- `reference/worked-example.md` — SKU-001 and SKU-007 traced end-to-end with real numbers.
- `../../../scripts/Architecture.md` — full architecture doc with Mermaid diagrams.

## Environment

`script-poc` venv / Jupyter kernel: `pandas`, `scikit-learn`, `openai`, `azure-ai-inference`. Foundry config in `scripts/.env`.
