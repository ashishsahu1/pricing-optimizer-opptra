import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { InrPipe } from '../../pipes/inr.pipe';
import { PricingApiService } from '../../services/pricing-api.service';
import { PriceColumn, SimulationResult, SkuSignal } from '../../models/sku.model';

/**
 * Persona demand simulation.
 *
 * Pick one SKU, run a panel of LLM-driven buyer personas across a ladder of
 * candidate prices, and read the result as a GitHub-contribution-style heatmap:
 * rows = personas, columns = prices, colour = how likely that persona is to buy.
 * The aggregate row underneath finds the floor-safe profit "sweet spot".
 */
@Component({
  selector: 'app-simulation',
  standalone: true,
  imports: [CommonModule, InrPipe],
  templateUrl: './simulation.html',
  styleUrl: './simulation.scss',
})
export class Simulation implements OnInit {
  readonly api = inject(PricingApiService);

  /** Which SKU is selected in the picker. */
  readonly selectedId = signal<string | null>(null);

  /** The latest simulation result (null until the first run). */
  readonly result = signal<SimulationResult | null>(null);

  /** True while a simulation is in flight. */
  readonly running = signal(false);

  /** Cell the user is hovering, for the read-out strip. */
  readonly hovered = signal<{ persona: string; emoji: string; price: number; prob: number } | null>(
    null,
  );

  readonly selectedSku = computed<SkuSignal | null>(
    () => this.api.skus().find((s) => s.id === this.selectedId()) ?? null,
  );

  /** Largest profit index in the run, so the demand bars can be scaled. */
  readonly maxProfit = computed(() => {
    const r = this.result();
    if (!r) return 1;
    return Math.max(1, ...r.columns.map((c) => c.profitIndex));
  });

  ngOnInit(): void {
    void this.api.load().then(() => {
      const first = this.api.skus()[0]?.id ?? null;
      this.selectedId.set(first);
    });
  }

  select(id: string): void {
    this.selectedId.set(id);
    this.result.set(null);
    this.hovered.set(null);
  }

  async run(): Promise<void> {
    const id = this.selectedId();
    if (!id) return;
    this.running.set(true);
    this.hovered.set(null);
    const res = await this.api.simulate(id);
    if (res) this.result.set(res);
    this.running.set(false);
  }

  /** Map a 0–1 buy probability to one of five GitHub-style intensity levels. */
  level(prob: number): number {
    if (prob <= 0.05) return 0;
    if (prob < 0.3) return 1;
    if (prob < 0.55) return 2;
    if (prob < 0.8) return 3;
    return 4;
  }

  percent(prob: number): number {
    return Math.round(prob * 100);
  }

  hover(personaName: string, emoji: string, price: number, prob: number): void {
    this.hovered.set({ persona: personaName, emoji, price, prob });
  }

  clearHover(): void {
    this.hovered.set(null);
  }

  /** Is this column the floor-safe profit sweet spot? */
  isBest(col: PriceColumn): boolean {
    return this.result()?.bestPrice === col.price;
  }

  /** Demand-bar height as a percentage of the column's profit vs. the best. */
  profitHeight(col: PriceColumn): number {
    return Math.round((col.profitIndex / this.maxProfit()) * 100);
  }
}
