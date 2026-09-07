import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useThemePreference } from '@/hooks/use-theme-preference';

export default function HomeStackLayout() {
  const { scheme } = useThemePreference();
  const colors = Colors[scheme];

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="index" options={{ title: 'Hesaplarım' }} />
      <Stack.Screen name="account/[id]" options={{ title: '' }} />
    </Stack>
  );
}
