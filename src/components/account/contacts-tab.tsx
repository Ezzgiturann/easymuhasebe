import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { MoneyText } from '@/components/money-text';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { today } from '@/db/dates';
import { accountContactMovementsQuery, contactsWithBalanceQuery } from '@/db/queries/contacts';
import { useTheme } from '@/hooks/use-theme';
import { computeOverdue, NOT_OVERDUE, outstandingLots, type OverdueInfo } from '@/utils/overdue';

/** Label for a cari balance: who owes whom, in plain words. */
export function balanceLabel(balance: number): string {
  if (balance > 0) return 'size borçlu';
  if (balance < 0) return 'alacaklı';
  return 'kapalı';
}

type Row = {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
  openingBalance: number;
  paymentTermDays: number | null;
  overdue: OverdueInfo;
};

export function ContactsTab({ accountId }: { accountId: string }) {
  const { data } = useLiveQuery(contactsWithBalanceQuery(accountId), [accountId]);
  const { data: movements } = useLiveQuery(accountContactMovementsQuery(accountId), [accountId]);

  // One query for every contact's movements, grouped here — a statement query
  // per contact would mean N reads just to draw a list.
  const day = today();
  const byContact = new Map<string, { txDate: string; contactAmount: number }[]>();
  for (const m of movements ?? []) {
    if (!m.contactId) continue;
    const rows = byContact.get(m.contactId) ?? [];
    rows.push({ txDate: m.txDate, contactAmount: m.contactAmount });
    byContact.set(m.contactId, rows);
  }

  const list = (data ?? []).map((c) => ({
    ...c,
    overdue:
      c.balance > 0
        ? computeOverdue(
            outstandingLots(c.openingBalance, byContact.get(c.id) ?? []),
            c.paymentTermDays,
            day,
          )
        : NOT_OVERDUE,
  })) as Row[];

  if (list.length === 0) {
    // The "Cari ekle" pill sits directly above this on the account screen, so a
    // button here would be a second copy of one already in view.
    return (
      <EmptyState
        icon="people-outline"
        title="Cari yok"
      />
    );
  }

  // Late first, then by size — the list becomes a call sheet, not a directory.
  const owedToUs = list
    .filter((c) => c.balance > 0)
    .sort((a, b) => b.overdue.daysLate - a.overdue.daysLate || b.balance - a.balance);
  const weOwe = list.filter((c) => c.balance < 0).sort((a, b) => a.balance - b.balance);
  const settled = list.filter((c) => c.balance === 0);

  const totalOwedToUs = owedToUs.reduce((s, c) => s + c.balance, 0);
  const totalWeOwe = weOwe.reduce((s, c) => s + Math.abs(c.balance), 0);
  const totalOverdue = owedToUs.reduce((s, c) => s + c.overdue.amount, 0);

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <View style={styles.tiles}>
        <Tile label="Alacağım">
          <MoneyText kurus={totalOwedToUs} tone={totalOwedToUs ? 'in' : 'neutral'} type="default" />
        </Tile>
        <Tile label="Borcum">
          <MoneyText kurus={totalWeOwe} tone={totalWeOwe ? 'out' : 'neutral'} type="default" />
        </Tile>
      </View>

      {totalOverdue > 0 ? (
        <OverdueBanner
          amount={totalOverdue}
          count={owedToUs.filter((c) => c.overdue.amount > 0).length}
        />
      ) : null}

      <Group title="SİZE BORÇLU" rows={owedToUs} tone="in" />
      <Group title="SİZDEN ALACAKLI" rows={weOwe} tone="out" />
      <Group title="KAPALI" rows={settled} tone="neutral" />
    </ScrollView>
  );
}

/** The one number an esnaf opens this screen for: how much is actually late. */
function OverdueBanner({ amount, count }: { amount: number; count: number }) {
  const theme = useTheme();
  return (
    <Card style={styles.overdueBanner}>
      <Ionicons name="alert-circle" size={20} color={theme.expense} />
      <View style={styles.overdueBody}>
        <ThemedText type="smallBold">Vadesi geçen alacak</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {count} cari
        </ThemedText>
      </View>
      <MoneyText kurus={amount} tone="out" type="default" />
    </Card>
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

function Group({ title, rows, tone }: { title: string; rows: Row[]; tone: 'in' | 'out' | 'neutral' }) {
  const theme = useTheme();
  const router = useRouter();
  if (rows.length === 0) return null;

  return (
    <View style={styles.group}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.groupTitle}>
        {title}
      </ThemedText>
      <Card>
        {rows.map((item, i) => (
          <Pressable
            key={item.id}
            onPress={() => router.push(`/cari/${item.id}`)}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: i === rows.length - 1 ? 'transparent' : theme.hairline, opacity: pressed ? 0.6 : 1 },
            ]}>
            <Avatar label={item.name} />
            <View style={styles.body}>
              <ThemedText type="default" numberOfLines={1}>
                {item.name}
              </ThemedText>
              {item.overdue.amount > 0 ? (
                <ThemedText type="small" style={{ color: theme.expense }}>
                  {item.overdue.daysLate} gün gecikmiş
                </ThemedText>
              ) : item.phone ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {item.phone}
                </ThemedText>
              ) : null}
            </View>
            <MoneyText kurus={Math.abs(item.balance)} tone={tone} type="default" />
            <Ionicons name="chevron-forward" size={17} color={theme.faint} style={styles.chevron} />
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: Spacing.four, paddingTop: Spacing.one, paddingBottom: Spacing.five },
  tiles: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.two },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  overdueBody: { flex: 1, gap: 1 },
  tile: { flex: 1, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, gap: Spacing.one },
  tileLabel: { fontSize: 12 },
  group: { marginTop: Spacing.three },
  groupTitle: { letterSpacing: 1.2, fontSize: 11, marginLeft: Spacing.one, marginBottom: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, gap: 1 },
  chevron: { marginLeft: Spacing.one, marginRight: -Spacing.one },
});
