import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { InrPipe } from '../../pipes/inr.pipe';
import { PricingApiService } from '../../services/pricing-api.service';
import { SkuSignal } from '../../models/sku.model';

/** Processing state for one SKU as it moves through the pipeline. */
interface Run {
  status: 'pending' | 'processing' | 'done';
  /** Index of the highest pipeline stage revealed so far (-1 = not started). */
  stage: number;
}

/** The five visible pipeline stages, in order. */
const STAGES = ['Ingest', 'Win probability', 'Triage', 'Recommendation', 'Decision'] as const;

/** Short label + colour tone for each triage category. */
const CATEGORY_LABEL: Record<string, { label: string; tone: 'good' | 'bad' | 'idle' }> = {
  LOST_RECOVERABLE: { label: 'Win it back', tone: 'good' },
  WON_HEADROOM: { label: 'Earn more', tone: 'good' },
  BELOW_FLOOR: { label: 'Leave it (below floor)', tone: 'bad' },
  HOLD: { label: 'All good', tone: 'idle' },
};

@Component({
  selector: 'app-optimizer',
  standalone: true,
  imports: [CommonModule, InrPipe],
  templateUrl: './optimizer.html',
  styleUrl: './optimizer.scss',
})
export class Optimizer implements OnInit {
  readonly api = inject(PricingApiService);

  readonly stages = STAGES;

  /** Per-SKU run state, keyed by SKU id. */
  private readonly runs = signal<Record<string, Run>>({});

  /** Which SKU is shown in the detail panel. */
  readonly activeId = signal<string | null>(null);

  /** True while "Process all" is walking the queue. */
  readonly batchRunning = signal(false);

  readonly active = computed<SkuSignal | null>(
    () => this.api.skus().find((s) => s.id === this.activeId()) ?? null,
  );

  readonly processedCount = computed(
    () => Object.values(this.runs()).filter((r) => r.status === 'done').length,
  );

  ngOnInit(): void {
    void this.api.load().then(() => this.initRuns());
  }

  /** Reset every SKU back to "pending" and focus the first one. */
  private initRuns(): void {
    const fresh: Record<string, Run> = {};
    for (const s of this.api.skus()) fresh[s.id] = { status: 'pending', stage: -1 };
    this.runs.set(fresh);
    this.activeId.set(this.api.skus()[0]?.id ?? null);
  }

  run(id: string): Run {
    return this.runs()[id] ?? { status: 'pending', stage: -1 };
  }

  categoryLabel(category: string): string {
    return CATEGORY_LABEL[category]?.label ?? category;
  }

  categoryTone(category: string): 'good' | 'bad' | 'idle' {
    return CATEGORY_LABEL[category]?.tone ?? 'idle';
  }

  winPercent(sku: SkuSignal): number {
    return Math.round(sku.winProbNow * 100);
  }

  /** Has the active SKU revealed up to (and including) this stage? */
  reached(stageIndex: number): boolean {
    const id = this.activeId();
    return !!id && this.run(id).stage >= stageIndex;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private patch(id: string, change: Partial<Run>): void {
    this.runs.update((map) => ({ ...map, [id]: { ...this.run(id), ...change } }));
  }

  /** Walk one SKU through the pipeline, revealing each stage in turn. */
  async process(id: string): Promise<void> {
    this.activeId.set(id);
    this.patch(id, { status: 'processing', stage: -1 });
    for (let i = 0; i < this.stages.length; i++) {
      this.patch(id, { stage: i });
      await this.sleep(620);
    }
    this.patch(id, { status: 'done', stage: this.stages.length - 1 });
  }

  /** Process every SKU one after another. */
  async processAll(): Promise<void> {
    this.batchRunning.set(true);
    for (const sku of this.api.skus()) {
      if (this.run(sku.id).status !== 'done') await this.process(sku.id);
    }
    this.batchRunning.set(false);
  }

  async apply(id: string): Promise<void> {
    await this.api.apply(id);
  }

  async reset(): Promise<void> {
    await this.api.reset();
    this.initRuns();
  }
}
