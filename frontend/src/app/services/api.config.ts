/**
 * Where the FastAPI backend lives.
 *
 * Resolved at runtime from `public/config.js` (`window.OPPTRA_API_BASE`) so the
 * same build can be pointed at any backend without recompiling. Falls back to
 * the local dev server when the global isn't set.
 *
 * Backend run command: `uvicorn app.main:app --reload --port 8000`
 */
declare global {
  interface Window {
    OPPTRA_API_BASE?: string;
  }
}

export const API_BASE = window.OPPTRA_API_BASE?.trim() || 'http://localhost:8000/api';
