import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { LockScreen } from '@/components/lock-screen';
import { SignInScreen } from '@/components/sign-in-screen';
import { Colors } from '@/constants/theme';
import { DatabaseProvider } from '@/db/provider';
import { useAutoSync } from '@/hooks/use-auto-sync';
import { LockProvider, useLock } from '@/hooks/use-lock';
import { SelectedAccountProvider } from '@/hooks/use-selected-account';
import { SessionProvider, useSession } from '@/hooks/use-session';
import { ThemePreferenceProvider, useThemePreference } from '@/hooks/use-theme-preference';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ThemePreferenceProvider>
      <RootContent />
    </ThemePreferenceProvider>
  );
}

/** Split out so it can read the resolved scheme from the provider above it. */
function RootContent() {
  const { scheme } = useThemePreference();
  const colors = Colors[scheme];

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <DatabaseProvider>
        {/* Session first: the selected-account list is scoped to the signed-in
            user, so asking for it before the session is known returns nothing
            and the app reports having no ledger at all. */}
        <SessionProvider>
          <LockProvider>
            <SelectedAccountProvider>
              <AppGate>
                <Stack
                  screenOptions={{
                    // Only the chevron. iOS labels the back button with the
                    // previous screen's title, and the tab group has none — so
                    // every screen opened from a tab read "‹ (tabs)", the raw
                    // route name, to the user.
                    headerBackButtonDisplayMode: 'minimal',
                    headerStyle: { backgroundColor: colors.background },
                    headerTintColor: colors.text,
                    headerShadowVisible: false,
                    contentStyle: { backgroundColor: colors.background },
                  }}>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="account/new" options={{ presentation: 'modal', title: 'Yeni Hesap' }} />
                  <Stack.Screen name="join" options={{ presentation: 'modal', title: 'Davet kodu' }} />
                  <Stack.Screen
                    name="transaction/new"
                    options={{ presentation: 'modal', title: 'Yeni İşlem' }}
                  />
                  <Stack.Screen name="transaction/[id]" options={{ title: '' }} />
                  <Stack.Screen name="chat" options={{ presentation: 'modal', title: 'Yardımcı' }} />
                  <Stack.Screen name="search" options={{ title: 'Ara' }} />
                  <Stack.Screen name="cari/[contactId]" options={{ title: '' }} />
                  <Stack.Screen name="category/[id]" options={{ title: '' }} />
                  <Stack.Screen name="cari/new" options={{ presentation: 'modal', title: 'Yeni Cari' }} />
                  <Stack.Screen name="profile" options={{ title: 'Profil' }} />
                  <Stack.Screen name="share/[id]" options={{ title: 'Paylaş' }} />
                  <Stack.Screen name="lock/setup" options={{ presentation: 'modal', title: 'PIN' }} />
                </Stack>
              </AppGate>
            </SelectedAccountProvider>
          </LockProvider>
        </SessionProvider>
      </DatabaseProvider>
      <AnimatedSplashOverlay />
    </ThemeProvider>
  );
}

/**
 * What stands in front of the ledger, in order: sign in once on this device,
 * then the PIN on every cold start (and after a minute in the background).
 *
 * Both are rendered in place of the navigator rather than pushed as routes —
 * a lock you can navigate away from is not a lock, and there is no back button
 * that could strand the user behind it.
 */
function AppGate({ children }: { children: React.ReactNode }) {
  const { signedIn } = useSession();
  const { locked, unlock } = useLock();
  // Called before the early returns below: a hook that only runs on some renders
  // is one React will refuse. It does nothing while signed out.
  useAutoSync();

  if (!signedIn) return <SignInScreen />;
  if (locked) return <LockScreen onUnlock={unlock} />;
  return <>{children}</>;
}
