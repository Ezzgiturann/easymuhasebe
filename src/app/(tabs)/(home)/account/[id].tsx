import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ContactsTab } from '@/components/account/contacts-tab';
import { KasaBreakdown } from '@/components/account/kasa-breakdown';
import { MoneyText } from '@/components/money-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KASA_LABELS } from '@/constants/labels';
import { Spacing } from '@/constants/theme';
import { deleteAccount } from '@/db/mutations/accounts';
import { accountQuery } from '@/db/queries/accounts';
import { useTheme } from '@/hooks/use-theme';

/**
 * What belongs to ONE account and nothing else: its cariler, its balance, and
 * the account-level actions (share, delete).
 *
 * Deliberately does NOT list transactions — the İşlemler tab already shows them
 * for the selected account, and opening an account selects it, so the tab is
 * already pointed here. Two lists of the same rows is the bug this screen used
 * to have.
 */
export default function AccountDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: accounts } = useLiveQuery(accountQuery(id), [id]);
  const account = accounts?.[0];

  const confirmDelete = () => {
    Alert.alert('Hesabı sil', `“${account?.name}” hesabı listeden kaldırılsın mı?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          deleteAccount(id);
          router.back();
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: account?.name ?? '',
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => router.push(`/account/new?editId=${id}`)}
                hitSlop={8}
                accessibilityLabel="Hesabı düzenle">
                <Ionicons name="create-outline" size={22} color={theme.text} />
              </Pressable>
              <Pressable onPress={confirmDelete} hitSlop={8} accessibilityLabel="Hesabı sil">
                <Ionicons name="trash-outline" size={22} color={theme.expense} />
              </Pressable>
            </View>
          ),
        }}
      />
      <View style={styles.topRow}>
        <View style={styles.balanceBox}>
          <ThemedText type="small" themeColor="textSecondary">
            Kasa bakiyesi
          </ThemedText>
          <MoneyText kurus={account?.cachedBalance ?? 0} tone="neutral" type="subtitle" />
        </View>
        <Pressable
          onPress={() => router.push(`/share/${id}`)}
          style={({ pressed }) => [
            styles.shareBtn,
            { backgroundColor: theme.surface, borderColor: theme.hairline, opacity: pressed ? 0.6 : 1 },
          ]}>
          <Ionicons name="share-social-outline" size={16} color={theme.text} />
          <ThemedText type="smallBold" themeColor="text">
            Paylaş
          </ThemedText>
        </Pressable>
      </View>
      <View style={styles.breakdownBox}>
        <KasaBreakdown accountId={id} showTotal={false} />

        {/* Reachable without hunting for the pencil in the header: someone
            looking at "Kasa bakiyesi 0,00" wants to correct it from here, and
            the opening balance is the only part of that number they can set
            directly. */}
        <Pressable
          onPress={() => router.push(`/account/new?editId=${id}`)}
          accessibilityLabel="Başlangıç bakiyesini düzenle"
          style={({ pressed }) => [
            styles.openingRow,
            { borderColor: theme.hairline, opacity: pressed ? 0.6 : 1 },
          ]}>
          <Ionicons name="flag-outline" size={18} color={theme.textSecondary} />
          <View style={styles.openingText}>
            <ThemedText type="small">Başlangıç bakiyesi</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {account?.openingBalance
                ? `${KASA_LABELS[account.openingKasaType ?? 'nakit']} kasasında`
                : 'Kayda başladığın andaki kasa mevcudun'}
            </ThemedText>
          </View>
          <MoneyText kurus={account?.openingBalance ?? 0} tone="neutral" type="small" />
          <Ionicons name="chevron-forward" size={15} color={theme.faint} />
        </Pressable>
      </View>
      <View style={styles.sectionRow}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
          CARİLER
        </ThemedText>
        <Pressable
          onPress={() => router.push(`/cari/new?accountId=${id}`)}
          style={({ pressed }) => [
            styles.addPill,
            { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.6 : 1 },
          ]}>
          <Ionicons name="person-add-outline" size={16} color={theme.text} />
          <ThemedText type="smallBold" themeColor="text">
            Cari ekle
          </ThemedText>
        </Pressable>
      </View>
      <ContactsTab accountId={id} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerActions: { flexDirection: 'row', gap: Spacing.four },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
  },
  balanceBox: { gap: Spacing.half },
  breakdownBox: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.one, gap: Spacing.two },
  openingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  openingText: { flex: 1, gap: 1 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  sectionTitle: { letterSpacing: 1.2, fontSize: 11 },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: 999,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.one,
  },
});
