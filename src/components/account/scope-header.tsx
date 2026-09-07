import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Shows (and, when tappable, switches) which account a tab is scoped to. */
export function ScopeHeader({
  name,
  color,
  onPress,
}: {
  name: string;
  color: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.6 : 1 }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText type="smallBold" themeColor="text">
        {name}
      </ThemedText>
      {onPress ? <Ionicons name="chevron-down" size={15} color={theme.textSecondary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
