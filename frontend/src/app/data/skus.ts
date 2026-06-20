import { Sku } from '../models/sku.model';

/**
 * Snapshot of 8 SKUs across two marketplaces at 9am today.
 * Source: Opptra "Pricing Signal Problem" case study sample data.
 * All prices are in INR (Rs.).
 */
export const SKU_SNAPSHOT: Sku[] = [
  {
    id: 'SKU-001',
    brand: 'Natura Casa',
    ourPrice: 1299,
    competitorPrice: 1199,
    buyBox: 'Lost',
    marginFloor: 1050,
    lastChanged: '3 days ago',
  },
  {
    id: 'SKU-002',
    brand: 'Natura Casa',
    ourPrice: 849,
    competitorPrice: 860,
    buyBox: 'Won',
    marginFloor: 720,
    lastChanged: 'Today',
  },
  {
    id: 'SKU-003',
    brand: 'LivSpace Pro',
    ourPrice: 2499,
    competitorPrice: 2199,
    buyBox: 'Lost',
    marginFloor: 1800,
    lastChanged: '6 days ago',
  },
  {
    id: 'SKU-004',
    brand: 'LivSpace Pro',
    ourPrice: 599,
    competitorPrice: 610,
    buyBox: 'Won',
    marginFloor: 480,
    lastChanged: '2 days ago',
  },
  {
    id: 'SKU-005',
    brand: 'Artisan Home',
    ourPrice: 3799,
    competitorPrice: 3750,
    buyBox: 'Lost',
    marginFloor: 3200,
    lastChanged: '1 day ago',
  },
  {
    id: 'SKU-006',
    brand: 'Artisan Home',
    ourPrice: 1150,
    competitorPrice: 1390,
    buyBox: 'Won',
    marginFloor: 900,
    lastChanged: 'Today',
  },
  {
    id: 'SKU-007',
    brand: 'Nordic Basics',
    ourPrice: 449,
    competitorPrice: 399,
    buyBox: 'Lost',
    marginFloor: 420,
    lastChanged: '5 days ago',
  },
  {
    id: 'SKU-008',
    brand: 'Nordic Basics',
    ourPrice: 2199,
    competitorPrice: 2100,
    buyBox: 'Lost',
    marginFloor: 1750,
    lastChanged: '4 days ago',
  },
];
