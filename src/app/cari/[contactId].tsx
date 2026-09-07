import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Linking, Pressable, FlatList, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { balanceLabel } from '@/components/account/contacts-tab';
import { MoneyText } from '@/components/money-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { dayLabel, today } from '@/db/dates';
import { deleteContact } from '@/db/mutations/contacts';
import { computeOverdue, NOT_OVERDUE, outstandingLots } from '@/utils/overdue';
import {
  buildStatement,
  contactQuery,
  contactStatementQuery,
  type StatementLine,
} from '@/db/queries/contacts';
import { useTheme } from '@/hooks/use-theme';
import { formatTRY } from '@/utils/money';

export default function ContactDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { contactId } = useLocalSearchParams<{ contactId: string }>();

  const { data: contactRows } = useLiveQuery(contactQuery(contactId), [contactId]);
  const { data: statementRows } = useLiveQuery(contactStatementQuery(contactId), [contactId]);

  const contact = contactRows?.[0];
  const lines = buildStatement(contact?.openingBalance ?? 0, statementRows ?? []);
  const balance = lines.length ? lines[lines.length - 1].running : contact?.openingBalance ?? 0;
  // Newest at the top, computed once — the running balance is built oldest-first.
  const newestFirst = [...lines].reverse();

  const overdue =
    balance > 0
      ? computeOverdue(
          outstandingLots(contact?.openingBalance ?? 0, statementRows ?? []),
          contact?.paymentTermDays ?? null,
          today(),
        )
      : NOT_OVERDUE;

  /** Send `text` over WhatsApp when we have a number, otherwise the share sheet. */
  const sendMessage = async (text: string) => {
    const waUrl = contact?.phone
      ? `https://wa.me/${contact.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
      : null;
    if (waUrl && (await Linking.canOpenURL(waUrl))) {
      await Linking.openURL(waUrl);
    } else {
      await Share.share({ message: text });
    }
  };

  const onShare = async () => {
    if (!contact) return;
    await sendMessage(buildStatementText(contact.name, lines, balance));
  };

  /**
   * A reminder, not a statement: short, states the late amount and how long it
   * has been late, and stays polite — this goes to a regular customer the esnaf
   * has to face again tomorrow.
   */
  const onRemind = async () => {
    if (!contact) return;
    await sendMessage(
      `Merhaba ${contact.name}, hatırlatmak istedim: ${formatTRY(overdue.amount)} tutarındaki ` +
        `borcunuzun vadesi ${overdue.daysLate} gün geçti. Uygun olduğunuzda görüşelim. Teşekkürler.`,
    );
  };

  /**
   * Deleting a cari only hides the card — their movements stay in the ledger.
   * When the balance isn't zero that debt silently drops out of the alacak/borç
   * totals, so the confirmation says the number out loud.
   */
  const confirmDelete = () => {
    const settled = balance === 0;
    const body = settled
      ? `“${contact?.name}” cari listesinden kaldırılsın mı?`
      : `“${contact?.name}” için ${formatTRY(Math.abs(balance))} ${balanceLabel(balance)}.\n\n` +
        `Silersen bu tutar alacak/borç toplamlarından çıkar, ama ${lines.length} hareket ` +
        `kayıtlarda kalır ve kasa bakiyen değişmez.`;

    Alert.alert('Cariyi sil', body, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          deleteContact(contactId);
          router.back();
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: contact?.name ?? '',
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => router.push(`/cari/new?editId=${contactId}`)}
                hitSlop={8}
                accessibilityLabel="Cariyi düzenle">
                <Ionicons name="create-outline" size={22} color={theme.text} />
              </Pressable>
              <Pressable onPress={confirmDelete} hitSlop={8} accessibilityLabel="Cariyi sil">
                <Ionicons name="trash-outline" size={22} color={theme.expense} />
              </Pressable>
            </View>
          ),
        }}
      />
      <SafeAreaView edges={['bottom']} style={styles.safe}>
        <View style={styles.summary}>
          <ThemedText type="small" themeColor="textSecondary">
            Kalan bakiye · {balanceLabel(balance)}
          </ThemedText>
          <MoneyText
            kurus={Math.abs(balance)}
            tone={balance > 0 ? 'in' : balance < 0 ? 'out' : 'neutral'}
            type="subtitle"
          />
          {overdue.amount > 0 ? (
            <ThemedText type="small" style={{ color: theme.expense }}>
              {formatTRY(overdue.amount)} · {overdue.daysLate} gün gecikmiş
            </ThemedText>
          ) : null}
        </View>

        {/* Virtualised for the same reason as the transactions tab: a supplier
            worked with for years has a statement thousands of movements long, and
            mounting all of them was the cost of opening their card. The reversal
            happens once here rather than inside the render. */}
        <FlatList
          data={newestFirst}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              Bu kişiyle henüz hareket yok.
            </ThemedText>
          }
          renderItem={({ item, index }) => (
            <View
              style={[
                styles.stmtRow,
                { backgroundColor: theme.surface, borderColor: theme.hairline },
                index === 0 && styles.stmtRowFirst,
                index === newestFirst.length - 1 && styles.stmtRowLast,
              ]}>
              <StatementItem
                line={item}
                hairline={index === newestFirst.length - 1 ? 'transparent' : theme.hairline}
              />
            </View>
          )}
        />

        {overdue.amount > 0 ? (
          <Pressable
            onPress={onRemind}
            style={({ pressed }) => [
              styles.remind,
              { backgroundColor: theme.text, opacity: pressed ? 0.8 : 1 },
            ]}>
            <Ionicons name="notifications-outline" size={20} color={theme.background} />
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              Ödeme hatırlat
            </ThemedText>
          </Pressable>
        ) : null}

        <Pressable onPress={onShare} style={[styles.share, { borderColor: theme.faint }]}>
          <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
          <ThemedText type="smallBold" style={{ color: '#25D366' }}>
            WhatsApp&apos;tan ekstre gönder
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

function StatementItem({ line, hairline }: { line: StatementLine; hairline: string }) {
  return (
    <View style={[styles.item, { borderBottomColor: hairline }]}>
      <View style={styles.itemBody}>
        <ThemedText type="default" numberOfLines={1}>
          {line.description || (line.contactAmount > 0 ? 'Borç' : 'Ödeme')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {dayLabel(line.txDate)} · Kalan {formatTRY(line.running)}
        </ThemedText>
      </View>
      <MoneyText kurus={line.contactAmount} tone="auto" type="default" showPlus />
    </View>
  );
}

function buildStatementText(name: string, lines: StatementLine[], balance: number): string {
  const head = `${name} — Hesap Ekstresi\n`;
  const body = lines
    .map((l) => {
      const label = l.description || (l.contactAmount > 0 ? 'Borç' : 'Ödeme');
      const sign = l.contactAmount > 0 ? '+' : '';
      return `${l.txDate}  ${label}  ${sign}${formatTRY(l.contactAmount)}`;
    })
    .join('\n');
  const tail =
    balance > 0
      ? `\n\nKalan: ${formatTRY(balance)} (borç)`
      : balance < 0
        ? `\n\nKalan: ${formatTRY(Math.abs(balance))} (alacak)`
        : '\n\nHesap kapalı.';
  return head + body + tail;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  headerActions: { flexDirection: 'row', gap: Spacing.four },
  summary: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.three, gap: Spacing.one },
  list: { paddingHorizontal: Spacing.four },
  stmtRow: {
    paddingHorizontal: Spacing.four,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  stmtRowFirst: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stmtRowLast: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemBody: { flex: 1, gap: 1 },
  remind: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  share: {
    flexDirection: 'row',
    gap: Spacing.two,
    margin: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
