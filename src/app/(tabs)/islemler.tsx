import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AccountSwitcher } from '@/components/account-switcher';
import { FilterSheet } from '@/components/account/filter-sheet';
import { ScopeHeader } from '@/components/account/scope-header';
import { TransactionsTab } from '@/components/account/transactions-tab';
import { AddTransactionButton } from '@/components/add-transaction-button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { accountQuery } from '@/db/queries/accounts';
import { useSelectedAccount } from '@/hooks/use-selected-account';
import { useTheme } from '@/hooks/use-theme';
import { activeFilterCount, NO_FILTER, type TransactionFilter } from '@/utils/tx-filter';

/** All movements of the selected account. Adding one is the İşlem ekle FAB. */
export default function IslemlerScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { accountId, setAccountId } = useSelectedAccount();
  const { data: accounts } = useLiveQuery(accountQuery(accountId ?? ''), [accountId]);
  const account = accounts?.[0];
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<TransactionFilter>(NO_FILTER);
  const filterCount = activeFilterCount(filter);

  if (!account) {
    return (
      <ThemedView style={styles.center}>
        <EmptyState
          icon="receipt-outline"
          title="Henüz hesabın yok"
          actionLabel="Hesap Oluştur"
          onAction={() => router.push('/account/new')}
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScopeHeader name={account.name} color={account.color} onPress={() => setSwitcherOpen(true)} />

      {/* Lives here rather than on Ana Sayfa because search is scoped to one
          account: sitting directly under the account name and its switcher, the
          scope needs no explaining. Looks like a field but is a button —
          search.tsx owns the real autoFocus input. */}
      <View style={styles.searchWrap}>
        <Pressable
          onPress={() => router.push('/search')}
          accessibilityRole="search"
          accessibilityLabel="Ara"
          style={({ pressed }) => [styles.searchPress, { opacity: pressed ? 0.7 : 1 }]}>
          <Card style={styles.searchBar}>
            <Ionicons name="search" size={18} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              Kişi, açıklama veya tutar ara
            </ThemedText>
          </Card>
        </Pressable>

        {/* Sits beside search rather than in the header: both narrow the same
            list, and the count says at a glance that something is hiding rows. */}
        <Pressable
          onPress={() => setFilterOpen(true)}
          accessibilityLabel="Filtrele"
          style={({ pressed }) => [
            styles.filterBtn,
            {
              backgroundColor: filterCount > 0 ? theme.text : theme.surface,
              borderColor: filterCount > 0 ? theme.text : theme.hairline,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <Ionicons
            name="options-outline"
            size={18}
            color={filterCount > 0 ? theme.background : theme.textSecondary}
          />
          {filterCount > 0 ? (
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              {filterCount}
            </ThemedText>
          ) : null}
        </Pressable>
      </View>

      <TransactionsTab accountId={account.id} filter={filter} />
      <AddTransactionButton accountId={account.id} />
      <AccountSwitcher
        visible={switcherOpen}
        selectedId={account.id}
        onSelect={setAccountId}
        onClose={() => setSwitcherOpen(false)}
      />
      <FilterSheet
        visible={filterOpen}
        filter={filter}
        onChange={setFilter}
        onClose={() => setFilterOpen(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  searchPress: { flex: 1 },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
});
