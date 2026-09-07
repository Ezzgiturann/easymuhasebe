import { Ionicons } from '@expo/vector-icons';

/** Seeded for every new account. `icon` is an Ionicons name. */
export interface DefaultCategory {
  name: string;
  icon: string;
  kind: 'income' | 'expense';
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // Gelir
  { name: 'Satış', icon: 'pricetags', kind: 'income' },
  { name: 'Tahsilat', icon: 'cash', kind: 'income' },
  { name: 'Diğer Gelir', icon: 'add-circle', kind: 'income' },
  // Gider
  { name: 'Mal Alımı', icon: 'bag-handle', kind: 'expense' },
  { name: 'Market', icon: 'basket', kind: 'expense' },
  { name: 'Kira', icon: 'home', kind: 'expense' },
  { name: 'Fatura', icon: 'flash', kind: 'expense' },
  { name: 'Personel', icon: 'people', kind: 'expense' },
  { name: 'Yemek', icon: 'restaurant', kind: 'expense' },
  { name: 'Ulaşım', icon: 'car', kind: 'expense' },
  { name: 'Telefon / İnternet', icon: 'wifi', kind: 'expense' },
  { name: 'Vergi / Resmi', icon: 'business', kind: 'expense' },
  { name: 'Kırtasiye', icon: 'document-text', kind: 'expense' },
  { name: 'Bakım / Onarım', icon: 'construct', kind: 'expense' },
  { name: 'Diğer Gider', icon: 'ellipsis-horizontal-circle', kind: 'expense' },
];

/** Return a valid Ionicons name, falling back for legacy/unknown icon keys. */
export function categoryIcon(name: string | null | undefined): keyof typeof Ionicons.glyphMap {
  if (name && name in Ionicons.glyphMap) return name as keyof typeof Ionicons.glyphMap;
  return 'pricetag';
}

/** Palette offered when creating an account. */
export const ACCOUNT_COLORS = [
  '#E5484D', // red
  '#F76B15', // orange
  '#FFC53D', // amber
  '#30A46C', // green
  '#0091FF', // blue
  '#8E4EC6', // purple
  '#E93D82', // pink
  '#60646C', // gray
];
