import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AccountSwitcher } from '@/components/account-switcher';
import { ScopeHeader } from '@/components/account/scope-header';
import { SummaryTab } from '@/components/account/summary-tab';
import { EmptyState } from '@/components/empty-state';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { accountQuery } from '@/db/queries/accounts';
import { useSelectedAccount } from '@/hooks/use-selected-account';

export default function OzetScreen() {
  const router = useRouter();
  const { accountId, setAccountId } = useSelectedAccount();
  const { data: accounts } = useLiveQuery(accountQuery(accountId ?? ''), [accountId]);
  const account = accounts?.[0];
  const [switcherOpen, setSwitcherOpen] = useState(false);

  if (!account) {
    return (
      <ThemedView style={styles.center}>
        <EmptyState
          icon="pie-chart-outline"
          title="Özetleyecek bir şey yok"
          actionLabel="Hesap Oluştur"
          onAction={() => router.push('/account/new')}
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Tappable, like the identical header on İşlemler and in the assistant.
          Leaving it inert here made the same bar look broken on one tab. */}
      <ScopeHeader name={account.name} color={account.color} onPress={() => setSwitcherOpen(true)} />
      <SummaryTab accountId={account.id} />
      <AccountSwitcher
        visible={switcherOpen}
        selectedId={account.id}
        onSelect={setAccountId}
        onClose={() => setSwitcherOpen(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
});
