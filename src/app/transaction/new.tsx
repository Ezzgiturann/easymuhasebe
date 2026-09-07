import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryPicker } from '@/components/category-picker';
import { Keypad } from '@/components/keypad';
import { MoneyText } from '@/components/money-text';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { categoryIcon } from '@/constants/categories';
import { KASA_LABELS } from '@/constants/labels';
import { Spacing } from '@/constants/theme';
import { dayLabel, toLocalDay, fromLocalDay } from '@/db/dates';
import { resolveContactByName } from '@/db/mutations/contacts';
import { createTransaction, updateTransaction } from '@/db/mutations/transactions';
import { deriveKind, kindNeedsCategory, kindNeedsContact, type PaymentMethod } from '@/db/postings';
import { categoriesQuery } from '@/db/queries/categories';
import { accountQuery } from '@/db/queries/accounts';
import { kasaBalancesQuery } from '@/db/queries/reports';
import { kasaBalances } from '@/utils/kasa-balances';
import { contactsWithBalanceQuery } from '@/db/queries/contacts';
import { lastTransactionQuery, transactionQuery } from '@/db/queries/transactions';
import { lookupSuggestion } from '@/db/queries/suggestions';
import { KASA_TYPES, type KasaType } from '@/db/schema/transactions';
import { useTheme } from '@/hooks/use-theme';
import { formatTRY, kurusToInput, parseAmountToKurus } from '@/utils/money';
import { captureReceipt, pickReceipt } from '@/utils/receipt';
import { AskError } from '@/ai/client';
import { scanReceipt } from '@/ai/receipt-scan';
import { effectiveCategory, matchContacts, saveBlocker, type TxMode } from '@/utils/tx-form';

type Direction = 'in' | 'out';
/**
 * What the user is doing, as a shopkeeper would say it. "Aktarım" sits beside the
 * other two rather than under a payment method because it is genuinely a third
 * kind of movement: money neither came in nor went out, it changed pocket.
 *
 * Defined once in `utils/tx-form.ts`, which owns the rules that read it.
 */
type Mode = TxMode;

const METHODS: PaymentMethod[] = ['nakit', 'banka', 'kredi_karti', 'veresiye'];
const methodLabel = (m: PaymentMethod) => (m === 'veresiye' ? 'Veresiye' : KASA_LABELS[m as KasaType]);

/** The box a transfer should default to landing in, given where it left from. */
const otherKasa = (from: KasaType): KasaType => (from === 'banka' ? 'nakit' : 'banka');

/** 'YYYY-MM-DD' into a LOCAL Date. `new Date(day)` would parse as UTC and can
 *  land on the previous day depending on the timezone. */
function dayToDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The keypad. Creates a transaction, or edits an existing one when `editId` is
 * present — same form either way, so the two paths can't drift apart.
 */
