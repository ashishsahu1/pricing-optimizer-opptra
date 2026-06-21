import { Component, Input, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { InrPipe } from '../../pipes/inr.pipe';
import { PricingApiService } from '../../services/pricing-api.service';
import { PriceColumn, SimulationResult, SkuSignal } from '../../models/sku.model';

/**
 * The persona demand heatmap for ONE SKU, reusable inside any host (the
 * Optimizer drawer). Pass a SKU and it runs the simulation on mount; the
 * "Re-run" button re-polls the persona panel.
 *
 * Rows = personas, columns = a coarse price ladder, colour = buy probability
 * (GitHub-contribution style). The aggregate bars find the floor-safe profit
 * sweet spot — which lines up with the optimizer's suggested price.
 */
@Component({
  selector: 'app-persona-sim',
  standalone: true,
  imports: [CommonModule, InrPipe],
  templateUrl: './persona-sim.html',
  styleUrl: './persona-sim.scss',
})
export class PersonaSim implements OnInit {
  private readonly api = inject(PricingApiService);

  @Input({ required: true }) sku!: SkuSignal;

  readonly result = signal<SimulationResult | null>(null);
  readonly running = signal(false);
  readonly hovered = signal<{ persona: string; emoji: string; price: number; prob: number } | null>(
    null,
  );

  /** Largest profit index in the run, so the demand bars can be scaled. */
  readonly maxProfit = computed(() => {
    const r = this.result();
    if (!r) return 1;
    return Math.max(1, ...r.columns.map((c) => c.profitIndex));
  });

  ngOnInit(): void {
    void this.run();
  }

  async run(): Promise<void> {
    this.running.set(true);
    this.hovered.set(null);
    const res = await this.api.simulate(this.sku.id);
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
