import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { KASA_LABELS } from '@/constants/labels';
import { Spacing } from '@/constants/theme';
import { monthRange, prevMonthRange, today } from '@/db/dates';
import { KASA_TYPES, type KasaType } from '@/db/schema/transactions';
import { useTheme } from '@/hooks/use-theme';
import {
  isEmptyFilter,
  NO_FILTER,
  TX_GROUPS,
  TX_GROUP_LABELS,
  type TransactionFilter,
  type TxGroup,
} from '@/utils/tx-filter';

type Period = 'all' | 'thisMonth' | 'lastMonth';

const PERIOD_LABELS: Record<Period, string> = {
  all: 'Hepsi',
  thisMonth: 'Bu ay',
  lastMonth: 'Geçen ay',
};

function rangeFor(period: Period): { start: string | null; end: string | null } {
  if (period === 'thisMonth') return monthRange(today());
  if (period === 'lastMonth') return prevMonthRange(today());
  return { start: null, end: null };
}

/** Which preset the current bounds correspond to, so the chip reads back correctly. */
function periodOf(filter: TransactionFilter): Period {
  if (!filter.start && !filter.end) return 'all';
  const thisMonth = monthRange(today());
  if (filter.start === thisMonth.start && filter.end === thisMonth.end) return 'thisMonth';
  const last = prevMonthRange(today());
  if (filter.start === last.start && filter.end === last.end) return 'lastMonth';
  return 'all';
}

/**
 * Narrowing the İşlemler list. Applies as you tap rather than behind an "Uygula"
 * button — the list is right behind the sheet, so the effect of each choice is
 * visible immediately and there is nothing to commit.
 */
export function FilterSheet({
  visible,
  filter,
  onChange,
  onClose,
}: {
  visible: boolean;
  filter: TransactionFilter;
  onChange: (next: TransactionFilter) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const period = periodOf(filter);

  const setGroup = (g: TxGroup | null) => onChange({ ...filter, group: g });
  const setKasa = (k: KasaType | null) => onChange({ ...filter, kasaType: k });
  const setPeriod = (p: Period) => onChange({ ...filter, ...rangeFor(p) });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
        <SafeAreaView edges={['bottom']}>
          <View style={styles.header}>
            <ThemedText type="default">Filtrele</ThemedText>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Kapat">
              <Ionicons name="close" size={22} color={theme.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <Group title="TÜR">
              <Chip label="Hepsi" active={!filter.group} onPress={() => setGroup(null)} />
              {TX_GROUPS.map((g) => (
                <Chip
                  key={g}
                  label={TX_GROUP_LABELS[g]}
                  active={filter.group === g}
                  onPress={() => setGroup(filter.group === g ? null : g)}
                />
              ))}
            </Group>

            <Group title="KASA">
              <Chip label="Hepsi" active={!filter.kasaType} onPress={() => setKasa(null)} />
              {KASA_TYPES.map((k) => (
                <Chip
                  key={k}
                  label={KASA_LABELS[k]}
                  active={filter.kasaType === k}
                  onPress={() => setKasa(filter.kasaType === k ? null : k)}
                />
              ))}
            </Group>

            <Group title="DÖNEM">
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <Chip
                  key={p}
                  label={PERIOD_LABELS[p]}
                  active={period === p}
                  onPress={() => setPeriod(p)}
                />
              ))}
            </Group>
          </ScrollView>

          <Pressable
            onPress={() => onChange(NO_FILTER)}
            disabled={isEmptyFilter(filter)}
            style={({ pressed }) => [
              styles.clear,
              { borderColor: theme.hairline, opacity: isEmptyFilter(filter) ? 0.4 : pressed ? 0.6 : 1 },
            ]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Filtreyi temizle
            </ThemedText>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.groupTitle}>
        {title}
      </ThemedText>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? theme.text : theme.backgroundElement,
          borderColor: active ? theme.text : theme.faint,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <ThemedText type="small" style={{ color: active ? theme.background : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: Spacing.four },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
  },
  body: { paddingBottom: Spacing.three, gap: Spacing.four },
  group: { gap: Spacing.two },
  groupTitle: { letterSpacing: 1.2, fontSize: 11, marginLeft: Spacing.half },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  clear: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.three,
  },
});
