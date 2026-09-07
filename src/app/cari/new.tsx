import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Segmented } from '@/components/segmented';
import { KeyboardAwareView } from '@/components/keyboard-aware-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { createContact, updateContact } from '@/db/mutations/contacts';
import { contactQuery } from '@/db/queries/contacts';
import { useTheme } from '@/hooks/use-theme';
import { kurusToInput, parseAmountToKurus } from '@/utils/money';

type Dir = 'owes_us' | 'we_owe';

/** Creates a cari, or edits one when `editId` is present — one form, two modes. */
export default function NewContactScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { accountId, editId } = useLocalSearchParams<{ accountId: string; editId?: string }>();

  const editing = useMemo(() => (editId ? contactQuery(editId).all()[0] : undefined), [editId]);

  const [name, setName] = useState(() => editing?.name ?? '');
  const [phone, setPhone] = useState(() => editing?.phone ?? '');
  const [openingStr, setOpeningStr] = useState(() =>
    editing && editing.openingBalance !== 0 ? kurusToInput(Math.abs(editing.openingBalance)) : '',
  );
  const [dir, setDir] = useState<Dir>(() =>
    editing && editing.openingBalance < 0 ? 'we_owe' : 'owes_us',
  );
  const [termStr, setTermStr] = useState(() =>
    editing?.paymentTermDays != null ? String(editing.paymentTermDays) : '',
  );

  const canSave = name.trim().length > 0;

  const onSave = () => {
    if (!canSave) return;
    const magnitude = parseAmountToKurus(openingStr);
    const openingBalance = dir === 'owes_us' ? magnitude : -magnitude;

    // Blank means "no agreed term", which is different from 0 days — with null
    // this contact is simply never reported as late.
    const digits = termStr.replace(/\D/g, '');
    const paymentTermDays = digits.length > 0 ? Number(digits) : null;

    const fields = { name, phone: phone || null, openingBalance, paymentTermDays };
    if (editId) updateContact(editId, fields);
    else createContact({ accountId, ...fields });
    router.dismiss();
  };

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.faint },
  ];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: editId ? 'Cariyi Düzenle' : 'Yeni Cari' }} />
      <SafeAreaView edges={['bottom']} style={styles.safe}>
        {/* Holds the Kaydet button down, and shrinks so the keyboard cannot
            cover it — the space-between has to live on whatever resizes. */}
        <KeyboardAwareView style={styles.body}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <ThemedText type="small" themeColor="textSecondary">
              İsim
            </ThemedText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Örn. Ahmet Yılmaz"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
              autoFocus
            />

            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Telefon (opsiyonel)
            </ThemedText>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="05xx xxx xx xx"
              placeholderTextColor={theme.textSecondary}
              keyboardType="phone-pad"
              style={inputStyle}
            />

            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Başlangıç bakiyesi (opsiyonel)
            </ThemedText>
            <TextInput
              value={openingStr}
              onChangeText={setOpeningStr}
              placeholder="0,00"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              style={inputStyle}
            />
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Ödeme süresi (opsiyonel)
            </ThemedText>
            <TextInput
              value={termStr}
              onChangeText={setTermStr}
              placeholder="Örn. 30 — kaç gün içinde öder?"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              style={inputStyle}
            />
            <ThemedText type="small" themeColor="textSecondary">
              Boş bırakırsan bu cari hiç gecikmiş sayılmaz.
            </ThemedText>

            <View style={styles.dirWrap}>
              <Segmented<Dir>
                value={dir}
                onChange={setDir}
                options={[
                  { value: 'owes_us', label: 'Bana borçlu' },
                  { value: 'we_owe', label: 'Benim borcum' },
                ]}
              />
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
  body: { flex: 1, justifyContent: 'space-between' },
  form: { padding: Spacing.three, gap: Spacing.two },
  label: { marginTop: Spacing.three },
  input: { borderRadius: Spacing.three, padding: Spacing.three, fontSize: 17, borderWidth: 1 },
  dirWrap: { marginTop: Spacing.two },
  saveButton: {
    margin: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
});
