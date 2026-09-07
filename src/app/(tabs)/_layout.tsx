import { Tabs } from 'expo-router';

import { BottomBar } from '@/components/bottom-bar';
import { Colors } from '@/constants/theme';
import { useThemePreference } from '@/hooks/use-theme-preference';

export default function TabsLayout() {
  const { scheme } = useThemePreference();
  const colors = Colors[scheme];

  const headerOptions = {
    headerShown: true as const,
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.text,
    headerShadowVisible: false,
  };

  return (
    <Tabs tabBar={(props) => <BottomBar {...props} />} screenOptions={{ headerShown: false }}>
      {/* Ana Sayfa is a nested stack (accounts list → account transactions), so it
          renders its own headers. */}
      <Tabs.Screen name="(home)" />
      <Tabs.Screen name="islemler" options={{ ...headerOptions, title: 'İşlemler' }} />
      <Tabs.Screen name="ozet" options={{ ...headerOptions, title: 'Özet' }} />
      <Tabs.Screen name="ayarlar" options={{ ...headerOptions, title: 'Ayarlar' }} />
    </Tabs>
  );
}
