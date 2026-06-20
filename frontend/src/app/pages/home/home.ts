import { Component, inject } from '@angular/core';
import { PriceBar } from '../../components/price-bar/price-bar';
import { SkuSignal, TriageCategory } from '../../models/sku.model';
import { InrPipe } from '../../pipes/inr.pipe';
import { PricingService } from '../../services/pricing.service';

interface CategoryMeta {
  label: string;
  badgeClass: string;
}

const CATEGORY_META: Record<TriageCategory, CategoryMeta> = {
  LOST_RECOVERABLE: { label: 'Lost · recoverable', badgeClass: 'badge--danger' },
  WON_HEADROOM: { label: 'Won · headroom', badgeClass: 'badge--success' },
  BELOW_FLOOR: { label: 'Below floor · no action', badgeClass: 'badge--neutral' },
  HOLD: { label: 'Holding', badgeClass: 'badge--neutral' },
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [PriceBar, InrPipe],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly pricing = inject(PricingService);

  readonly actionable = this.pricing.actionable;
  readonly blocked = this.pricing.blocked;
  readonly holding = this.pricing.holding;

  meta(sku: SkuSignal): CategoryMeta {
    return CATEGORY_META[sku.category];
  }

  /** One-line rationale shown under each card (rule-based placeholder for the AI layer). */
  rationale(s: SkuSignal): string {
    switch (s.category) {
      case 'LOST_RECOVERABLE':
        return `Rival undercut us by Rs.${Math.abs(s.priceGap)}. We can drop to ${this.fmt(
          s.suggestedPrice,
        )} and stay Rs.${(s.suggestedPrice ?? 0) - s.marginFloor} above floor.`;
      case 'WON_HEADROOM':
        return `Winning the Buy Box Rs.${s.competitorPrice - s.ourPrice} under the rival — room to raise toward ${this.fmt(
          s.suggestedPrice,
        )} and capture margin.`;
      case 'BELOW_FLOOR':
        return `Rival at ${this.fmt(
          s.competitorPrice,
        )} is below our floor of ${this.fmt(s.marginFloor)}. Matching would erode margin — hold and monitor.`;
      default:
        return `Priced sensibly versus the rival. No change needed right now.`;
    }
  }

  private fmt(v: number | null): string {
    return v === null ? '—' : 'Rs.' + Math.round(v).toLocaleString('en-IN');
  }
}
