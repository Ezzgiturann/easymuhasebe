import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { MoneyText } from '@/components/money-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { categoryIcon } from '@/constants/categories';
import { KASA_LABELS, TX_KIND_LABELS } from '@/constants/labels';
import { Spacing } from '@/constants/theme';
import { dayLabel } from '@/db/dates';
import { deleteTransaction } from '@/db/mutations/transactions';
import { transactionQuery } from '@/db/queries/transactions';
import { useTheme } from '@/hooks/use-theme';

/**
 * Everything recorded about one transaction. Before this screen existed the list
 * was the only view, so `note` and `receiptUri` were written and never shown —
 * a receipt photo could be attached and then never looked at again.
 */
export default function TransactionDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useLiveQuery(transactionQuery(id), [id]);
  const tx = data?.[0];
  const [zoomed, setZoomed] = useState(false);

  if (!tx) {
    return (
      <ThemedView style={styles.center}>
        <Stack.Screen options={{ title: '' }} />
        <ThemedText type="small" themeColor="textSecondary">
          Bu işlem bulunamadı ya da silinmiş.
        </ThemedText>
      </ThemedView>
    );
  }

  const isTransfer = tx.kind === 'transfer';
  const isIn = tx.direction === 'in';
  const confirmDelete = () => {
    Alert.alert('İşlemi sil', 'Bu işlem silinsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          deleteTransaction(tx.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: TX_KIND_LABELS[tx.kind] }} />
      <SafeAreaView edges={['bottom']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.amountBox}>
            {/* Unsigned and uncolored for a transfer — the shop is neither up nor
                down by this amount, it just holds it somewhere else. */}
            <MoneyText
              kurus={isTransfer ? tx.amount : isIn ? tx.amount : -tx.amount}
              tone={isTransfer ? 'neutral' : 'auto'}
              type="title"
              showPlus={!isTransfer}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {dayLabel(tx.txDate)}
            </ThemedText>
          </View>

          <Card>
            <Row label="Tür" value={TX_KIND_LABELS[tx.kind]} last={false} />
            {isTransfer ? (
              <Row
                label="Nereden → Nereye"
                value={`${tx.kasaType ? KASA_LABELS[tx.kasaType] : '?'} → ${
                  tx.toKasaType ? KASA_LABELS[tx.toKasaType] : '?'
                }`}
                last={false}
              />
            ) : (
              <Row
                label="Ödeme"
                value={tx.kasaType ? KASA_LABELS[tx.kasaType] : 'Veresiye'}
                last={false}
              />
            )}
            {tx.categoryName ? (
              <Row
                label="Kategori"
                value={tx.categoryName}
                icon={categoryIcon(tx.categoryIcon)}
                last={false}
              />
            ) : null}
            {tx.contactName ? (
              <Row
                label="Cari"
                value={tx.contactName}
                onPress={tx.contactId ? () => router.push(`/cari/${tx.contactId}`) : undefined}
                last={false}
              />
            ) : null}
            <Row label="Tarih" value={tx.txDate} last />
          </Card>

          {tx.description ? <Note title="AÇIKLAMA" body={tx.description} /> : null}
          {tx.note ? <Note title="NOT" body={tx.note} /> : null}

          {tx.receiptUri ? (
            <View style={styles.receiptBox}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
                FİŞ
              </ThemedText>
              <Pressable onPress={() => setZoomed(true)}>
                <Image source={{ uri: tx.receiptUri }} style={styles.receipt} contentFit="cover" />
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <Pressable
            onPress={() =>
              router.push(`/transaction/new?accountId=${tx.accountId}&editId=${tx.id}`)
            }
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: theme.text, opacity: pressed ? 0.8 : 1 },
            ]}>
            <Ionicons name="create-outline" size={18} color={theme.background} />
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              Düzenle
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={confirmDelete}
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: theme.hairline, opacity: pressed ? 0.6 : 1 },
            ]}>
            <Ionicons name="trash-outline" size={18} color={theme.expense} />
            <ThemedText type="smallBold" style={{ color: theme.expense }}>
              Sil
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>

      <Modal visible={zoomed} transparent animationType="fade" onRequestClose={() => setZoomed(false)}>
        <Pressable style={styles.zoomBackdrop} onPress={() => setZoomed(false)}>
          <Image
            source={{ uri: tx.receiptUri ?? '' }}
            style={styles.zoomImage}
            contentFit="contain"
          />
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

function Row({
  label,
  value,
  icon,
  onPress,
  last,
}: {
  label: string;
  value: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
  last: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomColor: last ? 'transparent' : theme.hairline,
          opacity: pressed && onPress ? 0.6 : 1,
        },
      ]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.rowValue}>
        {icon ? <Ionicons name={icon} size={16} color={theme.textSecondary} /> : null}
        <ThemedText type="small">{value}</ThemedText>
        {onPress ? <Ionicons name="chevron-forward" size={15} color={theme.faint} /> : null}
      </View>
    </Pressable>
  );
}

function Note({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.noteBox}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      <Card style={styles.noteCard}>
        <ThemedText type="small">{body}</ThemedText>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.five },
  amountBox: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sectionTitle: { letterSpacing: 1.2, fontSize: 11, marginLeft: Spacing.one },
  noteBox: { gap: Spacing.two },
  noteCard: { paddingVertical: Spacing.three },
  receiptBox: { gap: Spacing.two },
  receipt: { width: '100%', height: 220, borderRadius: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.four, paddingBottom: Spacing.three },
  primary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  zoomBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomImage: { width: '100%', height: '80%' },
});