export default function NewTransactionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { accountId, editId } = useLocalSearchParams<{ accountId: string; editId?: string }>();

  const editing = useMemo(
    () => (editId ? transactionQuery(editId).all()[0] : undefined),
    [editId],
  );

  const [amountStr, setAmountStr] = useState(() =>
    editing ? kurusToInput(editing.amount) : '',
  );
  const [mode, setMode] = useState<Mode>(() => {
    if (editing) return editing.kind === 'transfer' ? 'transfer' : editing.direction;
    // Carry the last direction forward, the way kasa and category already do.
    // Resetting to "Verdim" every time cost a shop one extra tap on every single
    // sale it ever recorded — and a shop records far more sales than expenses.
    const last = lastTransactionQuery(accountId).all()[0];
    if (!last) return 'out';
    return last.kind === 'transfer' ? 'transfer' : last.direction;
  });
  const [method, setMethod] = useState<PaymentMethod>(() => {
    if (editing) return editing.kasaType ?? 'veresiye';
    return lastTransactionQuery(accountId).all()[0]?.kasaType ?? 'nakit';
  });
  const [toMethod, setToMethod] = useState<KasaType>(
    () => editing?.toKasaType ?? otherKasa(editing?.kasaType ?? 'nakit'),
  );
  const [categoryId, setCategoryId] = useState<string | null>(() => {
    if (editing) return editing.categoryId;
    return lastTransactionQuery(accountId).all()[0]?.categoryId ?? null;
  });
  const [contactName, setContactName] = useState(() => editing?.contactName ?? '');
  const [description, setDescription] = useState(() => editing?.description ?? '');
  const [note, setNote] = useState(() => editing?.note ?? '');
  const [date, setDate] = useState(() => (editing ? dayToDate(editing.txDate) : new Date()));
  const [receiptUri, setReceiptUri] = useState<string | null>(() => editing?.receiptUri ?? null);
  const [scanning, setScanning] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  /** Set once the user taps Verdim/Aldım/Aktarım themselves. */
  const modeChosen = useRef(false);

  const { data: allCategories } = useLiveQuery(categoriesQuery(accountId), [accountId]);
  const { data: contacts } = useLiveQuery(contactsWithBalanceQuery(accountId), [accountId]);

  const isTransfer = mode === 'transfer';
  // A transfer is stored as an 'out' so the column has a value, but nothing about
  // the form should read as money leaving.
  const direction: Direction = isTransfer ? 'out' : mode;
  const kindKind = direction === 'in' ? 'income' : 'expense';
  const hasContact = !isTransfer && contactName.trim().length > 0;
  const kind = isTransfer ? ('transfer' as const) : deriveKind(direction, method, hasContact);
  const showCategory = kindNeedsCategory(kind);
  const selectedCategory = effectiveCategory(allCategories ?? [], categoryId, mode);
  const contactMatches = useMemo(
    () => (isTransfer ? [] : matchContacts(contacts ?? [], contactName)),
    [contactName, contacts, isTransfer],
  );

  const amount = parseAmountToKurus(amountStr);
  const blocker = saveBlocker({
    kind,
    mode,
    amount,
    hasCategory: !!selectedCategory,
    hasContact,
    fromKasa: method,
    toKasa: isTransfer ? toMethod : null,
  });
  const canSave = blocker === null;

  const pushKey = (k: string) => {
    setAmountStr((prev) => {
      if (k === 'del') return prev.slice(0, -1);
      if (k === ',') {
        if (prev.includes(',')) return prev;
        return prev === '' ? '0,' : `${prev},`;
      }
      if (prev.includes(',')) {
        const dec = prev.split(',')[1] ?? '';
        if (dec.length >= 2) return prev;
      }
      if (prev === '0') return k;
      return prev + k;
    });
  };

  const onDescription = (text: string) => {
    setDescription(text);
    // Auto-recognition only helps on new entries. Applying it while editing would
    // silently overwrite the category/kasa/cari the user already chose. In
    // transfer mode there is no category or cari to recognise, and letting it set
    // the direction would knock the user out of the mode they just picked.
    if (editing || isTransfer) return;
    const s = lookupSuggestion(accountId, text);
    if (!s) return;
    if (s.categoryId) {
      const cat = (allCategories ?? []).find((c) => c.id === s.categoryId);
      if (cat && cat.kind === kindKind) {
        setCategoryId(cat.id);
      } else if (cat && !modeChosen.current) {
        // Only allowed to move the direction while the user has not stated one.
        // Otherwise someone who tapped "Aldım" and then typed a description that
        // used to be an expense watches the form flip back to "Verdim" under
        // their hands — which reads as "gelir eklenemiyor".
        setCategoryId(cat.id);
        setMode(cat.kind === 'income' ? 'in' : 'out');
      }
    }
    if (s.kasaType) setMethod(s.kasaType as PaymentMethod);
    if (s.contactId && !hasContact) {
      const c = (contacts ?? []).find((x) => x.id === s.contactId);
      if (c) setContactName(c.name);
    }
  };

  const onChangeMode = (m: Mode) => {
    modeChosen.current = true;
    setMode(m);
    if (m === 'transfer') {
      // "Veresiye" makes no sense once nothing is entering or leaving; fall back
      // to a real cash box and make sure the two ends are not the same one.
      const from: KasaType = method === 'veresiye' ? 'nakit' : method;
      setMethod(from);
      if (toMethod === from) setToMethod(otherKasa(from));
      return;
    }
    const cat = (allCategories ?? []).find((c) => c.id === categoryId);
    if (cat && cat.kind !== (m === 'in' ? 'income' : 'expense')) setCategoryId(null);
  };

  /** Keep the two ends of a transfer distinct by pushing the other one aside. */
  const onChangeFrom = (m: PaymentMethod) => {
    setMethod(m);
    if (isTransfer && m === toMethod) setToMethod(otherKasa(m as KasaType));
  };
  const onChangeTo = (m: KasaType) => {
    setToMethod(m);
    if (m === method) setMethod(otherKasa(m));
  };

  /**
   * Read the photo and fill in what the form does not already have.
   *
   * Only empty fields are written. Someone who typed an amount and then attached
   * the receipt meant the amount they typed; a scanner overwriting it would be a
   * silent correction of the one number the user is sure about.
   *
   * The category is the exception: the form arrives pre-filled with the last
   * transaction's category, which is a guess about this receipt made before
   * anyone had seen it. A name read off the photo is better information.
   *
   * The direction (gelir/gider) is never touched. A receipt is almost always an
   * expense — but "almost" is not enough when getting it wrong flips the balance.
   */
  const scan = async (uri: string) => {
    setScanning(true);
    try {
      const names = (allCategories ?? []).filter((c) => c.kind === kindKind).map((c) => c.name);
      const reading = await scanReceipt(uri, names);

      if (reading.amountKurus === null) {
        Alert.alert('Fiş okunamadı', 'Tutarı fişten çıkaramadım, elle yazman gerekiyor.');
        return;
      }

      setAmountStr((current) => (current.trim() ? current : kurusToInput(reading.amountKurus!)));
      if (reading.description) {
        setDescription((current) => (current.trim() ? current : reading.description!));
      }
      if (reading.categoryName) {
        const match = (allCategories ?? []).find(
          (c) => c.kind === kindKind && c.name === reading.categoryName,
        );
        if (match) setCategoryId(match.id);
      }
      if (reading.txDate) setDate(fromLocalDay(reading.txDate));
    } catch (e) {
      // The photo stays attached and every field stays as it was; the entry is
      // still perfectly saveable by hand.
      Alert.alert('Fiş taranamadı', e instanceof AskError ? e.message : 'Tutarı elle yazabilirsin.');
    } finally {
      setScanning(false);
    }
  };

  const addReceipt = () => {
    Alert.alert('Fiş ekle', 'Fişin fotoğrafını ekle', [
      {
        text: 'Fotoğraf çek',
        onPress: async () => {
          const uri = await captureReceipt();
          if (!uri) return;
          setReceiptUri(uri);
          await scan(uri);
        },
      },
      {
        text: 'Galeriden seç',
        onPress: async () => {
          const uri = await pickReceipt();
          if (!uri) return;
          setReceiptUri(uri);
          await scan(uri);
        },
      },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  };

  /**
   * How far below zero this entry would push the cash box it draws on.
   *
   * Returns 0 when nothing goes negative. Money that is not there cannot be
   * spent, so a negative box is almost always a collection that was never
   * entered or an expense typed against the wrong box — but not always, and the
   * app has no business refusing to record what the user says happened.
   */
  const overdraftAfterSave = (): number => {
    if (method === 'veresiye' || direction !== 'out' || amount <= 0) return 0;

    const account = accountQuery(accountId).all()[0];
    if (!account) return 0;

    const box = method as KasaType;
    const current =
      kasaBalances(kasaBalancesQuery(accountId).all(), account).find((b) => b.kasaType === box)
        ?.total ?? 0;
    // An edit already counts its own old amount in `current`; adding the new one
    // on top would warn about money the entry is not actually spending twice.
    const after = current - amount + (editing && editing.kasaType === box ? editing.amount : 0);
    return after < 0 ? -after : 0;
  };

  const save = () => {
    const contactId = hasContact ? resolveContactByName(accountId, contactName) : null;
    if (kindNeedsContact(kind) && !contactId) {
      Alert.alert('Kişi gerekli', 'Bu işlem için bir cari (kişi) adı yaz.');
      return;
    }
    const input = {
      accountId,
      kind,
      amount,
      kasaType: method === 'veresiye' ? null : (method as KasaType),
      toKasaType: isTransfer ? toMethod : null,
      categoryId: showCategory ? (selectedCategory?.id ?? null) : null,
      contactId,
      description,
      note,
      receiptUri,
      txDate: toLocalDay(date),
    };

    // updateTransaction soft-deletes the old row and its postings, then writes a
    // fresh one — the balance and the audit trail stay correct.
    if (editId) updateTransaction(editId, input);
    else createTransaction(input);
    router.dismiss();
  };

  const onSave = () => {
    if (!canSave) return;

    const overdraft = overdraftAfterSave();
    if (overdraft > 0) {
      // A warning, not a block. Two accounts in real use are already several
      // hundred lira below zero and nobody was told; the entry that did it was
      // accepted in silence.
      Alert.alert(
        'Kasa eksiye düşecek',
        `Bu işlemden sonra ${KASA_LABELS[method as KasaType]} kasan ${formatTRY(overdraft)} eksiye ` +
          'düşüyor. Girilmemiş bir tahsilat ya da yanlış kasa seçilmiş olabilir.',
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Yine de kaydet', onPress: save },
        ],
      );
      return;
    }

    save();
  };

  // Neutral for a transfer: green or red would claim a gain or a loss that the
  // business did not have.
  const amountColor = isTransfer ? theme.text : direction === 'in' ? theme.income : theme.expense;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: editId ? 'İşlemi Düzenle' : 'Yeni İşlem' }} />
      <SafeAreaView edges={['bottom']} style={styles.safe}>
        <View style={styles.amountBox}>
          <ThemedText type="title" style={[styles.amount, { color: amountColor }]}>
            {formatTRY(amount)}
          </ThemedText>
        </View>

        <View style={styles.directionWrap}>
          <Segmented<Mode>
            value={mode}
            onChange={onChangeMode}
            options={[
              { value: 'out', label: 'Verdim' },
              { value: 'in', label: 'Aldım' },
              { value: 'transfer', label: 'Aktarım' },
            ]}
          />
        </View>

        <ScrollView style={styles.controls} contentContainerStyle={styles.controlsContent}>
          {isTransfer ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Nereden
              </ThemedText>
              <View style={styles.chipRow}>
                {KASA_TYPES.map((m) => (
                  <Chip
                    key={m}
                    label={KASA_LABELS[m]}
                    active={m === method}
                    onPress={() => onChangeFrom(m)}
                  />
                ))}
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Nereye
              </ThemedText>
              <View style={styles.chipRow}>
                {KASA_TYPES.map((m) => (
                  <Chip
                    key={m}
                    label={KASA_LABELS[m]}
                    active={m === toMethod}
                    onPress={() => onChangeTo(m)}
                  />
                ))}
              </View>
              {/* Says out loud what the app will do with the number, because the
                  totals deliberately will NOT move and that could read as a bug. */}
              <ThemedText type="small" themeColor="textSecondary">
                Para kasa değiştirir; gelir veya gider sayılmaz.
              </ThemedText>
            </>
          ) : (
            <View style={styles.chipRow}>
              {METHODS.map((m) => (
                <Chip key={m} label={methodLabel(m)} active={m === method} onPress={() => onChangeFrom(m)} />
              ))}
            </View>
          )}

          <View
            style={[
              styles.group,
              { backgroundColor: theme.backgroundElement, borderColor: theme.faint },
            ]}>
            {showCategory ? (
              <FieldRow
                icon={selectedCategory ? categoryIcon(selectedCategory.icon) : 'pricetag-outline'}
                label={selectedCategory?.name ?? 'Kategori seç'}
                muted={!selectedCategory}
                onPress={() => setShowCategoryPicker(true)}
                hairline={theme.hairline}
              />
            ) : null}
            <FieldRow
              icon="calendar-outline"
              label={dayLabel(toLocalDay(date))}
              onPress={() => setShowDatePicker(true)}
              hairline={theme.hairline}
            />
            <FieldRow
              icon="camera-outline"
              label={scanning ? 'Fiş okunuyor…' : receiptUri ? 'Fiş eklendi' : 'Fiş ekle'}
              muted={!receiptUri}
              onPress={() => (scanning ? undefined : addReceipt())}
              last
              right={
                receiptUri ? (
                  <Pressable onPress={() => setReceiptUri(null)} hitSlop={8}>
                    <Image source={{ uri: receiptUri }} style={styles.thumb} contentFit="cover" />
                  </Pressable>
                ) : undefined
              }
            />
          </View>

          {/* Stated rather than assumed. The photo leaves the phone to be read,
              and someone whose receipts carry a customer's name deserves to know
              that before they tap, not in a settings page they never open. */}
          <ThemedText type="small" themeColor="textSecondary" style={styles.scanHint}>
            Fiş eklediğinde tutarı ve kategoriyi okumak için fotoğraf sunucuya gönderilir.
          </ThemedText>

          {!isTransfer && (
            <View>
              {/* The label used to say "(opsiyonel)" even for a veresiye, where
                  the entry cannot be saved without it — the user found out only
                  after tapping Kaydet. */}
              <TextInput
                value={contactName}
                onChangeText={setContactName}
                placeholder={
                  kindNeedsContact(kind) ? 'Kimden / Kime — gerekli' : 'Kimden / Kime (opsiyonel)'
                }
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.faint },
                ]}
              />
              {contactMatches.length > 0 ? (
                <View style={[styles.suggestions, { backgroundColor: theme.surface, borderColor: theme.faint }]}>
                  {contactMatches.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => setContactName(c.name)}
                      style={({ pressed }) => [styles.suggestion, { opacity: pressed ? 0.6 : 1 }]}>
                      <Ionicons name="person-outline" size={16} color={theme.textSecondary} />
                      <ThemedText type="small" numberOfLines={1} style={styles.suggestionName}>
                        {c.name}
                      </ThemedText>
                      <MoneyText kurus={c.balance} tone="auto" type="small" />
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          )}
          <TextInput
            value={description}
            onChangeText={onDescription}
            placeholder="Açıklama (ne için)"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.faint },
            ]}
          />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Not (opsiyonel)"
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.faint },
            ]}
          />
        </ScrollView>

        <View style={styles.keypadWrap}>
          <Keypad onKey={pushKey} />
          {/* Says what is missing instead of just greying out. A disabled button
              with no reason is indistinguishable from a broken one — this is what
              made "gelir eklenemiyor" look like a bug rather than a blank field. */}
          {blocker ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.blocker}>
              {blocker}
            </ThemedText>
          ) : null}
          <Pressable
            onPress={onSave}
            disabled={!canSave}
            style={[styles.save, { backgroundColor: canSave ? theme.text : theme.backgroundSelected }]}>
            <ThemedText type="smallBold" style={{ color: canSave ? theme.background : theme.textSecondary }}>
              {editId ? 'Güncelle' : 'Kaydet'}
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>

      <CategoryPicker
        visible={showCategoryPicker}
        accountId={accountId}
        kind={kindKind}
        selectedId={selectedCategory?.id ?? null}
        onSelect={setCategoryId}
        onClose={() => setShowCategoryPicker(false)}
      />

      {showDatePicker &&
        (Platform.OS === 'ios' ? (
          <Modal transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
            <Pressable style={styles.backdrop} onPress={() => setShowDatePicker(false)} />
            <View style={[styles.dateSheet, { backgroundColor: theme.surface }]}>
              <DateTimePicker
                value={date}
                mode="date"
                display="inline"
                locale="tr-TR"
                maximumDate={new Date()}
                onChange={(_, d) => d && setDate(d)}
              />
              <Pressable
                onPress={() => setShowDatePicker(false)}
                style={[styles.save, { backgroundColor: theme.text }]}>
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  Tamam
                </ThemedText>
              </Pressable>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={date}
            mode="date"
            maximumDate={new Date()}
            onChange={(e, d) => {
              setShowDatePicker(false);
              if (d && e.type === 'set') setDate(d);
            }}
          />
        ))}
    </ThemedView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? theme.text : theme.backgroundElement }]}>
      <ThemedText type="small" style={{ color: active ? theme.background : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function FieldRow({
  icon,
  label,
  muted,
  onPress,
  hairline,
  last,
  right,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  muted?: boolean;
  onPress: () => void;
  hairline?: string;
  last?: boolean;
  right?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.fieldRow,
        { borderBottomColor: last ? 'transparent' : hairline, opacity: pressed ? 0.6 : 1 },
      ]}>
      <Ionicons name={icon} size={20} color={theme.textSecondary} />
      <ThemedText type="default" themeColor={muted ? 'textSecondary' : 'text'} style={styles.fieldLabel}>
        {label}
      </ThemedText>
      {right ?? <Ionicons name="chevron-forward" size={17} color={theme.faint} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  amountBox: { alignItems: 'center', paddingVertical: Spacing.three },
  amount: { fontSize: 40 },
  directionWrap: { paddingHorizontal: Spacing.three },
  controls: { flexGrow: 0, maxHeight: 260 },
  controlsContent: { padding: Spacing.three, gap: Spacing.two },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 999 },
  group: { borderRadius: Spacing.three, paddingHorizontal: Spacing.three, borderWidth: 1 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldLabel: { flex: 1 },
  scanHint: { marginTop: Spacing.two, marginHorizontal: Spacing.one },
  thumb: { width: 32, height: 32, borderRadius: 8 },
  input: { borderRadius: Spacing.three, padding: Spacing.three, fontSize: 16, borderWidth: 1 },
  keypadWrap: { padding: Spacing.three, gap: Spacing.two, marginTop: 'auto' },
  blocker: { textAlign: 'center', marginTop: Spacing.one },
  suggestions: {
    marginTop: Spacing.one,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  suggestionName: { flex: 1 },
  save: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  dateSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.three,
  },
});
