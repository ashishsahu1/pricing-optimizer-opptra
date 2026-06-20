export type BuyBoxStatus = 'Won' | 'Lost';

/**
 * Triage category derived from the raw pricing signal.
 * Drives the colour-coding and prioritisation in the UI.
 */
export type TriageCategory =
  | 'LOST_RECOVERABLE' // Lost Buy Box, but we can undercut competitor and stay above floor
  | 'WON_HEADROOM' // Won Buy Box and priced well below competitor -> room to raise price
  | 'BELOW_FLOOR' // Competitor is below our margin floor -> no profitable action
  | 'HOLD'; // Already in a good spot, no action needed

export interface Sku {
  id: string;
  brand: string;
  ourPrice: number;
  competitorPrice: number;
  buyBox: BuyBoxStatus;
  marginFloor: number;
  lastChanged: string;
}

export interface SkuSignal extends Sku {
  /** competitorPrice - ourPrice. Negative means the competitor has undercut us. */
  priceGap: number;
  /** ourPrice - marginFloor. The room we have to drop price while staying profitable. */
  marginHeadroom: number;
  /** True when the competitor is pricing below our margin floor. */
  competitorBelowFloor: boolean;
  category: TriageCategory;
  /**
   * A suggested price (rule-based placeholder until the AI layer is wired in).
   * Always constrained to be >= marginFloor. Null when no action is possible.
   */
  suggestedPrice: number | null;
}
