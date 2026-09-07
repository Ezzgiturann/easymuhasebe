import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { MoneyText } from '@/components/money-text';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { allAccountsQuery } from '@/db/queries/accounts';
import { allMembershipsQuery } from '@/db/queries/members';
import { accessibleAccounts } from '@/utils/accessible-accounts';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';

interface AccountSwitcherProps {
  visible: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** Bottom-sheet to switch which account the Cariler / Özet tab is scoped to. */
export function AccountSwitcher({ visible, selectedId, onSelect, onClose }: AccountSwitcherProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useSession();
  const { data: allAccounts } = useLiveQuery(allAccountsQuery());
  const { data: memberships } = useLiveQuery(allMembershipsQuery());
  const data = accessibleAccounts(allAccounts ?? [], memberships ?? [], userId);
  const list = data ?? [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + Spacing.three }]}>
        <View style={[styles.handle, { backgroundColor: theme.hairline }]} />
        <ThemedText type="subtitle" style={styles.title}>
          Hesap seç
        </ThemedText>
        <ScrollView>
          {list.map((a) => {
            const active = a.id === selectedId;
            return (
              <Pressable
                key={a.id}
                onPress={() => {
                  onSelect(a.id);
                  onClose();
                }}
                style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
                <Avatar label={a.name} color={a.color} />
                <ThemedText type="default" style={styles.name} numberOfLines={1}>
                  {a.name}
                </ThemedText>
                <MoneyText kurus={a.cachedBalance} tone="neutral" type="small" />
                {active ? (
                  <Ionicons name="checkmark" size={20} color={theme.text} style={styles.check} />
                ) : (
                  <View style={styles.check} />
                )}
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => {
              onClose();
              router.push('/account/new');
            }}
            style={({ pressed }) => [styles.addRow, { opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="add-circle-outline" size={22} color={theme.textSecondary} />
            <ThemedText type="default" themeColor="textSecondary">
              Yeni hesap
            </ThemedText>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    maxHeight: '70%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.three },
  title: { fontSize: 22, marginBottom: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  name: { flex: 1 },
  check: { width: 24, alignItems: 'center' },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    marginTop: Spacing.one,
  },
});
