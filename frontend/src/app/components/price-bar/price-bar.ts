import { Component, computed, input } from '@angular/core';
import { SkuSignal } from '../../models/sku.model';
import { InrPipe } from '../../pipes/inr.pipe';

interface Marker {
  label: string;
  value: number;
  pct: number;
  kind: 'floor' | 'ours' | 'competitor';
}

/**
 * Horizontal price scale that plots the margin floor, our price and the
 * competitor's price on a shared axis. The zone below the floor is shaded red
 * so a "competitor below floor" situation reads at a glance.
 */
@Component({
  selector: 'app-price-bar',
  standalone: true,
  imports: [InrPipe],
  templateUrl: './price-bar.html',
  styleUrl: './price-bar.scss',
})
export class PriceBar {
  readonly sku = input.required<SkuSignal>();

  /** Axis bounds with ~12% padding on each side. */
  private readonly bounds = computed(() => {
    const s = this.sku();
    const values = [s.marginFloor, s.ourPrice, s.competitorPrice];
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = Math.max(hi - lo, 1);
    const pad = span * 0.18;
    return { min: lo - pad, max: hi + pad };
  });

  private pct(value: number): number {
    const { min, max } = this.bounds();
    return ((value - min) / (max - min)) * 100;
  }

  /** Where the margin floor sits on the axis (left edge of the safe zone). */
  readonly floorPct = computed(() => this.pct(this.sku().marginFloor));

  readonly markers = computed<Marker[]>(() => {
    const s = this.sku();
    return [
      { label: 'Floor', value: s.marginFloor, pct: this.pct(s.marginFloor), kind: 'floor' },
      { label: 'Us', value: s.ourPrice, pct: this.pct(s.ourPrice), kind: 'ours' },
      {
        label: 'Rival',
        value: s.competitorPrice,
        pct: this.pct(s.competitorPrice),
        kind: 'competitor',
      },
    ];
  });
}
