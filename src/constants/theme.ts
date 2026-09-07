/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * Minimal, warm-neutral palette. Color is reserved for money (income green /
 * expense red); everything else is a single ink tone on warm paper. Primary
 * buttons invert ink↔paper via `text`/`background`, so they adapt to both themes
 * without a separate accent hue.
 */
export const Colors = {
  light: {
    text: '#1C1B19', // ink
    background: '#F5F3EF', // warm paper (slightly deeper so white cards lift off it)
    surface: '#FFFFFF', // elevated card
    backgroundElement: '#F1EEE9', // chips / subtle surfaces
    backgroundSelected: '#E7E3DC',
    // 5,78:1 on paper, 6,41:1 on a card. Was #8C867E — 3,25:1, below the 4,5:1
    // WCAG AA asks for small text, and most of the app's hints are small text.
    textSecondary: '#5C574F', // muted text and icons
    // Deliberately still light, and deliberately NOT text any more. This is the
    // token for borders, dividers and disabled marks — decoration, which carries
    // no contrast requirement. Darkening it to pass a rule that does not apply
    // would have thickened every outline in the app.
    faint: '#B3ADA4', // borders, dividers, decorative marks
    hairline: '#ECE9E4', // separators inside cards
    income: '#1F7A4D',
    expense: '#C0453B',
    accent: '#1C1B19',
  },
  dark: {
    text: '#F4F1EC',
    background: '#0E0D0C',
    surface: '#1B1A17', // elevated card
    backgroundElement: '#242220',
    backgroundSelected: '#302D29',
    textSecondary: '#98928A',
    faint: '#6C6760',
    hairline: '#2E2B27',
    income: '#55C08A',
    expense: '#E8756B',
    accent: '#F4F1EC',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;
