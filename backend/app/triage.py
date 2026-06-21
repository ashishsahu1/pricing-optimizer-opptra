"""Stage 3 — Triage: surface the signal, not the noise.

The same four categories as the production Angular service. The ML model decides
whether a Lost item is *actually* recoverable above the margin floor.
"""

from __future__ import annotations

from .ml import WinProbabilityModel

# Minimum gap below the competitor before a Won item is worth raising.
HEADROOM_THRESHOLD = 50

# Sort order for urgency: act-now categories first.
CATEGORY_ORDER = {
    "LOST_RECOVERABLE": 0,
    "WON_HEADROOM": 1,
    "BELOW_FLOOR": 2,
    "HOLD": 3,
}


def triage(sku: dict, model: WinProbabilityModel) -> tuple[str, int | None]:
    """Return ``(category, suggestedPrice)`` for one SKU.

    Hard rule: ``suggestedPrice`` is never below the margin floor, and
    BELOW_FLOOR (competitor < floor) always yields ``None`` — never priced,
    never sent to the agent.
    """
    comp, ours, floor, buy_box = (
        sku["competitorPrice"],
        sku["ourPrice"],
        sku["marginFloor"],
        sku["buyBox"],
    )

    if comp < floor:
        return "BELOW_FLOOR", None

    if buy_box == "Lost":
        target = model.best_recover_price(comp, floor)
        return ("LOST_RECOVERABLE", target) if target else ("BELOW_FLOOR", None)

    # Won the Buy Box: is there meaningful room to raise price?
    if comp - ours >= HEADROOM_THRESHOLD:
        return "WON_HEADROOM", model.safe_raise_price(comp, ours, floor)

    return "HOLD", None
