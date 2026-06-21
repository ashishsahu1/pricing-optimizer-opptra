# Triage & the agentic layer

## Stage 3 — Triage (4-way classification)

Every SKU is sorted into exactly one bucket. Only the two **actionable** ones reach the agent.

```python
HEADROOM_THRESHOLD = 50  # min ₹ gap below competitor before a Won item is worth raising

def triage(sku):
    comp, ours, floor, bb = sku.competitorPrice, sku.ourPrice, sku.marginFloor, sku.buyBox
    competitor_below_floor = comp < floor

    if competitor_below_floor:
        return "BELOW_FLOOR", None
    if bb == "Lost":
        target = best_recover_price(comp, floor)
        return ("LOST_RECOVERABLE", target) if target else ("BELOW_FLOOR", None)
    if comp - ours >= HEADROOM_THRESHOLD:          # Won, with room to raise
        return "WON_HEADROOM", safe_raise_price(comp, ours, floor)
    return "HOLD", None
```

### Decision order (must stay in this order)

1. **Competitor < floor?** → `BELOW_FLOOR` (None). The unprofitable-trap guard, checked first.
2. **Buy Box Lost?** → ask the model for `best_recover_price`. Got one → `LOST_RECOVERABLE`; none → `BELOW_FLOOR`.
3. **Buy Box Won + gap ≥ ₹50?** → `WON_HEADROOM` (raise price).
4. **Otherwise** → `HOLD` (leave alone).

| Bucket | Meaning | Action | Goes to agent? |
|---|---|---|---|
| 🟢 `LOST_RECOVERABLE` | lost but winnable above floor | suggest recover price | yes |
| 🟢 `WON_HEADROOM` | winning but underpriced | suggest raise price | yes |
| 🔴 `BELOW_FLOOR` | competitor below our floor | flag human, no price | **no** |
| ⚪ `HOLD` | already fine | nothing | no |

Actionable = `LOST_RECOVERABLE` ∪ `WON_HEADROOM`, sorted Lost-first (urgency).

## Stage 4 — Agentic recommendation (Azure AI Foundry)

The agent is **constrained input + validated output**, never free-form.

### Two guardrails

1. **Constrained input** — the prompt states the exact margin floor and the ML target price, and demands the stated price equal the target and be ≥ floor.
2. **Validation loop** — the reply is parsed back to a number; **anything below floor is rejected and retried** with a stricter instruction. After `max_retries`, it falls back to a deterministic template. A sub-floor reco can never ship.

```python
def recommend(sku, max_retries=2):
    if sku.suggestedPrice is None:
        return None
    if not USE_FOUNDRY:
        return _template_reco(sku)            # graceful fallback, no keys needed
    messages = [{"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": _build_user_prompt(sku)}]
    for attempt in range(max_retries + 1):
        text = _foundry_chat(messages)
        price = _extract_price(text)
        if price is not None and price >= sku.marginFloor:
            return text                       # passed the guardrail
        messages.append({"role": "assistant", "content": text})
        messages.append({"role": "user", "content":
            f"That price violates the margin floor of Rs.{sku.marginFloor}. "
            f"Rewrite using exactly Rs.{int(sku.suggestedPrice)}."})
    return _template_reco(sku)                 # all retries failed -> safe output
```

### Flow

```
triage signal + ML target + floor
        │
        ▼
   Foundry gpt-4.1  ──►  "Set price to ₹1199 …"
        │
        ▼
   extract price ──► price ≥ floor?
        ├─ yes ─► ship recommendation
        └─ no  ─► push back, retry (then template fallback)
```

### Config & secrets

- Loaded from `scripts/.env` (git-ignored): `FOUNDRY_ENDPOINT`, `FOUNDRY_API_KEY`, `FOUNDRY_MODEL`.
- Endpoint is OpenAI-compatible (`.../openai/v1`), called via the `openai` SDK `chat.completions`.
- No creds → `USE_FOUNDRY = False` → deterministic `_template_reco` keeps the notebook runnable end-to-end.

## Stage 5 — Apply

`apply_reprice(sku_id)` mirrors the UI Apply button: re-checks the floor one final time, then flips `ourPrice` and sets `status = "Repriced"`. Refuses `None` (below-floor) and any price below floor.
