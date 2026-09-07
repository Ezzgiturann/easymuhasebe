import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { MoneyText } from '@/components/money-text';
import { ThemedText } from '@/components/themed-text';
import { KASA_LABELS } from '@/constants/labels';
import { Spacing } from '@/constants/theme';
import { accountQuery } from '@/db/queries/accounts';
import { kasaBalancesQuery } from '@/db/queries/reports';
import { type KasaType } from '@/db/schema/transactions';
import { useTheme } from '@/hooks/use-theme';
import { kasaBalances, kasaTotal } from '@/utils/kasa-balances';

const KASA_ICONS: Record<KasaType, keyof typeof Ionicons.glyphMap> = {
  nakit: 'cash-outline',
  banka: 'business-outline',
  kredi_karti: 'card-outline',
};

/**
 * Where the money actually sits — the question asked while counting the till at
 * closing time. The account's single "kasa bakiyesi" total cannot answer it.
 *
 * Every box is listed, including empty ones: a shopkeeper who has not started
 * using the bank row still needs to see that the app knows about it, and a
 * missing row reads as a bug rather than a zero.
 */
export function KasaBreakdown({
  accountId,
  /** Off where the screen already shows the account total right above the card. */
  showTotal = true,
}: {
  accountId: string;
  showTotal?: boolean;
}) {
  const theme = useTheme();
  const { data } = useLiveQuery(kasaBalancesQuery(accountId), [accountId]);
  const { data: accounts } = useLiveQuery(accountQuery(accountId), [accountId]);
  const account = accounts?.[0];

  // The opening balance is a column, not a posting, so it has to be folded in
  // here — `kasaBalances` is the one place that knows how.
  const balances = kasaBalances(data ?? [], {
    openingBalance: account?.openingBalance ?? 0,
    openingKasaType: account?.openingKasaType ?? null,
  });
  const total = kasaTotal(balances);

  return (
    <Card style={styles.card}>
      {balances.map(({ kasaType, total: amount }) => (
        <View key={kasaType} style={styles.row}>
          <View style={styles.left}>
            <Ionicons name={KASA_ICONS[kasaType]} size={18} color={theme.textSecondary} />
            <ThemedText type="default">{KASA_LABELS[kasaType]}</ThemedText>
          </View>
          <MoneyText kurus={amount} tone="neutral" type="default" />
        </View>
      ))}
      {showTotal && (
        <View style={[styles.row, styles.totalRow, { borderTopColor: theme.hairline }]}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            TOPLAM
          </ThemedText>
          <MoneyText kurus={total} tone="neutral" type="subtitle" />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  totalRow: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: Spacing.one },
});
