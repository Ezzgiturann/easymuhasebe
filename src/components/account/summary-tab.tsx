import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { KasaBreakdown } from '@/components/account/kasa-breakdown';
import { Segmented } from '@/components/segmented';
import { Card } from '@/components/card';
import { MoneyText } from '@/components/money-text';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { monthRange, prevMonthRange, today } from '@/db/dates';
import { accountQuery } from '@/db/queries/accounts';
import { categoryBreakdownQuery, monthlyTotalsQuery } from '@/db/queries/reports';
import { accountTransactionsQuery } from '@/db/queries/transactions';
import { useTheme } from '@/hooks/use-theme';
import { shareCsv } from '@/utils/backup-file';
import { buildCsv, csvFileName } from '@/utils/export-csv';

type Period = 'thisMonth' | 'lastMonth' | 'thisYear';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'thisMonth', label: 'Bu ay' },
  { value: 'lastMonth', label: 'Geçen ay' },
  { value: 'thisYear', label: 'Bu yıl' },
];

function rangeFor(period: Period): { start: string; end: string } {
  if (period === 'lastMonth') return prevMonthRange(today());
  if (period === 'thisYear') {
    const year = today().slice(0, 4);
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  return monthRange(today());
}

export function SummaryTab({ accountId }: { accountId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('thisMonth');
  const [busy, setBusy] = useState(false);
  const { start, end } = rangeFor(period);

  const { data: totals } = useLiveQuery(
    monthlyTotalsQuery(accountId, start, end),
    [accountId, start, end],
  );
  const { data: breakdown } = useLiveQuery(
    categoryBreakdownQuery(accountId, 'expense', start, end),
    [accountId, start, end],
  );
  // Written months ago and never called from anywhere — the income side of the
  // same query the expense bars already use.
  const { data: incomeBreakdown } = useLiveQuery(
    categoryBreakdownQuery(accountId, 'income', start, end),
    [accountId, start, end],
  );

  const income = (totals ?? []).find((t) => t.kind === 'income')?.total ?? 0;
  const expense = (totals ?? []).find((t) => t.kind === 'expense')?.total ?? 0;
  const top5 = (breakdown ?? []).slice(0, 5);
  const topIncome = (incomeBreakdown ?? []).slice(0, 5);
  const maxTotal = top5.reduce((m, c) => Math.max(m, c.total), 0) || 1;
  const maxIncome = topIncome.reduce((m, c) => Math.max(m, c.total), 0) || 1;

  const onExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const account = accountQuery(accountId).all()[0];
      const rows = accountTransactionsQuery(accountId)
        .all()
        .filter((r) => r.txDate >= start && r.txDate <= end);

      if (rows.length === 0) {
        Alert.alert('Boş dönem', 'Seçtiğin dönemde hiç hareket yok.');
        return;
      }

      // Oldest first: a statement is read top-to-bottom in time, the opposite of
      // the list on screen.
      const csv = buildCsv([...rows].reverse());
      await shareCsv(csv, csvFileName(account?.name ?? 'hesap', start, end));
    } catch (e) {
      Alert.alert('Gönderilemedi', e instanceof Error ? e.message : 'Dosya oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {/* Where the money is now comes before what happened this month: it is the
          figure that gets checked against the drawer at closing time. */}
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        PARA NEREDE
      </ThemedText>
      <KasaBreakdown accountId={accountId} />

      {/* The month used to reset on the 1st with no way back — handing the
          accountant last month's figures was impossible. */}
      <View style={styles.periodWrap}>
        <Segmented<Period> value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
      </View>

      <View style={styles.tiles}>
        <Tile label="Gelir">
          <MoneyText kurus={income} tone="in" type="default" />
        </Tile>
        <Tile label="Gider">
          <MoneyText kurus={expense} tone="out" type="default" />
        </Tile>
        <Tile label="Fark">
          <MoneyText kurus={income - expense} tone="auto" type="default" showPlus />
        </Tile>
      </View>

      <CategoryBars
        title="EN ÇOK HARCAMA"
        empty="Bu dönemde harcama yok."
        rows={top5}
        max={maxTotal}
        color={theme.expense}
        onOpen={(id) =>
          router.push(`/category/${id}?accountId=${accountId}&start=${start}&end=${end}`)
        }
      />

      <CategoryBars
        title="EN ÇOK GELİR"
        empty="Bu dönemde gelir yok."
        rows={topIncome}
        max={maxIncome}
        color={theme.income}
        onOpen={(id) =>
          router.push(`/category/${id}?accountId=${accountId}&start=${start}&end=${end}`)
        }
      />

      {/* The JSON backup only restores into this app; this is the file the
          accountant actually opens. */}
      <Pressable
        onPress={onExport}
        disabled={busy}
        accessibilityLabel="Dönemi CSV olarak dışa aktar"
        style={({ pressed }) => [
          styles.export,
          { borderColor: theme.hairline, opacity: pressed || busy ? 0.6 : 1 },
        ]}>
        <Ionicons name="download-outline" size={18} color={theme.text} />
        <ThemedText type="smallBold">Muhasebeciye gönder (CSV)</ThemedText>
      </Pressable>
    </ScrollView>
  );
}

/** One "en çok …" list. Same shape for income and expense, so they can't drift. */
function CategoryBars({
  title,
  empty,
  rows,
  max,
  color,
  onOpen,
}: {
  title: string;
  empty: string;
  rows: { categoryId: string; name: string; total: number }[];
  max: number;
  color: string;
  onOpen: (categoryId: string) => void;
}) {
  const theme = useTheme();

  return (
    <>
      <ThemedText type="small" themeColor="textSecondary" style={[styles.label, styles.section]}>
        {title}
      </ThemedText>
      {rows.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.mx}>
          {empty}
        </ThemedText>
      ) : (
        <Card style={styles.breakdownCard}>
          {/* Tappable: the number alone was a dead end — "Kira 3.000" with no way
              to see which three entries make it up. */}
          {rows.map((c) => (
            <Pressable
              key={c.categoryId}
              onPress={() => onOpen(c.categoryId)}
              accessibilityLabel={`${c.name} hareketlerini gör`}
              style={({ pressed }) => [styles.barRow, { opacity: pressed ? 0.6 : 1 }]}>
              <View style={styles.barHeader}>
                <ThemedText type="small" numberOfLines={1} style={styles.barName}>
                  {c.name}
                </ThemedText>
                <MoneyText kurus={c.total} tone="neutral" type="small" />
                <Ionicons name="chevron-forward" size={14} color={theme.faint} />
              </View>
              <View style={[styles.barTrack, { backgroundColor: theme.backgroundElement }]}>
                <View style={[styles.barFill, { backgroundColor: color, width: `${(c.total / max) * 100}%` }]} />
              </View>
            </Pressable>
          ))}
        </Card>
      )}
    </>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card style={styles.tile}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.tileLabel}>
        {label}
      </ThemedText>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.one, paddingBottom: Spacing.five },
  label: { letterSpacing: 1.2, fontSize: 11, marginLeft: Spacing.one, marginBottom: Spacing.two },
  section: { marginTop: Spacing.four },
  mx: { marginLeft: Spacing.one },
  periodWrap: { marginTop: Spacing.four, marginBottom: Spacing.three },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  export: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tile: { flex: 1, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, gap: Spacing.one },
  tileLabel: { fontSize: 12 },
  breakdownCard: { paddingVertical: Spacing.four, gap: Spacing.three },
  barRow: { gap: Spacing.one + 1 },
  barHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  barName: { flex: 1, marginRight: Spacing.two },
  // gap + flex on the name replaces space-between now that a chevron follows
  // the amount; space-between would push the chevron away from it.
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
});
