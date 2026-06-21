import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { InrPipe } from '../../pipes/inr.pipe';
import { PricingApiService } from '../../services/pricing-api.service';
import { SkuSignal, TriageCategory } from '../../models/sku.model';

/** Display metadata for each triage bucket — keeps the template clean. */
interface CategoryMeta {
  key: TriageCategory;
  label: string;
  tone: 'good' | 'bad' | 'idle';
  icon: string;
  blurb: string;
}

const CATEGORY_META: Record<TriageCategory, CategoryMeta> = {
  LOST_RECOVERABLE: {
    key: 'LOST_RECOVERABLE',
    label: 'Win it back',
    tone: 'good',
    icon: '↻',
    blurb: 'Lost the Buy Box, but we can drop to a profitable price and recover it.',
  },
  WON_HEADROOM: {
    key: 'WON_HEADROOM',
    label: 'Earn more',
    tone: 'good',
    icon: '↗',
    blurb: 'Winning and priced well under the competitor — room to raise and keep the Buy Box.',
  },
  BELOW_FLOOR: {
    key: 'BELOW_FLOOR',
    label: 'Leave it',
    tone: 'bad',
    icon: '✋',
    blurb: 'Competitor is below our cost floor. Chasing them loses money. Flag a human.',
  },
  HOLD: {
    key: 'HOLD',
    label: 'All good',
    tone: 'idle',
    icon: '✓',
    blurb: 'Already in a good spot. No change needed.',
  },
};

@Component({
  selector: 'app-story',
  standalone: true,
  imports: [CommonModule, InrPipe],
  templateUrl: './story.html',
  styleUrl: './story.scss',
})
export class Story implements OnInit {
  readonly api = inject(PricingApiService);

  /** Per-SKU "applying…" spinner state. */
  readonly applying = signal<string | null>(null);

  /** The order we walk the buckets in the triage stage. */
  readonly bucketOrder: TriageCategory[] = [
    'LOST_RECOVERABLE',
    'WON_HEADROOM',
    'BELOW_FLOOR',
    'HOLD',
  ];

  /** The two SKUs that carry the whole narrative. */
  readonly hero = computed(() => this.api.skus().find((s) => s.id === 'SKU-001'));
  readonly villain = computed(() => this.api.skus().find((s) => s.id === 'SKU-007'));

  /** How many actionable items are still pending vs done. */
  readonly pendingCount = computed(
    () => this.api.actionable().filter((s) => s.status !== 'Repriced').length,
  );

  ngOnInit(): void {
    void this.api.load();
  }

  meta(category: TriageCategory): CategoryMeta {
    return CATEGORY_META[category];
  }

  /** Win probability as a 0–100 number for bars and labels. */
  winPercent(sku: SkuSignal): number {
    return Math.round(sku.winProbNow * 100);
  }

  async apply(id: string): Promise<void> {
    this.applying.set(id);
    await this.api.apply(id);
    this.applying.set(null);
  }

  async applyAll(): Promise<void> {
    this.applying.set('ALL');
    await this.api.applyAll();
    this.applying.set(null);
  }

  reset(): void {
    void this.api.reset();
  }
}
