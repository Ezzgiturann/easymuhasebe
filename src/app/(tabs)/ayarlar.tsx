import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import {
  biometricAvailable,
  clearPin,
  isBiometricEnabled,
  setBiometricEnabled,
} from '@/lock/store';
import { Card } from '@/components/card';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { BackupError, restoreBackup, type BackupFile } from '@/db/backup';
import { useLock } from '@/hooks/use-lock';
import { useSession } from '@/hooks/use-session';
import { resetCursor } from '@/sync/cursor';
import { sync } from '@/sync/engine';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference, type ThemePreference } from '@/hooks/use-theme-preference';
import { BackupFileError, pickBackup, shareBackup } from '@/utils/backup-file';

type IconName = keyof typeof Ionicons.glyphMap;

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Açık' },
  { value: 'dark', label: 'Koyu' },
];

export default function AyarlarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const { scheme, setPreference } = useThemePreference();
  const { enabled: lockEnabled, refresh: refreshLock } = useLock();
  const { email, userId, signOut } = useSession();

  /**
   * Says what stays before it says anything else. On an app whose ledger has no
   * copy anywhere, "çıkış yap" is the button people expect to wipe the device.
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

  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioOn, setBioOn] = useState(false);

  // Re-read on every focus: the PIN is set on another screen, and a stale switch
  // here would show the lock off right after the user turned it on.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([biometricAvailable(), isBiometricEnabled()])
        .then(([available, on]) => {
          if (!active) return;
          setBioAvailable(available);
          setBioOn(on);
        })
        .catch(() => {});
      void refreshLock();
      return () => {
        active = false;
      };
    }, [refreshLock]),
  );

  const onToggleLock = (on: boolean) => {
    if (on) {
      router.push('/lock/setup');
      return;
    }
    Alert.alert('Kilit kapatılsın mı?', 'Uygulama bundan sonra PIN sormadan açılır.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kapat',
        style: 'destructive',
        onPress: () => {
          clearPin()
            .then(refreshLock)
            .then(() => setBioOn(false))
            .catch(() => Alert.alert('Olmadı', 'Kilit kapatılamadı, tekrar dene.'));
        },
      },
    ]);
  };

  const onToggleBiometric = (on: boolean) => {
    setBioOn(on);
    setBiometricEnabled(on).catch(() => setBioOn(!on));
  };

  const onExport = async () => {
    if (busy) return;
    setBusy('export');
    try {
      const result = await shareBackup();
      if (result) {
        Alert.alert(
          'Yedek hazır',
          `${result.total} kayıt yedeklendi.\n\nNot: fiş fotoğrafları yedeğe dahil değildir.`,
        );
      }
    } catch (e) {
      Alert.alert('Yedeklenemedi', messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  const onImport = async () => {
    if (busy) return;
    setBusy('import');
    try {
      const file = await pickBackup();
      if (file) confirmRestore(file, userId);
    } catch (e) {
      Alert.alert('Yedek okunamadı', messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="GÖRÜNÜM">
          <View style={styles.themeRow}>
            <Segmented<ThemePreference>
              options={THEME_OPTIONS}
              value={scheme}
              onChange={setPreference}
            />
          </View>
        </Section>

        <Section title="GÜVENLİK">
          <Row
            icon="lock-closed-outline"
            label="Uygulama kilidi"
            hint="Açılışta PIN sorulur"
            right={
              <Switch
                value={lockEnabled}
                onValueChange={onToggleLock}
                trackColor={{ true: theme.text }}
              />
            }
            last={!lockEnabled}
          />
          {lockEnabled ? (
            <>
              <Row
                icon="keypad-outline"
                label="PIN’i değiştir"
                onPress={() => router.push('/lock/setup')}
                last={!bioAvailable}
              />
              {bioAvailable ? (
                <Row
                  icon="scan-outline"
                  label="Yüz / parmak izi"
                  hint="PIN yerine hızlı açılış"
                  right={
                    <Switch
                      value={bioOn}
                      onValueChange={onToggleBiometric}
                      trackColor={{ true: theme.text }}
                    />
                  }
                  last
                />
              ) : null}
            </>
          ) : null}
        </Section>
        <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
          PIN’ini unutursan geri almanın yolu yok.
        </ThemedText>

        <Section title="PAYLAŞIM">
          <Row
            icon="enter-outline"
            label="Davet kodu ile katıl"
            hint="Başkasının hesabına sana verilen kodla katıl"
            onPress={() => router.push('/join')}
            last
          />
        </Section>

        <Section title="YEDEKLEME">
          <Row
            icon="share-outline"
            label="Yedeği dışa aktar"
            hint="Tüm verini tek dosyaya yazar"
            onPress={onExport}
            busy={busy === 'export'}
            last={false}
          />
          <Row
            icon="download-outline"
            label="Yedekten geri yükle"
            hint="Mevcut verinin yerine yedektekini yazar"
            onPress={onImport}
            busy={busy === 'import'}
            last
          />
        </Section>
        <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
          Verin yalnızca bu telefonda. Fiş fotoğrafları yedeğe dahil değildir.
        </ThemedText>

        <Section title="HAKKINDA">
          <Row icon="information-circle-outline" label="Sürüm" value="1.0.0" last />
        </Section>

        {/* Last on the page on purpose: people look for "çıkış yap" in Settings,
            but at the bottom, past everything they might actually want to change.
            Putting it near the top invites the mis-tap. */}
        <Section title="HESAP">
          <Row
            icon="person-outline"
            label={email ?? 'Hesap'}
            hint={email ? 'Giriş yapılan hesap' : undefined}
            last={false}
          />
          <Row
            icon="log-out-outline"
            label="Çıkış yap"
            onPress={confirmSignOut}
            last
          />
        </Section>
      </ScrollView>
    </ThemedView>
  );
}

