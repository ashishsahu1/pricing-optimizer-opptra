"""Stage 4 — Agentic recommendation layer (Azure AI Foundry).

The agent receives the triage signal + the ML-derived suggested price and writes
one manager-ready sentence. Two guardrails make this real AI work, not filler:

1. **Constrained input** — the model is told the margin floor and target price.
2. **Validation loop** — we parse the price back out of the agent's own text and
   reject anything below floor, retrying with a stricter instruction. An
   unprofitable suggestion can never reach the screen.

Missing Foundry credentials degrade gracefully to a deterministic template.
"""

from __future__ import annotations

import re

from . import config

SYSTEM_PROMPT = (
    "You are a pricing co-pilot for an e-commerce marketplace team. "
    "You write ONE short, decisive recommendation a pricing manager can act on immediately. "
    "HARD RULE: never recommend a price below the margin floor. "
    "Always state the exact price, why, and the tradeoff (margin or Buy Box). "
    "Be specific with numbers. No hedging, no 'consider'. Under 40 words."
)


def _build_user_prompt(sku: dict) -> str:
    price = int(sku["suggestedPrice"])
    return (
        f"SKU {sku['id']} ({sku['brand']}). Our price Rs.{sku['ourPrice']}, "
        f"competitor Rs.{sku['competitorPrice']}, margin floor Rs.{sku['marginFloor']}, "
        f"Buy Box {sku['buyBox']}. Triage: {sku['category']}. "
        f"ML-recommended price: Rs.{price}. Win probability at that price is high. "
        f"Write the recommendation. The price you state MUST equal Rs.{price} "
        f"and MUST be >= Rs.{sku['marginFloor']}."
    )


def _foundry_chat(messages: list[dict]) -> str:
    from openai import OpenAI

    client = OpenAI(base_url=config.FOUNDRY_ENDPOINT, api_key=config.FOUNDRY_API_KEY)
    resp = client.chat.completions.create(
        model=config.FOUNDRY_MODEL, messages=messages, temperature=0.2, max_tokens=120
    )
    return resp.choices[0].message.content.strip()


def _template_reco(sku: dict) -> str:
    """Deterministic fallback so the API runs without Foundry keys."""
    price = int(sku["suggestedPrice"])
    margin = price - sku["marginFloor"]
    under = sku["competitorPrice"] - price
    if sku["category"] == "LOST_RECOVERABLE":
        return (
            f"Set {sku['id']} to Rs.{price} — Rs.{under} below competitor, "
            f"Rs.{margin} above floor. Recovers the Buy Box while protecting margin."
        )
    return (
        f"Raise {sku['id']} to Rs.{price} — still Rs.{under} under competitor and "
        f"Rs.{margin} above floor. Captures headroom without risking the Buy Box."
    )


def _extract_price(text: str) -> int | None:
    nums = re.findall(r"Rs\.?\s*([0-9][0-9,]*)", text)
    return int(nums[0].replace(",", "")) if nums else None


def recommend(sku: dict, max_retries: int = 2) -> tuple[str, str]:
    """Agentic loop: generate -> validate against margin floor -> retry if it breaches.

    Returns ``(text, source)`` where source is ``"foundry"`` or ``"template"``.
    SKUs with no suggested price (BELOW_FLOOR) must never reach here.
    """
    if sku.get("suggestedPrice") is None:
        raise ValueError(f"{sku['id']} has no suggested price — cannot recommend.")

    if not config.USE_FOUNDRY:
        return _template_reco(sku), "template"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _build_user_prompt(sku)},
    ]
    for _ in range(max_retries + 1):
        try:
            text = _foundry_chat(messages)
        except Exception:
            # Any transport/auth error -> safe deterministic output.
            return _template_reco(sku), "template"

        price = _extract_price(text)
        if price is not None and price >= sku["marginFloor"]:
            return text, "foundry"  # passed the guardrail

        # Guardrail tripped: push back and retry.
        messages.append({"role": "assistant", "content": text})
        messages.append(
            {
                "role": "user",
                "content": (
                    f"That price violates the margin floor of Rs.{sku['marginFloor']}. "
                    f"Rewrite using exactly Rs.{int(sku['suggestedPrice'])}."
                ),
            }
        )

    return _template_reco(sku), "template"  # all retries failed -> safe output
