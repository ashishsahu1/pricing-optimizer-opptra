"""Stage 2 — ML: Buy Box win-probability model.

A tiny logistic regression learns how *price position* (how far we sit below
the competitor, as a percentage) maps to winning the Buy Box. That gives us a
continuous win-probability curve, so we can ask price-search questions a hard
rule cannot — "what's the highest price that still wins?".
"""

from __future__ import annotations

import numpy as np
from sklearn.linear_model import LogisticRegression

WIN_TARGET = 0.55   # probability at/above which we consider a price "likely to win"


def price_position(our_price: float, competitor_price: float) -> float:
    """Relative undercut as a percentage: >0 means we are cheaper than the competitor.

    Expressed in percent (``* 100``) so the feature has enough magnitude for the
    model to learn a sharp win/lose boundary — raw fractions are ~0.1 and get
    washed out by regularisation.
    """
    return (competitor_price - our_price) / competitor_price * 100.0


class WinProbabilityModel:
    """Wraps a fitted logistic regression over the 8-SKU snapshot."""

    def __init__(self, skus: list[dict]) -> None:
        features = np.array(
            [[price_position(s["ourPrice"], s["competitorPrice"])] for s in skus]
        )
        labels = np.array([1 if s["buyBox"] == "Won" else 0 for s in skus])
        # Light regularisation so the curve is smooth, not a step function.
        self._model = LogisticRegression(C=2.0).fit(features, labels)

    def win_probability(self, our_price: float, competitor_price: float) -> float:
        feat = np.array([[price_position(our_price, competitor_price)]])
        return float(self._model.predict_proba(feat)[0, 1])

    def best_recover_price(
        self, competitor_price: int, margin_floor: int, win_target: float = WIN_TARGET
    ) -> int | None:
        """Highest price >= floor the model expects to win the Buy Box.

        Returns the *highest* winner so we sacrifice the least margin. ``None``
        when no price at/above floor clears the win target (a true BELOW_FLOOR case).
        """
        candidates = range(int(np.ceil(margin_floor)), int(competitor_price) + 1)
        winners = [p for p in candidates if self.win_probability(p, competitor_price) >= win_target]
        return max(winners) if winners else None

    def safe_raise_price(
        self,
        competitor_price: int,
        current_price: int,
        margin_floor: int,
        win_target: float = WIN_TARGET,
    ) -> int | None:
        """Highest price we can raise to while staying above floor and still likely winning."""
        candidates = range(int(current_price), int(competitor_price) + 1)
        winners = [
            p
            for p in candidates
            if p >= margin_floor and self.win_probability(p, competitor_price) >= win_target
        ]
        return max(winners) if winners else None
