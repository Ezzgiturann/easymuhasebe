/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useThemePreference } from '@/hooks/use-theme-preference';

/**
 * The active palette. Reads the resolved scheme from the preference provider, not
 * the device directly, so the Ayarlar → Görünüm choice actually takes effect.
 */
export function useTheme() {
  const { scheme } = useThemePreference();

  return Colors[scheme];
}
