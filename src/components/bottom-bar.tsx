import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconName = keyof typeof Ionicons.glyphMap;

const TABS: Record<string, { label: string; icon: IconName; activeIcon: IconName }> = {
  '(home)': { label: 'Ana Sayfa', icon: 'home-outline', activeIcon: 'home' },
  islemler: { label: 'İşlemler', icon: 'swap-vertical-outline', activeIcon: 'swap-vertical' },
  ozet: { label: 'Özet', icon: 'stats-chart-outline', activeIcon: 'stats-chart' },
  ayarlar: { label: 'Ayarlar', icon: 'settings-outline', activeIcon: 'settings' },
};

// Where the raised round button sits — after the 2nd tab (between İşlemler and Özet).
const ADD_AFTER_INDEX = 1;

/** Structural subset of expo-router's BottomTabBarProps that this bar uses. */
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    emit: (event: {
      type: 'tabPress';
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}

/**
 * The global bottom navigation bar: Ana Sayfa · İşlemler · (assistant) · Özet · Ayarlar.
 *
 * The raised round button opens the AI assistant. Transaction entry is the
 * AddTransactionButton on the İşlemler tab — this button used to be its only
 * entry point.
 */
export function BottomBar({ state, navigation }: TabBarProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const onAssistant = () => router.push('/chat');

  const cells: React.ReactNode[] = [];
  state.routes.forEach((route, index) => {
    const tab = TABS[route.name];
    if (!tab) return;
    const focused = state.index === index;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
    };

    cells.push(
      <Pressable key={route.key} style={styles.tab} onPress={onPress}>
        <Ionicons
          name={focused ? tab.activeIcon : tab.icon}
          size={23}
          color={focused ? theme.text : theme.faint}
        />
        <ThemedText type="small" themeColor={focused ? 'text' : 'faint'} style={styles.label}>
          {tab.label}
        </ThemedText>
      </Pressable>,
    );

    if (index === ADD_AFTER_INDEX) {
      cells.push(
        <View key="assistant" style={styles.tab}>
          <Pressable
            onPress={onAssistant}
            accessibilityLabel="Yardımcıya sor"
            style={[styles.assistantButton, { backgroundColor: theme.text }]}
            hitSlop={8}>
            {/* The one icon in the app not from Ionicons, which has nothing like
                it. A face wearing a headset is the symbol people already read as
                "someone to ask" — from their bank, their cargo app, everywhere —
                without needing to know what "AI" means. Same package, no extra
                dependency. */}
            <MaterialCommunityIcons name="face-agent" size={27} color={theme.background} />
          </Pressable>
        </View>,
      );
    }
  });

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.background, borderTopColor: theme.hairline, paddingBottom: insets.bottom || Spacing.two },
      ]}>
      {cells}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  label: { fontSize: 11 },
  assistantButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -Spacing.three,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
