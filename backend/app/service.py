"""Pipeline orchestration + in-memory state.

Ties the five stages together and holds the mutable SKU state so the ``apply``
endpoint can flip a SKU to ``Repriced`` (mirrors the notebook's in-place df).
This is a POC — state lives in memory and resets on restart.
"""

from __future__ import annotations

import copy

from . import agent
from .data import SKU_SNAPSHOT
from .ml import WinProbabilityModel
from .triage import CATEGORY_ORDER, triage


class PricingService:
    """Single source of truth for the running pipeline."""

    def __init__(self) -> None:
        # The model is fit once on the original snapshot (the historical labels).
        self._model = WinProbabilityModel(SKU_SNAPSHOT)
        self.reset()

    def reset(self) -> None:
        """Restore the snapshot to its initial state."""
        self._skus = [dict(s, status="Pending") for s in copy.deepcopy(SKU_SNAPSHOT)]

    # --- derived signals -----------------------------------------------------

    def _derive(self, sku: dict) -> dict:
        """Enrich one raw SKU with the full triage signal."""
        category, suggested = triage(sku, self._model)
        return {
            **sku,
            "priceGap": sku["competitorPrice"] - sku["ourPrice"],
            "marginHeadroom": sku["ourPrice"] - sku["marginFloor"],
            "competitorBelowFloor": sku["competitorPrice"] < sku["marginFloor"],
            "winProbNow": round(
                self._model.win_probability(sku["ourPrice"], sku["competitorPrice"]), 2
            ),
            "category": category,
            "suggestedPrice": suggested,
        }

    def signals(self) -> list[dict]:
        """Every SKU with its triage signal, urgency-sorted (act-now first)."""
        derived = [self._derive(s) for s in self._skus]
        return sorted(
            derived,
            key=lambda s: (CATEGORY_ORDER[s["category"]], -abs(s["priceGap"])),
        )

    def actionable(self) -> list[dict]:
        return [s for s in self.signals() if s["category"] in ("LOST_RECOVERABLE", "WON_HEADROOM")]

    def get_signal(self, sku_id: str) -> dict | None:
        return next((s for s in self.signals() if s["id"] == sku_id), None)

    # --- agent ---------------------------------------------------------------

    def recommendation(self, sku_id: str) -> dict | None:
        """Floor-safe recommendation for one SKU. ``None`` if not actionable."""
        signal = self.get_signal(sku_id)
        if signal is None or signal["suggestedPrice"] is None:
            return None
        text, source = agent.recommend(signal)
        return {
            "id": signal["id"],
            "category": signal["category"],
            "suggestedPrice": signal["suggestedPrice"],
            "text": text,
            "source": source,
        }

    def recommendations(self) -> list[dict]:
        """Recommendations for all actionable SKUs (Lost first)."""
        return [self.recommendation(s["id"]) for s in self.actionable()]

    # --- apply ---------------------------------------------------------------

    def apply_reprice(self, sku_id: str) -> dict:
        """Flip a SKU to ``Repriced`` at its suggested price.

        The margin floor is re-checked one final time before any write — the
        fourth and last guardrail in the pipeline.
        """
        signal = self.get_signal(sku_id)
        if signal is None:
            return {"id": sku_id, "applied": False, "message": f"{sku_id} not found.", "sku": None}

        new_price = signal["suggestedPrice"]
        if new_price is None:
            return {
                "id": sku_id,
                "applied": False,
                "message": f"{sku_id}: no action available (below floor).",
                "sku": signal,
            }
        if new_price < signal["marginFloor"]:
            return {
                "id": sku_id,
                "applied": False,
                "message": f"{sku_id}: blocked — Rs.{new_price} is below floor Rs.{signal['marginFloor']}.",
                "sku": signal,
            }

        # Mutate the stored snapshot, then re-derive the signal for the response.
        raw = next(s for s in self._skus if s["id"] == sku_id)
        raw["ourPrice"] = int(new_price)
        raw["status"] = "Repriced"
        return {
            "id": sku_id,
            "applied": True,
            "message": f"{sku_id} repriced to Rs.{int(new_price)} — live on marketplace (simulated).",
            "sku": self.get_signal(sku_id),
        }


# Module-level singleton shared by the API.
service = PricingService()
