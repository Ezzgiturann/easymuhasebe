import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { KeyboardAwareView } from '@/components/keyboard-aware-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { readProfile, saveProfile } from '@/db/profile';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signOut } = useSession();

  const [name, setName] = useState(() => readProfile()?.displayName ?? '');
  const [phone, setPhone] = useState(() => readProfile()?.phone ?? '');
  const [saved, setSaved] = useState(false);

  const onSave = () => {
    saveProfile({ displayName: name, phone: phone.trim() || null });
    setSaved(true);
  };

  /**
   * Spells out that nothing is deleted. On a local-first app "çıkış yap" is the
   * button people expect to wipe the device, and this ledger has no copy
   * anywhere else — so the dialog says what stays before it says anything else.
   */
  const confirmSignOut = () => {
    Alert.alert(
      'Çıkış yapılsın mı?',
      'Hiçbir işlem, cari veya hesap silinmez. Girmek için parolan gerekecek.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Çıkış yap', style: 'destructive', onPress: () => void signOut() },
      ],
    );
  };

  // No per-input border here: these two sit inside a grouped container, and the
  // outline belongs to the group (see styles.group) — otherwise it reads as
  // boxes inside a box.
  const inputStyle = [styles.input, { color: theme.text }];

  return (
    <ThemedView style={styles.container}>
      <KeyboardAwareView>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.avatarWrap}>
            {name.trim() ? (
              <Avatar label={name} size={84} />
            ) : (
              <Ionicons name="person-circle-outline" size={88} color={theme.textSecondary} />
            )}
            <ThemedText type="subtitle" style={styles.name}>
              {name.trim() || 'Profilini tamamla'}
            </ThemedText>
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            BİLGİLERİM
          </ThemedText>
          {/* `faint`, not `hairline`: hairline is 1.09:1 against the page and
              invisible, and the `backgroundElement` fill alone is 1.04:1 — without
              an outline this group reads as blank paper. */}
          <View
            style={[
              styles.group,
              { backgroundColor: theme.backgroundElement, borderColor: theme.faint },
            ]}>
            <TextInput
              value={name}
              onChangeText={(t) => {
                setName(t);
                setSaved(false);
              }}
              placeholder="Adın"
              placeholderTextColor={theme.textSecondary}
              style={[inputStyle, { borderBottomColor: theme.hairline, borderBottomWidth: StyleSheet.hairlineWidth }]}
            />
            <TextInput
              value={phone}
              onChangeText={(t) => {
                setPhone(t);
                setSaved(false);
              }}
              placeholder="Telefon"
              placeholderTextColor={theme.textSecondary}
              keyboardType="phone-pad"
              style={inputStyle}
            />
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={[styles.label, styles.section]}>
            UYGULAMA
          </ThemedText>
          <Card>
            <LinkRow icon="settings-outline" label="Ayarlar" onPress={() => router.push('/ayarlar')} last />
          </Card>

          <Pressable
            onPress={onSave}
            style={[styles.saveButton, { backgroundColor: theme.text }]}>
            <Ionicons
              name={saved ? 'checkmark' : 'save-outline'}
              size={18}
              color={theme.background}
            />
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              {saved ? 'Kaydedildi' : 'Kaydet'}
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={confirmSignOut}
            style={({ pressed }) => [
              styles.signOut,
              { borderColor: theme.hairline, opacity: pressed ? 0.6 : 1 },
            ]}>
            <Ionicons name="log-out-outline" size={18} color={theme.expense} />
            <ThemedText type="smallBold" style={{ color: theme.expense }}>
              Çıkış yap
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAwareView>
    </ThemedView>
  );
}

function LinkRow({
  icon,
  label,
  value,
  onPress,
  hairline,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  hairline?: string;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: last ? 'transparent' : hairline, opacity: pressed ? 0.6 : 1 },
      ]}>
      <Ionicons name={icon} size={20} color={theme.textSecondary} />
      <ThemedText type="default" themeColor={value ? 'textSecondary' : 'text'} style={styles.rowLabel}>
        {label}
      </ThemedText>
      {value ? (
        <ThemedText type="small" themeColor="textSecondary">
          {value}
        </ThemedText>
      ) : (
        <Ionicons name="chevron-forward" size={17} color={theme.faint} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: Spacing.five },
  avatarWrap: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four },
  name: { fontSize: 22 },
  label: { letterSpacing: 1.2, fontSize: 11, marginLeft: Spacing.one, marginBottom: Spacing.two },
  section: { marginTop: Spacing.four },
  group: { borderRadius: Spacing.three, overflow: 'hidden', borderWidth: 1 },
  input: { padding: Spacing.three, fontSize: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { flex: 1 },
  saveButton: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOut: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
