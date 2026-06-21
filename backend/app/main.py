"""FastAPI app — a thin REST layer over the pricing pipeline.

Run locally:
    uvicorn app.main:app --reload --port 8000

Interactive docs at http://localhost:8000/docs
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .schemas import ApplyResult, Recommendation, SkuSignal
from .service import service

app = FastAPI(
    title="Opptra Pricing Optimizer API",
    description="Turns the 8-SKU competitor-price snapshot into floor-safe repricing decisions.",
    version="0.1.0",
)

# POC CORS: allow the Angular dev server (and others) to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "foundryConfigured": config.USE_FOUNDRY, "model": config.FOUNDRY_MODEL}


@app.get("/api/skus", response_model=list[SkuSignal])
def list_skus() -> list[dict]:
    """Every SKU with its triage signal, urgency-sorted (act-now first)."""
    return service.signals()


@app.get("/api/skus/actionable", response_model=list[SkuSignal])
def list_actionable() -> list[dict]:
    """SKUs that need attention now (LOST_RECOVERABLE / WON_HEADROOM)."""
    return service.actionable()


@app.get("/api/skus/{sku_id}", response_model=SkuSignal)
def get_sku(sku_id: str) -> dict:
    signal = service.get_signal(sku_id)
    if signal is None:
        raise HTTPException(status_code=404, detail=f"{sku_id} not found")
    return signal


@app.get("/api/recommendations", response_model=list[Recommendation])
def list_recommendations() -> list[dict]:
    """Floor-safe recommendations for every actionable SKU."""
    return service.recommendations()


@app.get("/api/skus/{sku_id}/recommendation", response_model=Recommendation)
def get_recommendation(sku_id: str) -> dict:
    if service.get_signal(sku_id) is None:
        raise HTTPException(status_code=404, detail=f"{sku_id} not found")
    reco = service.recommendation(sku_id)
    if reco is None:
        raise HTTPException(
            status_code=409,
            detail=f"{sku_id} is not actionable (below floor — no profitable price).",
        )
    return reco


@app.post("/api/skus/{sku_id}/apply", response_model=ApplyResult)
def apply_reprice(sku_id: str) -> dict:
    """Apply the suggested price and flip the SKU to ``Repriced``."""
    if service.get_signal(sku_id) is None:
        raise HTTPException(status_code=404, detail=f"{sku_id} not found")
    return service.apply_reprice(sku_id)


@app.post("/api/reset")
def reset() -> dict:
    """Restore the snapshot to its initial state (POC convenience)."""
    service.reset()
    return {"status": "reset"}
