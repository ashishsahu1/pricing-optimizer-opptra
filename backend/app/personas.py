"""Persona demand simulation — "who buys, and at what price?".

A companion to the win-probability model. Where the ML layer asks *"will we win
the Buy Box?"*, this layer asks the softer, more human question: *"if we set this
price, which kinds of buyer actually pull the trigger?"*

We model a small panel of **buyer personas** (bargain hunter, brand loyalist,
quality seeker, convenience buyer, sceptical researcher). For one SKU we sweep a
band of candidate prices and, for every (persona x price) pair, estimate a
**purchase probability** in 0..1. That grid is exactly what the UI renders as a
GitHub-contribution-style heatmap.

Two engines, same contract:

1. **LLM mode (Azure AI Foundry)** — each persona is given its own profile plus
   the SKU facts and the price ladder, and returns a JSON array of buy
   probabilities. Brings genuine qualitative reasoning to the curve.
2. **Deterministic fallback** — a logistic willingness-to-pay model anchored on
   the competitor price and each persona's traits. Fully functional with no keys,
   and stable across reloads, mirroring the agent layer's graceful degradation.

Margin floor stays sacred: the recommended "sweet spot" price is only ever chosen
from candidates at or above the floor.
"""

from __future__ import annotations

import json
import math
import re

from . import config

# --- the persona panel -------------------------------------------------------
# Every persona is anchored on the COMPETITOR price — the market reference shoppers
# compare against. At or below it we hold the Buy Box and most personas buy; once
# we price above it we lose the Buy Box and demand falls off a cliff (steeply for
# price-sensitive personas, gently for brand/quality buyers).
#   buyAtCompetitor : purchase probability exactly at the competitor's price
#   sensitivity     : how fast demand drops per +1% above the competitor
#                     (higher = sharper Buy-Box cliff / more price-elastic)
#   buyBoxPull      : extra pull toward us when we already hold the Buy Box (0..1)
PERSONAS: list[dict] = [
    {
        "id": "bargain_hunter",
        "name": "Bargain Hunter",
        "emoji": "🪙",
        "blurb": "Lives for a deal. Compares every paisa and walks the moment we cost more than the competitor.",
        "buyAtCompetitor": 0.55,
        "sensitivity": 30.0,
        "buyBoxPull": 0.05,
    },
    {
        "id": "brand_loyalist",
        "name": "Brand Loyalist",
        "emoji": "💛",
        "blurb": "Trusts the brand and will pay a small premium for it. Price matters, but reputation matters more.",
        "buyAtCompetitor": 0.80,
        "sensitivity": 14.0,
        "buyBoxPull": 0.15,
    },
    {
        "id": "quality_seeker",
        "name": "Quality Seeker",
        "emoji": "✨",
        "blurb": "Reads a fair price as a signal of quality. Will stretch a little above the competitor, but not far.",
        "buyAtCompetitor": 0.82,
        "sensitivity": 13.0,
        "buyBoxPull": 0.10,
    },
    {
        "id": "convenience_buyer",
        "name": "Convenience Buyer",
        "emoji": "⚡",
        "blurb": "Buys whatever sits in the Buy Box. Won't compare unless our price is obviously silly.",
        "buyAtCompetitor": 0.78,
        "sensitivity": 22.0,
        "buyBoxPull": 0.45,
    },
    {
        "id": "sceptical_researcher",
        "name": "Sceptical Researcher",
        "emoji": "🔎",
        "blurb": "Opens five tabs before buying. Highly aware of the competitor's exact price and won't overpay.",
        "buyAtCompetitor": 0.60,
        "sensitivity": 28.0,
        "buyBoxPull": 0.05,
    },
]

NUM_POINTS = 9  # columns in the heatmap — a coarse, readable price ladder


# --- price ladder ------------------------------------------------------------

def price_ladder(sku: dict, num_points: int = NUM_POINTS) -> list[int]:
    """A band of candidate prices to test, low -> high.

    Spans a little below the margin floor (to expose the forbidden zone in the
    UI) up to ~15% above whichever is higher of our price / the competitor. The
    competitor's price is snapped onto the grid so it appears as a real column —
    the line where the Buy Box (and most demand) is won or lost.
    """
    floor = sku["marginFloor"]
    comp = sku["competitorPrice"]
    lo = floor * 0.9
    hi = max(sku["ourPrice"], comp) * 1.15
    if hi <= lo:
        hi = lo * 1.3
    step = (hi - lo) / (num_points - 1)
    ladder = [int(round(lo + step * i)) for i in range(num_points)]
    # Snap the column nearest the competitor price onto the competitor exactly.
    nearest = min(range(num_points), key=lambda i: abs(ladder[i] - comp))
    ladder[nearest] = int(comp)
    return sorted(set(ladder))


# --- deterministic engine ----------------------------------------------------

def _logistic(z: float) -> float:
    # Guard against overflow for extreme z.
    if z < -60:
        return 0.0
    if z > 60:
        return 1.0
    return 1.0 / (1.0 + math.exp(-z))


