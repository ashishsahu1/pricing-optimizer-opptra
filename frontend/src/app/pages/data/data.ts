import { Component, inject } from '@angular/core';
import { SkuSignal, TriageCategory } from '../../models/sku.model';
import { InrPipe } from '../../pipes/inr.pipe';
import { PricingService } from '../../services/pricing.service';

const CATEGORY_LABEL: Record<TriageCategory, string> = {
  LOST_RECOVERABLE: 'Recoverable',
  WON_HEADROOM: 'Headroom',
  BELOW_FLOOR: 'Below floor',
  HOLD: 'Holding',
};

@Component({
  selector: 'app-data',
  standalone: true,
  imports: [InrPipe],
  templateUrl: './data.html',
  styleUrl: './data.scss',
})
export class DataPage {
  private readonly pricing = inject(PricingService);

  readonly rows = this.pricing.signals;

  categoryLabel(s: SkuSignal): string {
    return CATEGORY_LABEL[s.category];
  }
}
