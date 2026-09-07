import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

interface AvatarProps {
  label: string;
  /** Fill color. When omitted, a neutral surface is used (for contacts). */
  color?: string;
  size?: number;
}

/**
 * A rounded-square initial badge for accounts (colored) and contacts (neutral).
 *
 * The neutral variant uses `backgroundSelected`, not `backgroundElement`: the
 * latter is only 1.04:1 against the page background (#F1EEE9 on #F5F3EF), so an
 * avatar placed straight on the paper ground — as the header profile button is —
 * vanished entirely. The initial is drawn in full `text` for the same reason;
 * `textSecondary` on that fill was 3.11:1, leaving a faint letter with no body.
 */
export function Avatar({ label, color, size = 38 }: AvatarProps) {
  const theme = useTheme();
  const initial = (label.trim()[0] ?? '?').toLocaleUpperCase('tr-TR');
  const neutral = !color;

  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: size / 3,
          backgroundColor: color ?? theme.backgroundSelected,
        },
      ]}>
      <ThemedText
        type="smallBold"
        style={[styles.initial, { color: neutral ? theme.text : '#FFFFFF' }]}>
        {initial}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 16 },
});
