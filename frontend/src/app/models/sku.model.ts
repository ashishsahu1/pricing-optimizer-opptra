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
  /** ML-derived Buy Box win probability at the current price (0–1). */
  winProbNow: number;
  category: TriageCategory;
  /**
   * The price the system recommends. Always constrained to be >= marginFloor.
   * Null when no profitable action is possible (BELOW_FLOOR).
   */
  suggestedPrice: number | null;
  /** "Pending" until applied, then "Repriced". */
  status: string;
}

/** A floor-safe, manager-ready recommendation for one SKU. */
export interface Recommendation {
  id: string;
  category: TriageCategory;
  suggestedPrice: number | null;
  text: string;
  /** Where the sentence came from: the LLM agent or the deterministic fallback. */
  source: 'foundry' | 'template';
}

/** Result of applying a reprice (the one-click action). */
export interface ApplyResult {
  id: string;
  applied: boolean;
  message: string;
  sku: SkuSignal | null;
}

/** Where a persona curve came from: the LLM agent or the deterministic model. */
export type PersonaSource = 'foundry' | 'model';

/** A buyer persona on the simulation panel. */
export interface Persona {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
}

/** One (persona × price) cell of the heatmap. */
export interface SimulationCell {
  price: number;
  /** 0–1 chance this persona buys at this price. */
  buyProbability: number;
  belowFloor: boolean;
}

/** One persona's buy-probability curve across the price ladder. */
export interface PersonaRow {
  personaId: string;
  name: string;
  emoji: string;
  blurb: string;
  source: PersonaSource;
  cells: SimulationCell[];
}

/** Aggregate signal for one price across the whole panel. */
export interface PriceColumn {
  price: number;
  belowFloor: boolean;
  /** Mean buy-probability — the share of the panel that purchases. */
  expectedDemand: number;
  /** price × demand. */
  revenueIndex: number;
  /** (price − floor) × demand, 0 below floor. */
  profitIndex: number;
}

/** Full persona-simulation heatmap payload for one SKU. */
export interface SimulationResult {
  id: string;
  brand: string;
  ourPrice: number;
  competitorPrice: number;
  marginFloor: number;
  buyBox: BuyBoxStatus;
  ladder: number[];
  personas: PersonaRow[];
  columns: PriceColumn[];
  /** Floor-safe, profit-maximising price. */
  bestPrice: number | null;
  source: PersonaSource;
}
