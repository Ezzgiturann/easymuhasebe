import { StyleSheet, type TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { formatTRY } from '@/utils/money';

type Tone = 'auto' | 'in' | 'out' | 'neutral';

interface MoneyTextProps {
  /** Signed kuruş. */
  kurus: number;
  /** 'auto' colors by sign, 'in'/'out' force green/red, 'neutral' uses text. */
  tone?: Tone;
  type?: React.ComponentProps<typeof ThemedText>['type'];
  style?: TextStyle;
  /** Show a leading + on positive amounts. */
  showPlus?: boolean;
}

/** A monetary amount, colored green (in) / red (out) per the app convention. */
export function MoneyText({ kurus, tone = 'auto', type, style, showPlus }: MoneyTextProps) {
  const theme = useTheme();

  let color: string = theme.text;
  if (tone === 'in') color = theme.income;
  else if (tone === 'out') color = theme.expense;
  else if (tone === 'auto') {
    if (kurus > 0) color = theme.income;
    else if (kurus < 0) color = theme.expense;
  }

  const sign = showPlus && kurus > 0 ? '+' : '';
  return (
    <ThemedText type={type} style={[styles.mono, { color }, style]}>
      {sign}
      {formatTRY(kurus)}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  mono: {
    fontVariant: ['tabular-nums'],
  },
});
