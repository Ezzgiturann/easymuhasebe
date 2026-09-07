import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useLocalSearchParams } from 'expo-router';

import { TransactionsTab } from '@/components/account/transactions-tab';
import { EmptyState } from '@/components/empty-state';
import { ThemedView } from '@/components/themed-view';
import { StyleSheet } from 'react-native';
import { categoryQuery } from '@/db/queries/categories';
import { NO_FILTER } from '@/utils/tx-filter';

/**
 * The movements behind one bar in Özet.
 *
 * "Kira 3.000,00" used to be a dead end — the number was there and the three
 * entries making it up were not reachable from it. Reuses the same list the
 * İşlemler tab renders, with the same filter mechanism, so a category total and
 * the rows it opens can never count different things.
 */
export default function CategoryTransactionsScreen() {
  const { id, accountId, start, end } = useLocalSearchParams<{
    id: string;
    accountId: string;
    start?: string;
    end?: string;
  }>();

  const { data: categories } = useLiveQuery(categoryQuery(id), [id]);
  const category = categories?.[0];

  // Only ever pushed from Özet with both ids, but a deep link can arrive with
  // neither — and querying on an undefined account is not a screen anyone wants.
  if (!id || !accountId) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState
          icon="pricetag-outline"
          title="Kategori bulunamadı"
          body="Bu kategori silinmiş olabilir. Özet ekranından tekrar dene."
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: category?.name ?? 'Kategori' }} />
      <TransactionsTab
        accountId={accountId}
        filter={{ ...NO_FILTER, categoryId: id, start: start ?? null, end: end ?? null }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
