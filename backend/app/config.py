"""Stage 0 — configuration.

Loads the Azure AI Foundry credentials from (in priority order):
  1. real environment variables
  2. a local ``.env`` file next to the backend, or in ``scripts/.env``

If no credentials are found the agent layer falls back to a deterministic
template, so the API still runs end-to-end without keys.
"""

from __future__ import annotations

import os
from pathlib import Path


def _load_dotenv() -> None:
    """Populate os.environ from the first .env file we find (without overriding
    values that are already set in the real environment)."""
    candidates = (
        Path(__file__).resolve().parent.parent / ".env",   # backend/.env
        Path.cwd() / ".env",
        Path.cwd() / "scripts" / ".env",
    )
    for candidate in candidates:
        if not candidate.exists():
            continue
        for line in candidate.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
        break


_load_dotenv()

FOUNDRY_ENDPOINT = os.environ.get("FOUNDRY_ENDPOINT")
FOUNDRY_API_KEY = os.environ.get("FOUNDRY_API_KEY")
FOUNDRY_MODEL = os.environ.get("FOUNDRY_MODEL") or "gpt-4.1"

# True only when both endpoint and key are present (and not the placeholder).
USE_FOUNDRY = bool(
    FOUNDRY_ENDPOINT
    and FOUNDRY_API_KEY
    and "<your" not in (FOUNDRY_ENDPOINT + FOUNDRY_API_KEY)
)
