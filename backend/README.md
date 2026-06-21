# Opptra Pricing Optimizer — Backend

A thin FastAPI service that turns the 8-SKU competitor-price snapshot into
**floor-safe repricing decisions**. It is the productised form of
[`scripts/pricing_optimizer_poc.ipynb`](../scripts/pricing_optimizer_poc.ipynb) —
same snapshot, same 4 triage categories, same margin-floor guardrail.

## The pipeline

```
Ingest → ML (win-probability) → Triage (4 buckets + target price) → Agent (write reco) → Apply
```

| Stage | Module | Role |
|---|---|---|
| 1. Ingest | `app/data.py` | The 8-SKU snapshot |
| 2. ML | `app/ml.py` | Logistic-regression Buy Box win-probability + price search |
| 3. Triage | `app/triage.py` | 4-way classification + target price |
| 4. Agent | `app/agent.py` | Azure AI Foundry LLM, floor-constrained + retry guardrail |
| 5. Apply | `app/service.py` | Flip status → `Repriced` |

The **margin floor is absolute**: triage, the price search, the agent guardrail,
and `apply_reprice` each re-check it. `BELOW_FLOOR` SKUs (e.g. SKU-007, where the
competitor is below our floor) are never priced and never sent to the LLM.

## Run it

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Optional: add Azure AI Foundry creds for real LLM recommendations.
# Without them the agent falls back to a deterministic template.
cp .env.example .env   # then edit

uvicorn app.main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | status + whether Foundry is configured |
| GET | `/api/skus` | all SKUs with triage signal (urgency-sorted) |
| GET | `/api/skus/actionable` | only LOST_RECOVERABLE / WON_HEADROOM |
| GET | `/api/skus/{id}` | one SKU signal |
| GET | `/api/recommendations` | floor-safe recos for all actionable SKUs |
| GET | `/api/skus/{id}/recommendation` | reco for one SKU (409 if below floor) |
| POST | `/api/skus/{id}/apply` | apply suggested price → `Repriced` |
| POST | `/api/reset` | restore the snapshot |

State is in-memory and resets on restart (POC).