/**
 * Restore replaces everything, so the confirmation states both sides: what is
 * coming in, and that what is here now goes away.
 */
/**
 * `userId` decides what "restore" means now that the ledger also lives on a
 * server. Signed out it is the old behaviour: the phone is the only copy.
 */
function confirmRestore(file: BackupFile, userId: string | null) {
  const summary = [
    `${file.counts.accounts ?? 0} hesap`,
    `${file.counts.transactions ?? 0} işlem`,
    `${file.counts.contacts ?? 0} cari`,
  ].join(', ');

  const taken = new Date(file.exportedAt);
  const when = Number.isNaN(taken.getTime()) ? 'bilinmeyen tarih' : taken.toLocaleString('tr-TR');

  // Said plainly because it is the part people do not expect: the backup is not
  // the last word any more. Restoring wipes the phone and then the cloud copy
  // arrives on top of it, so a record the backup is missing comes back.
  const cloudNote = userId
    ? '\n\nHesabın buluta bağlı: geri yükledikten sonra veriler buluttakiyle eşitlenecek.'
    : '';

  Alert.alert(
    'Geri yüklensin mi?',
    `Yedek ${when} tarihli ve ${summary} içeriyor.\n\n` +
      'Şu anki verilerinin TAMAMI silinip bunlarla değiştirilecek. Bu işlem geri alınamaz.' +
      cloudNote,
    [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Geri yükle',
        style: 'destructive',
        onPress: () => {
          let result;
          try {
            result = restoreBackup(file);
          } catch (e) {
            Alert.alert('Geri yüklenemedi', messageOf(e));
            return;
          }

          if (!userId) {
            Alert.alert('Geri yüklendi', `${result.total} kayıt yazıldı.`);
            return;
          }

          // The restore deleted rows physically, tombstones included, and left
          // the sync marks where they were. Without resetting them the engine
          // would ask only for what changed since — and everything it just
          // erased is older than that, so the two copies would silently drift.
          // Re-reading the whole ledger once is the only answer that converges.
          void resetCursor(userId)
            .then(() => sync())
            .finally(() => {
              Alert.alert('Geri yüklendi', `${result.total} kayıt yazıldı ve bulutla eşitlendi.`);
            });
        },
      },
    ],
  );
}

function messageOf(e: unknown): string {
  if (e instanceof BackupError || e instanceof BackupFileError) return e.message;
  return 'Beklenmeyen bir hata oldu.';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      <Card>{children}</Card>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  hint,
  onPress,
  busy,
  right,
  last,
}: {
  icon: IconName;
  label: string;
  value?: string;
  hint?: string;
  onPress?: () => void;
  busy?: boolean;
  /** Replaces the chevron — a switch the row itself does not handle. */
  right?: React.ReactNode;
  last: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || busy}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomColor: last ? 'transparent' : theme.hairline,
          opacity: pressed && onPress ? 0.6 : 1,
        },
      ]}>
      <Ionicons name={icon} size={20} color={theme.textSecondary} />
      <View style={styles.rowBody}>
        <ThemedText type="default">
          {label}
        </ThemedText>
        {hint ? (
          <ThemedText type="small" themeColor="textSecondary">
            {hint}
          </ThemedText>
        ) : null}
      </View>

      {busy ? <ActivityIndicator size="small" color={theme.textSecondary} /> : null}
      {!busy && value ? (
        <ThemedText type="small" themeColor="textSecondary">
          {value}
        </ThemedText>
      ) : null}
      {right ?? null}
      {!busy && !right && onPress ? (
        <Ionicons name="chevron-forward" size={17} color={theme.faint} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  section: { gap: Spacing.one },
  sectionTitle: { letterSpacing: 1.2, fontSize: 11, marginBottom: Spacing.one },
  themeRow: { padding: Spacing.two },
  footnote: { marginTop: -Spacing.two, marginHorizontal: Spacing.one, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: { flex: 1, gap: 1 },
});
