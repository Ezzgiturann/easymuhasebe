import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The ONLY entry point to the keypad, on the İşlemler tab — the bottom bar's
 * raised button opens the assistant instead. Remove this and nothing in the app
 * can record a transaction.
 */
export function AddTransactionButton({ accountId }: { accountId: string }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/transaction/new?accountId=${accountId}`)}
      accessibilityLabel="Yeni işlem ekle"
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: theme.text, opacity: pressed ? 0.8 : 1 },
      ]}>
      <Ionicons name="add" size={24} color={theme.background} />
      <ThemedText type="smallBold" style={{ color: theme.background }}>
        İşlem ekle
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing.four,
    bottom: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
