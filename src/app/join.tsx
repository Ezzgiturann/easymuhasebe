import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { KeyboardAwareView } from '@/components/keyboard-aware-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { acceptInvite, InviteError, normalizeCode } from '@/share/invites';
import { resetCursor } from '@/sync/cursor';
import { sync } from '@/sync/engine';

/**
 * Bir başkasının hesabına davet koduyla katılma.
 *
 * Kod, bağlantı değil. Derin bağlantılar Expo Go'da kırılgan çıktı ve WhatsApp'tan
 * gelen bir bağlantıya dokunmak çoğu zaman tarayıcı açıyor; sekiz karakter elle de
 * yazılır, sesli de okunur.
 */
export default function JoinScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { userId } = useSession();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const ready = normalizeCode(code).length >= 6 && !busy;

  const onJoin = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const result = await acceptInvite(normalizeCode(code));
      // İmleci sıfırlamadan senkron bu hesabı GETİRMEZ: senkron "şu tarihten
      // sonra değişenleri ver" diye soruyor, katılınan defterin satırları ise
      // bizim imlecimizden çok daha eski. Bir kez her şeyi baştan okumak, bu
      // durumun bariz doğru cevabı.
      if (userId) await resetCursor(userId);
      // Üyelik sunucuda yazıldı; hesabın kendisi bu telefona ancak senkronla
      // iniyor. Beklemeden dönseydik kullanıcı boş listeye bakardı.
      await sync();
      Alert.alert('Katıldın', `"${result.accountName}" hesabı artık listende.`);
      router.dismiss();
    } catch (e) {
      Alert.alert('Olmadı', e instanceof InviteError ? e.message : 'Tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Davet kodu' }} />
      <KeyboardAwareView>
        <View style={styles.content}>
          <ThemedText type="small" themeColor="textSecondary">
            Sana gönderilen sekiz karakterli kodu yaz.
          </ThemedText>

          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="ABCD2345"
            placeholderTextColor={theme.faint}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={12}
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: theme.faint,
              },
            ]}
          />

          <Pressable
            onPress={() => void onJoin()}
            disabled={!ready}
            style={[
              styles.button,
              { backgroundColor: ready ? theme.text : theme.backgroundSelected },
            ]}>
            {busy ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText type="smallBold" style={{ color: ready ? theme.background : theme.textSecondary }}>
                Katıl
              </ThemedText>
            )}
          </Pressable>
        </View>
      </KeyboardAwareView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 22,
    letterSpacing: 4,
    textAlign: 'center',
  },
  button: {
    height: 48,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
