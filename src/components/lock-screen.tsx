import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Keypad } from '@/components/keypad';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { biometricAvailable, isBiometricEnabled, promptBiometric, verifyPin } from '@/lock/store';
import { PIN_LENGTH } from '@/lock/pin';
import { useTheme } from '@/hooks/use-theme';

interface LockScreenProps {
  onUnlock: () => void;
  /** Shown above the dots; the setup flow reuses this screen with its own copy. */
  title?: string;
  /** Called with the completed PIN instead of checking it, for the setup flow. */
  onComplete?: (pin: string) => void;
  /** Skips the biometric offer — meaningless while choosing a new PIN. */
  allowBiometric?: boolean;
}

/**
 * The PIN pad that stands between someone holding the phone and the ledger.
 *
 * Doubles as the "choose a PIN" / "confirm it" screen via `onComplete`, so the
 * dots, the shake and the keypad behave identically in all three places.
 */
export function LockScreen({ onUnlock, title, onComplete, allowBiometric = true }: LockScreenProps) {
  const theme = useTheme();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [biometricOn, setBiometricOn] = useState(false);
  const checking = useRef(false);

  const tryBiometric = useCallback(async () => {
    if (await promptBiometric()) onUnlock();
  }, [onUnlock]);

  useEffect(() => {
    if (!allowBiometric || onComplete) return;
    let active = true;

    (async () => {
      const on = (await isBiometricEnabled()) && (await biometricAvailable());
      if (!active || !on) return;
      setBiometricOn(true);
      // Offer it straight away: having to tap a button before the face prompt
      // makes biometrics slower than the four digits they replace.
      await tryBiometric();
    })().catch(() => {});

    return () => {
      active = false;
    };
  }, [allowBiometric, onComplete, tryBiometric]);

  const submit = useCallback(
    async (entered: string) => {
      if (checking.current) return;
      checking.current = true;
      try {
        if (onComplete) {
          onComplete(entered);
          setPin('');
          return;
        }
        if (await verifyPin(entered)) {
          onUnlock();
          return;
        }
        setError('PIN yanlış.');
        setPin('');
      } finally {
        checking.current = false;
      }
    },
    [onComplete, onUnlock],
  );

  const onKey = (key: string) => {
    setError(null);
    if (key === 'del') {
      setPin(pin.slice(0, -1));
      return;
    }
    if (pin.length >= PIN_LENGTH) return;

    const next = pin + key;
    setPin(next);
    // Submitting from inside a state updater would make that updater impure, and
    // React is free to run it twice — which would check the PIN twice.
    if (next.length === PIN_LENGTH) void submit(next);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}>
          <Ionicons name="lock-closed-outline" size={30} color={theme.textSecondary} />
          <ThemedText type="default" style={styles.title}>
            {title ?? 'PIN’ini gir'}
          </ThemedText>

          <View style={styles.dots}>
            {Array.from({ length: PIN_LENGTH }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    borderColor: error ? theme.expense : theme.faint,
                    backgroundColor:
                      i < pin.length ? (error ? theme.expense : theme.text) : 'transparent',
                  },
                ]}
              />
            ))}
          </View>

          <ThemedText type="small" themeColor={error ? 'expense' : 'textSecondary'} style={styles.status}>
            {error ?? ' '}
          </ThemedText>

          {biometricOn ? (
            <Pressable
              onPress={tryBiometric}
              style={({ pressed }) => [styles.bio, { opacity: pressed ? 0.6 : 1 }]}>
              <Ionicons name="scan-outline" size={18} color={theme.text} />
              <ThemedText type="smallBold">Yüz / parmak izi ile aç</ThemedText>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.pad}>
          <Keypad onKey={onKey} leftKey={null} />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, justifyContent: 'space-between' },
  top: { alignItems: 'center', gap: Spacing.three, paddingTop: Spacing.six },
  title: { textAlign: 'center' },
  dots: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  status: { minHeight: 20 },
  bio: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  pad: { padding: Spacing.three, paddingBottom: Spacing.four },
});
