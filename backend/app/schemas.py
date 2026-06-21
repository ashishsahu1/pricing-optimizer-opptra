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


# --- persona demand simulation ----------------------------------------------

PersonaSource = Literal["foundry", "model"]


class Persona(BaseModel):
    """A buyer persona on the simulation panel."""

    id: str
    name: str
    emoji: str
    blurb: str


class SimulationCell(BaseModel):
    """One (persona x price) cell of the heatmap."""

    price: int
    buyProbability: float   # 0..1 chance this persona buys at this price
    belowFloor: bool


class PersonaRow(BaseModel):
    """One persona's buy-probability curve across the price ladder."""

    personaId: str
    name: str
    emoji: str
    blurb: str
    source: PersonaSource
    cells: list[SimulationCell]


class PriceColumn(BaseModel):
    """Aggregate signal for one price across the whole panel."""

    price: int
    belowFloor: bool
    expectedDemand: float   # mean buy-probability (share of the panel)
    revenueIndex: float     # price x demand
    profitIndex: float      # (price - floor) x demand, 0 below floor


class SimulationResult(BaseModel):
    """Full heatmap payload for one SKU."""

    id: str
    brand: str
    ourPrice: int
    competitorPrice: int
    marginFloor: int
    buyBox: BuyBoxStatus
    ladder: list[int]
    personas: list[PersonaRow]
    columns: list[PriceColumn]
    bestPrice: Optional[int]   # floor-safe, profit-maximising price
    source: PersonaSource
