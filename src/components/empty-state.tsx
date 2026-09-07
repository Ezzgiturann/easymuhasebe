import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  /** Omit both to state the situation without offering a way out — only correct
   *  when the way out is already visible on screen (a FAB, a pill above). */
  actionLabel?: string;
  onAction?: () => void;
  /** A quieter second way out, when there genuinely are two. */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/**
 * What a screen shows when it has nothing to show.
 *
 * Exists because the app used to say this four different ways, and two of them
 * were a single line of grey text with no button — a new user landing on the
 * İşlemler tab was told "önce bir hesap oluştur" and left to find the button on
 * another tab by themselves.
 */
export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={[styles.iconCircle, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name={icon} size={28} color={theme.textSecondary} />
      </View>
      <ThemedText type="default" style={styles.title}>
        {title}
      </ThemedText>
      {body ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
          {body}
        </ThemedText>
      ) : null}
      {actionLabel && onAction ? (
        // Same filled treatment as the "Yeni Hesap Ekle" pill on Ana Sayfa: in
        // this app a solid ink button is what "the one thing to do here" looks like.
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: theme.text, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Ionicons name="add" size={17} color={theme.background} />
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            {actionLabel}
          </ThemedText>
        </Pressable>
      ) : null}
      {secondaryLabel && onSecondary ? (
        // Deliberately unfilled: there is one main thing to do here and this is
        // not it — but for the person who was invited, it is the only thing.
        <Pressable
          onPress={onSecondary}
          style={({ pressed }) => [styles.secondary, { opacity: pressed ? 0.6 : 1 }]}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {secondaryLabel}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.five,
  },
  secondary: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', lineHeight: 20 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.four,
    paddingVertical: Spacing.two + 2,
    borderRadius: 999,
    marginTop: Spacing.two,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
});
