import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { Alert, Pressable, SectionList, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { MoneyText } from '@/components/money-text';
import { ThemedText } from '@/components/themed-text';
import { KASA_LABELS } from '@/constants/labels';
import { Spacing } from '@/constants/theme';
import { dayLabel } from '@/db/dates';
import { deleteTransaction } from '@/db/mutations/transactions';
import { accountTransactionsQuery, groupByDay, type TransactionRow } from '@/db/queries/transactions';
import { useTheme } from '@/hooks/use-theme';
import {
  filterTransactions,
  isEmptyFilter,
  NO_FILTER,
  type TransactionFilter,
} from '@/utils/tx-filter';

export function TransactionsTab({
  accountId,
  filter = NO_FILTER,
}: {
  accountId: string;
  filter?: TransactionFilter;
}) {
  const { data } = useLiveQuery(accountTransactionsQuery(accountId), [accountId]);
  const sections = groupByDay(filterTransactions(data ?? [], filter));

  if (sections.length === 0) {
    // Two different empties: a ledger with nothing in it needs a nudge, a filter
    // that matched nothing needs to say so — otherwise a narrow filter reads as
    // "my transactions are gone".
    if (!isEmptyFilter(filter)) {
      return (
        <EmptyState
          icon="options-outline"
          title="Bu filtreye uyan işlem yok"
        />
      );
    }
    // No button here: the "İşlem ekle" FAB is already on screen, and a second
    // button for the same action would only make the user wonder if they differ.
    return (
      <EmptyState
        icon="reader-outline"
        title="Henüz işlem yok"
      />
    );
  }

  return (
    /**
     * SectionList, not a ScrollView full of rows.
     *
     * The old version turned every transaction in the account into a mounted
     * component at once, and the query has no LIMIT — a shop entering twenty
     * entries a day reaches several thousand within a year and the tab stops
     * scrolling. A virtualised list keeps roughly a screenful alive and lets the
     * rest exist as data.
     *
     * The grouped-card look is rebuilt per row rather than by wrapping each day
     * in a `Card`: a card can only wrap what is mounted, and the point here is
     * that most rows are not.
     */
    <SectionList
      sections={sections.map((s) => ({ day: s.day, net: s.net, data: s.data }))}
      keyExtractor={(row) => row.id}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      // A day's worth of rows plus the next header; enough to fill a screen on
      // first paint without mounting a month of history behind it.
      initialNumToRender={12}
      windowSize={7}
      removeClippedSubviews
      renderSectionHeader={({ section }) => (
        <View style={styles.dayHeader}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.dayLabel}>
            {dayLabel(section.day).toLocaleUpperCase('tr-TR')}
          </ThemedText>
          <MoneyText kurus={section.net} tone="auto" type="small" showPlus />
        </View>
      )}
      renderItem={({ item, index, section }) => (
        <CardRow first={index === 0} last={index === section.data.length - 1}>
          <TransactionItem row={item} last={index === section.data.length - 1} />
        </CardRow>
      )}
      SectionSeparatorComponent={({ leadingItem }) =>
        leadingItem ? <View style={styles.sectionGap} /> : null
      }
    />
  );
}

/**
 * One row dressed as part of a card.
 *
 * `Card` cannot be used directly around a virtualised section — its children are
 * mounted and unmounted individually — so the rounded corners, surface colour and
 * side padding are applied per row and the corners only to the ends.
 */
function CardRow({
  first,
  last,
  children,
}: {
  first: boolean;
  last: boolean;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.cardRow,
        { backgroundColor: theme.surface, borderColor: theme.hairline },
        first && styles.cardRowFirst,
        last && styles.cardRowLast,
      ]}>
      {children}
    </View>
  );
}

/** Exported so the search screen renders results identically to the list. */
export function TransactionItem({ row, last }: { row: TransactionRow; last: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  // A transfer is stored as an 'out' so the column has a value. Rendering it red
  // with a minus would tell the shopkeeper they lost money they still have.
  const isTransfer = row.kind === 'transfer';
  const isIn = row.direction === 'in';
  const signed = isTransfer ? row.amount : isIn ? row.amount : -row.amount;
  const title = isTransfer
    ? row.description || 'Aktarım'
    : row.description || row.categoryName || (isIn ? 'Gelen' : 'Giden');
  const sub = isTransfer
    ? [row.kasaType && KASA_LABELS[row.kasaType], row.toKasaType && KASA_LABELS[row.toKasaType]]
        .filter(Boolean)
        .join(' → ')
    : [row.categoryName, row.contactName].filter(Boolean).join(' · ');

  const onLongPress = () => {
    Alert.alert('İşlemi sil', `"${title}" silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => deleteTransaction(row.id) },
    ]);
  };

  return (
    <Pressable
      onPress={() => router.push(`/transaction/${row.id}`)}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.item,
        { borderBottomColor: last ? 'transparent' : theme.hairline, opacity: pressed ? 0.6 : 1 },
      ]}>
      <View style={[styles.icon, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons
          name={isTransfer ? 'swap-horizontal' : isIn ? 'arrow-down' : 'arrow-up'}
          size={18}
          color={isTransfer ? theme.textSecondary : isIn ? theme.income : theme.expense}
        />
      </View>
      <View style={styles.body}>
        <ThemedText type="default" numberOfLines={1}>
          {title}
        </ThemedText>
        {sub ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {sub}
          </ThemedText>
        ) : null}
      </View>
      <MoneyText
        kurus={signed}
        tone={isTransfer ? 'neutral' : 'auto'}
        type="default"
        showPlus={!isTransfer}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  sectionGap: { height: Spacing.three },
  cardRow: {
    paddingHorizontal: Spacing.four,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  cardRowFirst: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardRowLast: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  dayLabel: { letterSpacing: 1.2, fontSize: 11 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 1 },
});
