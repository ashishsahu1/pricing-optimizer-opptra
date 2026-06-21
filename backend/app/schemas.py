"""API schemas — the contract the Angular frontend consumes.

Field names mirror ``frontend/src/app/models/sku.model.ts`` (camelCase) so the
UI can bind to the JSON directly.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel

BuyBoxStatus = Literal["Won", "Lost"]
TriageCategory = Literal["LOST_RECOVERABLE", "WON_HEADROOM", "BELOW_FLOOR", "HOLD"]


class SkuSignal(BaseModel):
    """A SKU enriched with the triage signal — mirrors the TS ``SkuSignal``."""

    id: str
    brand: str
    ourPrice: int
    competitorPrice: int
    buyBox: BuyBoxStatus
    marginFloor: int
    lastChanged: str

    priceGap: int               # competitorPrice - ourPrice (negative = undercut)
    marginHeadroom: int         # ourPrice - marginFloor
    competitorBelowFloor: bool
    winProbNow: float           # ML win-probability at the current price
    category: TriageCategory
    suggestedPrice: Optional[int]   # always >= marginFloor, or None
    status: str                 # "Pending" | "Repriced"


class Recommendation(BaseModel):
    """A floor-safe, manager-ready recommendation for one SKU."""

    id: str
    category: TriageCategory
    suggestedPrice: Optional[int]
    text: str
    source: Literal["foundry", "template"]


class ApplyResult(BaseModel):
    id: str
    applied: bool
    message: str
    sku: Optional[SkuSignal] = None
