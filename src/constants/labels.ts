import type { KasaType, TxKind } from '@/db/schema/transactions';

/**
 * The Turkish words for the ledger's fixed vocabulary.
 *
 * Kept apart from `categories.ts` because that file imports `@expo/vector-icons`
 * for the category icons, which drags in expo-font and expo-asset — anything
 * needing only a label would otherwise be untestable under jest.
 */

/** The three (and only three) cash boxes. */
export const KASA_LABELS: Record<KasaType, string> = {
  nakit: 'Nakit',
  banka: 'Banka',
  kredi_karti: 'Kredi Kartı',
};

/**
 * What each kind is called on the detail screen. Kept free of the payment
 * method ("nakit"/"banka"), which is shown on its own row — a cash_in paid by
 * card would otherwise read as "Nakit gelir".
 */
export const TX_KIND_LABELS: Record<TxKind, string> = {
  cash_in: 'Gelir',
  cash_out: 'Gider',
  credit_sale: 'Veresiye satış',
  credit_purchase: 'Veresiye alış',
  collect_customer: 'Tahsilat',
  pay_supplier: 'Ödeme',
  transfer: 'Transfer',
};
