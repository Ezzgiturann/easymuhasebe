import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KeyboardAwareView } from '@/components/keyboard-aware-view';
import { ACCOUNT_COLORS } from '@/constants/categories';
import { KASA_LABELS } from '@/constants/labels';
import { Spacing } from '@/constants/theme';
import { createAccount, updateAccount } from '@/db/mutations/accounts';
import { accountQuery } from '@/db/queries/accounts';
import { KASA_TYPES, type KasaType } from '@/db/schema/transactions';
import { useSelectedAccount } from '@/hooks/use-selected-account';
import { useTheme } from '@/hooks/use-theme';
import { kurusToInput, parseAmountToKurus } from '@/utils/money';

/** Creates an account, or renames/recolours one when `editId` is present. */
export default function NewAccountScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { setAccountId } = useSelectedAccount();
  const { editId } = useLocalSearchParams<{ editId?: string }>();

  const editing = useMemo(() => (editId ? accountQuery(editId).all()[0] : undefined), [editId]);

  const [name, setName] = useState(() => editing?.name ?? '');
  const [color, setColor] = useState(() => editing?.color ?? ACCOUNT_COLORS[0]);
  const [openingStr, setOpeningStr] = useState(() =>
    editing && editing.openingBalance !== 0 ? kurusToInput(editing.openingBalance) : '',
  );
  const [openingKasa, setOpeningKasa] = useState<KasaType>(
    () => editing?.openingKasaType ?? 'nakit',
  );

  const canSave = name.trim().length > 0;

  const onSave = () => {
    if (!canSave) return;

    const opening = {
      openingBalance: parseAmountToKurus(openingStr),
      openingKasaType: openingKasa,
    };

    if (editId) {
      updateAccount(editId, { name, color, ...opening });
      router.dismiss();
      return;
    }

    const id = createAccount({ name, color, ...opening });
    setAccountId(id);
    router.dismiss();
    // A brand-new account has no cariler yet, so its detail page would be empty.
    // The first useful thing is recording a transaction — land on that tab.
    router.navigate('/islemler');
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: editId ? 'Hesabı Düzenle' : 'Yeni Hesap' }} />
      <SafeAreaView edges={['bottom']} style={styles.safe}>
        {/* The Kaydet button is pinned to the bottom and the name field autofocuses,
            so without this the keyboard opens straight on top of the button. */}
        <KeyboardAwareView>
          {/* A ScrollView, not a plain View: with the keyboard open the wrapper
              shrinks, and a fixed View would simply clip whatever no longer fits
              — which is how the opening-balance field became invisible. */}
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled">
            <ThemedText type="small" themeColor="textSecondary">
              Hesap adı
            </ThemedText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Örn. Dükkan, Cebim, Ortaklık"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.faint },
              ]}
              autoFocus
            />

            {/* Without this the only way to record cash that was already in the
                till was to invent an income, which inflated that month's takings
                for good. Optional: an empty field means "başlangıç sıfır". */}
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Başlangıç bakiyesi (opsiyonel)
            </ThemedText>
            <TextInput
              value={openingStr}
              onChangeText={setOpeningStr}
              placeholder="0,00"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.faint },
              ]}
            />
            <View style={styles.kasaRow}>
              {KASA_TYPES.map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setOpeningKasa(k)}
                  style={[
                    styles.chip,
                    { backgroundColor: k === openingKasa ? theme.text : theme.backgroundElement },
                  ]}>
                  <ThemedText
                    type="small"
                    style={{ color: k === openingKasa ? theme.background : theme.text }}>
                    {KASA_LABELS[k]}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Kayda başladığın andaki kasa mevcudun. Gelir olarak sayılmaz.
            </ThemedText>

            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Renk
            </ThemedText>
            <View style={styles.colors}>
              {ACCOUNT_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c, borderColor: c === color ? theme.text : 'transparent' },
                  ]}
                />
              ))}
            </View>
          </ScrollView>

          <Pressable
            onPress={onSave}
            disabled={!canSave}
            style={[styles.saveButton, { backgroundColor: canSave ? theme.text : theme.backgroundSelected }]}>
            <ThemedText type="smallBold" style={{ color: canSave ? theme.background : theme.textSecondary }}>
              {editId ? 'Güncelle' : 'Kaydet'}
            </ThemedText>
          </Pressable>
        </KeyboardAwareView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  fill: { flex: 1 },
  form: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.four },
  label: { marginTop: Spacing.three },
  input: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    fontSize: 17,
  },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  kasaRow: { flexDirection: 'row', gap: Spacing.two },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 999 },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
  },
  saveButton: {
    margin: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
});
