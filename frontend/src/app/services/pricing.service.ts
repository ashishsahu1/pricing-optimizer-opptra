import { Injectable, computed, signal } from '@angular/core';
import { SKU_SNAPSHOT } from '../data/skus';
import { Sku, SkuSignal, TriageCategory } from '../models/sku.model';

/** Amount we undercut the competitor by when recovering the Buy Box (Rs.). */
const UNDERCUT_STEP = 10;
/** Minimum gap below competitor (Won) before we treat headroom as "significant". */
const HEADROOM_THRESHOLD = 50;

@Injectable({ providedIn: 'root' })
export class PricingService {
  /** Raw snapshot, held as a signal so the UI reacts to (future) changes. */
  private readonly skus = signal<Sku[]>(SKU_SNAPSHOT);

  /** Derived pricing signals for every SKU. */
  readonly signals = computed<SkuSignal[]>(() =>
    this.skus().map((sku) => this.deriveSignal(sku)),
  );

  /** Items that need attention right now, ordered by urgency. */
  readonly actionable = computed(() =>
    this.signals()
      .filter((s) => s.category === 'LOST_RECOVERABLE' || s.category === 'WON_HEADROOM')
      .sort((a, b) => this.urgency(b) - this.urgency(a)),
  );

  readonly blocked = computed(() =>
    this.signals().filter((s) => s.category === 'BELOW_FLOOR'),
  );

  readonly holding = computed(() =>
    this.signals().filter((s) => s.category === 'HOLD'),
  );

  private deriveSignal(sku: Sku): SkuSignal {
    const priceGap = sku.competitorPrice - sku.ourPrice;
    const marginHeadroom = sku.ourPrice - sku.marginFloor;
    const competitorBelowFloor = sku.competitorPrice < sku.marginFloor;

    const category = this.classify(sku, competitorBelowFloor);
    const suggestedPrice = this.suggestPrice(sku, category);

    return {
      ...sku,
      priceGap,
      marginHeadroom,
      competitorBelowFloor,
      category,
      suggestedPrice,
    };
  }

  private classify(sku: Sku, competitorBelowFloor: boolean): TriageCategory {
    if (competitorBelowFloor) {
      return 'BELOW_FLOOR';
    }

    if (sku.buyBox === 'Lost') {
      // We can only recover if we can sit below the competitor and stay above floor.
      const targetPrice = sku.competitorPrice - UNDERCUT_STEP;
      return targetPrice >= sku.marginFloor ? 'LOST_RECOVERABLE' : 'BELOW_FLOOR';
    }

    // Buy Box Won: do we have meaningful room to raise price toward the competitor?
    const headroom = sku.competitorPrice - sku.ourPrice;
    return headroom >= HEADROOM_THRESHOLD ? 'WON_HEADROOM' : 'HOLD';
  }

  private suggestPrice(sku: Sku, category: TriageCategory): number | null {
    switch (category) {
      case 'LOST_RECOVERABLE':
        // Undercut the competitor, never breach the floor.
        return Math.max(sku.competitorPrice - UNDERCUT_STEP, sku.marginFloor);
      case 'WON_HEADROOM':
        // Raise toward (but stay just below) the competitor to protect the Buy Box.
        return sku.competitorPrice - UNDERCUT_STEP;
      default:
        return null;
    }
  }

  /** Higher = more urgent. Lost Buy Box outranks headroom opportunities. */
  private urgency(s: SkuSignal): number {
    if (s.category === 'LOST_RECOVERABLE') {
      return 1000 + Math.abs(s.priceGap);
    }
    if (s.category === 'WON_HEADROOM') {
      return s.competitorPrice - s.ourPrice;
    }
    return 0;
  }
}
