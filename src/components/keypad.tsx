import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface KeypadProps {
  /** Called with the key pressed: '0'-'9', the `leftKey`, or 'del'. */
  onKey: (key: string) => void;
  /** Bottom-left key. Null leaves the slot empty — a PIN has no decimal point. */
  leftKey?: string | null;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** The numeric keypad — the first thing the user sees when adding a movement. */
export function Keypad({ onKey, leftKey = ',' }: KeypadProps) {
  const theme = useTheme();
  const keys = [...DIGITS, leftKey, '0', 'del'];

  return (
    <View style={styles.grid}>
      {keys.map((key, i) =>
        key === null ? (
          // Holds the grid position so '0' stays centred under '8'.
          <View key={`blank-${i}`} style={styles.key} />
        ) : (
          <Pressable
            key={key}
            onPress={() => onKey(key)}
            style={({ pressed }) => [
              styles.key,
              { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
            ]}>
            <ThemedText type="title" style={styles.keyText}>
              {key === 'del' ? '⌫' : key}
            </ThemedText>
          </Pressable>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  key: {
    width: '31.5%',
    flexGrow: 1,
    height: 56,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 24 },
});
