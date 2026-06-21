import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_BASE } from './api.config';
import { ApplyResult, Recommendation, SimulationResult, SkuSignal, TriageCategory } from '../models/sku.model';

/**
 * Talks to the FastAPI backend (the productised notebook pipeline) and exposes
 * the result as Angular signals so the story page can react to it.
 *
 * Every number the UI shows comes from the backend — the same snapshot, ML
 * win-probability, 4-way triage, agent recommendation and floor guardrail that
 * the notebook proves.
 */
@Injectable({ providedIn: 'root' })
export class PricingApiService {
  private readonly http = inject(HttpClient);

  // --- raw state -----------------------------------------------------------
  private readonly _skus = signal<SkuSignal[]>([]);
  private readonly _recommendations = signal<Recommendation[]>([]);
  private readonly _foundryConfigured = signal(false);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  // --- public, read-only views ---------------------------------------------
  readonly skus = this._skus.asReadonly();
  readonly recommendations = this._recommendations.asReadonly();
  readonly foundryConfigured = this._foundryConfigured.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** SKUs grouped by triage category, for the "4 buckets" stage. */
  readonly byCategory = computed(() => {
    const groups: Record<TriageCategory, SkuSignal[]> = {
      LOST_RECOVERABLE: [],
      WON_HEADROOM: [],
      BELOW_FLOOR: [],
      HOLD: [],
    };
    for (const s of this._skus()) groups[s.category].push(s);
    return groups;
  });

  readonly actionable = computed(() =>
    this._skus().filter(
      (s) => s.category === 'LOST_RECOVERABLE' || s.category === 'WON_HEADROOM',
    ),
  );

  readonly blocked = computed(() => this._skus().filter((s) => s.category === 'BELOW_FLOOR'));

  /** How many SKUs have already been repriced (drives the final tally). */
  readonly repricedCount = computed(
    () => this._skus().filter((s) => s.status === 'Repriced').length,
  );

  /** Look up the recommendation sentence for one SKU. */
  recommendationFor(id: string): Recommendation | undefined {
    return this._recommendations().find((r) => r.id === id);
  }

  // --- actions -------------------------------------------------------------

  /** Load everything the story needs in one shot. */
  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const [health, skus, recos] = await Promise.all([
        firstValueFrom(this.http.get<{ foundryConfigured: boolean }>(`${API_BASE}/health`)),
        firstValueFrom(this.http.get<SkuSignal[]>(`${API_BASE}/skus`)),
        firstValueFrom(this.http.get<Recommendation[]>(`${API_BASE}/recommendations`)),
      ]);
      this._foundryConfigured.set(health.foundryConfigured);
      this._skus.set(skus);
      this._recommendations.set(recos);
    } catch {
      this._error.set(
        'Could not reach the backend at ' +
          API_BASE +
          '. Start it with `uvicorn app.main:app --reload --port 8000`.',
      );
    } finally {
      this._loading.set(false);
    }
  }

  /** Apply one SKU's suggested price (the one-click action). */
  async apply(id: string): Promise<ApplyResult | null> {
    try {
      const result = await firstValueFrom(
        this.http.post<ApplyResult>(`${API_BASE}/skus/${id}/apply`, {}),
      );
      if (result.applied && result.sku) {
        this._skus.update((list) => list.map((s) => (s.id === id ? result.sku! : s)));
      }
      return result;
    } catch {
      this._error.set(`Could not apply ${id}.`);
      return null;
    }
  }

  /** Apply every actionable SKU in sequence (the "fix all" button). */
  async applyAll(): Promise<void> {
    for (const sku of this.actionable()) {
      if (sku.status !== 'Repriced') await this.apply(sku.id);
    }
  }

  /** Reset the snapshot to its original state, then reload. */
  async reset(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${API_BASE}/reset`, {}));
    } catch {
      /* fall through to reload, which surfaces any error */
    }
    await this.load();
  }

  /** Run the persona demand simulation for one SKU (the heatmap payload). */
  async simulate(id: string): Promise<SimulationResult | null> {
    try {
      return await firstValueFrom(
        this.http.post<SimulationResult>(`${API_BASE}/skus/${id}/simulate`, {}),
      );
    } catch {
      this._error.set(
        `Could not run the persona simulation for ${id}. Is the backend running at ${API_BASE}?`,
      );
      return null;
    }
  }
}
