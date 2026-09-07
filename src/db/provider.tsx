import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import migrations from '../../drizzle/migrations';
import { db } from './client';
import { loadDeviceId } from './device';

/**
 * Applies pending migrations at startup and gates the app until the local DB is
 * ready. The native splash stays up until `success`, so users never see a
 * half-migrated screen.
 *
 * The device id is read here for the same reason: the mutation layer stamps it on
 * every row and is synchronous, so it has to be in memory before any screen that
 * could write one exists.
 */
export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const { success, error } = useMigrations(db, migrations);
  const [deviceReady, setDeviceReady] = useState(false);

  useEffect(() => {
    // `loadDeviceId` swallows storage failures and falls back to an in-memory id,
    // so there is no error branch to handle — it always resolves.
    loadDeviceId().finally(() => setDeviceReady(true));
  }, []);

  if (error) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="subtitle">Veritabanı hatası</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {error.message}
        </ThemedText>
      </ThemedView>
    );
  }

  if (!success || !deviceReady) {
    // Keep the splash overlay; render nothing until migrations finish.
    return null;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
});