def _persona_curve_deterministic(persona: dict, sku: dict, ladder: list[int]) -> list[float]:
    """Buy probability for one persona across the whole price ladder.

    Anchored on the competitor price: the probability equals ``buyAtCompetitor``
    exactly at the competitor's price, rises below it, and falls off a Buy-Box
    cliff above it (steepness set by ``sensitivity``).
    """
    comp = sku["competitorPrice"]
    base = min(0.999, max(0.001, persona["buyAtCompetitor"]))
    intercept = math.log(base / (1.0 - base))  # logit at the competitor price
    sens = persona["sensitivity"]
    pull = persona["buyBoxPull"] if sku["buyBox"] == "Won" else 0.0

    curve = []
    for price in ladder:
        # How far above (+) or below (-) the competitor we sit, as a fraction.
        premium = (price - comp) / comp
        z = intercept - sens * premium
        prob = _logistic(z)
        # Convenience buyers cling to the Buy Box; nudge the whole curve up.
        prob = prob + (1.0 - prob) * pull
        curve.append(round(prob, 3))
    return curve


# --- LLM engine --------------------------------------------------------------

def _persona_system_prompt(persona: dict) -> str:
    return (
        f"You role-play a single online shopper persona: {persona['name']}. "
        f"Profile: {persona['blurb']} "
        "The competitor's price is the reference everyone compares against. "
        "Marketplace rule: at or below the competitor's price we hold the Buy Box and this "
        "persona is likely to buy; once our price rises above the competitor's we lose the "
        "Buy Box and this persona's purchase probability drops sharply — steeply for "
        "price-sensitive personas, more gently for brand/quality buyers. "
        "Given a ladder of candidate prices, estimate the probability (0.0 to 1.0) that THIS "
        "persona buys at each. Respond with ONLY a JSON array of numbers, one per price, same "
        "length and order as the prices given. No prose, no keys, no code fences."
    )


def _persona_user_prompt(persona: dict, sku: dict, ladder: list[int]) -> str:
    return (
        f"Product: {sku['brand']} ({sku['id']}). "
        f"Competitor price (the market reference): Rs.{sku['competitorPrice']}. "
        f"We currently {sku['buyBox']} the Buy Box. "
        f"Candidate prices (Rs.): {ladder}. "
        f"For {persona['name']}, give the buy-probability at each price — high at or below "
        f"Rs.{sku['competitorPrice']}, falling quickly above it. Return the JSON array."
    )


def _parse_probabilities(text: str, expected_len: int) -> list[float] | None:
    """Pull a clean probability array out of the model's reply, or None."""
    match = re.search(r"\[[^\]]*\]", text, re.DOTALL)
    if not match:
        return None
    try:
        raw = json.loads(match.group(0))
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(raw, list) or len(raw) != expected_len:
        return None
    out: list[float] = []
    for v in raw:
        if not isinstance(v, (int, float)):
            return None
        out.append(round(min(1.0, max(0.0, float(v))), 3))
    return out


def _foundry_curve(persona: dict, sku: dict, ladder: list[int]) -> list[float] | None:
    try:
        from openai import OpenAI

        client = OpenAI(base_url=config.FOUNDRY_ENDPOINT, api_key=config.FOUNDRY_API_KEY)
        resp = client.chat.completions.create(
            model=config.FOUNDRY_MODEL,
            messages=[
                {"role": "system", "content": _persona_system_prompt(persona)},
                {"role": "user", "content": _persona_user_prompt(persona, sku, ladder)},
            ],
            temperature=0.3,
            max_tokens=200,
        )
        return _parse_probabilities(resp.choices[0].message.content or "", len(ladder))
    except Exception:
        return None


# --- orchestration -----------------------------------------------------------

def simulate(sku: dict, num_points: int = NUM_POINTS) -> dict:
    """Run the persona panel over one SKU and assemble the heatmap payload.

    Returns price ladder, per-persona buy-probability rows, per-price aggregate
    demand/revenue/profit indices, and a floor-safe recommended "sweet spot".
    """
    ladder = price_ladder(sku, num_points)
    floor = sku["marginFloor"]

    rows: list[dict] = []
    used_llm = False
    for persona in PERSONAS:
        curve: list[float] | None = None
        source = "model"
        if config.USE_FOUNDRY:
            curve = _foundry_curve(persona, sku, ladder)
            if curve is not None:
                source = "foundry"
                used_llm = True
        if curve is None:
            curve = _persona_curve_deterministic(persona, sku, ladder)
        rows.append(
            {
                "personaId": persona["id"],
                "name": persona["name"],
                "emoji": persona["emoji"],
                "blurb": persona["blurb"],
                "source": source,
                "cells": [
                    {"price": p, "buyProbability": prob, "belowFloor": p < floor}
                    for p, prob in zip(ladder, curve)
                ],
            }
        )

    # Per-price aggregates. Demand = mean buy probability across personas (the
    # share of the panel that purchases). Revenue/profit are simple indices.
    columns: list[dict] = []
    for i, price in enumerate(ladder):
        probs = [r["cells"][i]["buyProbability"] for r in rows]
        demand = sum(probs) / len(probs)
        columns.append(
            {
                "price": price,
                "belowFloor": price < floor,
                "expectedDemand": round(demand, 3),
                "revenueIndex": round(price * demand, 1),
                "profitIndex": round((price - floor) * demand, 1) if price >= floor else 0.0,
            }
        )

    # Sweet spot: the at-or-above-floor price with the highest profit index.
    sellable = [c for c in columns if not c["belowFloor"]]
    best = max(sellable, key=lambda c: c["profitIndex"]) if sellable else None

    return {
        "id": sku["id"],
        "brand": sku["brand"],
        "ourPrice": sku["ourPrice"],
        "competitorPrice": sku["competitorPrice"],
        "marginFloor": floor,
        "buyBox": sku["buyBox"],
        "ladder": ladder,
        "personas": rows,
        "columns": columns,
        "bestPrice": best["price"] if best else None,
        "source": "foundry" if used_llm else "model",
    }
