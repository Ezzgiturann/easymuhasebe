import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { categoryIcon } from '@/constants/categories';
import { Spacing } from '@/constants/theme';
import { createCategory, deleteCategory, updateCategory } from '@/db/mutations/categories';
import { categoriesQuery, categoryUsageCount } from '@/db/queries/categories';
import { useTheme } from '@/hooks/use-theme';

interface CategoryPickerProps {
  visible: boolean;
  accountId: string;
  kind: 'income' | 'expense';
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** Bottom-sheet grid of category options. Tapping a "Diğer …" catch-all opens a
 *  name field so the user can write the specific income/expense; saving creates
 *  and selects a new category. */
export function CategoryPicker({
  visible,
  accountId,
  kind,
  selectedId,
  onSelect,
  onClose,
}: CategoryPickerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data } = useLiveQuery(categoriesQuery(accountId, kind), [accountId, kind]);
  const list = data ?? [];

  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  /** Set while the name page is renaming an existing category rather than creating one. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const isIncome = kind === 'income';

  const close = () => {
    setNaming(false);
    setNewName('');
    setEditingId(null);
    onClose();
  };

  const onAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    if (editingId) {
      updateCategory(editingId, trimmed);
      setNaming(false);
      setNewName('');
      setEditingId(null);
      return;
    }

    const id = createCategory(accountId, trimmed, kind);
    onSelect(id);
    close();
  };

  /**
   * Long-press to rename or remove. The "Diğer …" entries are excluded: they are
   * the doorway to creating a category, and deleting one would remove the only
   * way to add another.
   */
  const onLongPress = (category: { id: string; name: string }) => {
    if (category.name.startsWith('Diğer')) return;

    Alert.alert(category.name, undefined, [
      {
        text: 'Yeniden adlandır',
        onPress: () => {
          setEditingId(category.id);
          setNewName(category.name);
          setNaming(true);
        },
      },
      { text: 'Sil', style: 'destructive', onPress: () => confirmDelete(category) },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  };

  const confirmDelete = (category: { id: string; name: string }) => {
    const used = categoryUsageCount(category.id);
    const body =
      used > 0
        ? `“${category.name}” kategorisinde ${used} işlem var. Silersen o işlemler kayıtlarda kalır ` +
          've özet raporlarında görünmeye devam eder — sadece yeni işlemlerde bu kategoriyi seçemezsin.'
        : `“${category.name}” silinsin mi?`;

    Alert.alert('Kategoriyi sil', body, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => deleteCategory(category.id) },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      {/* The name field autoFocuses, so the keyboard is up the instant this page
          opens. Without this the sheet stays pinned to the bottom and the field
          is behind the keyboard — you cannot see what you are typing. */}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.surface,
              // The home-indicator inset is the keyboard's job while it is up.
              paddingBottom: (naming ? 0 : insets.bottom) + Spacing.three,
            },
          ]}>
          <View style={[styles.handle, { backgroundColor: theme.hairline }]} />

        {naming ? (
          <View style={styles.namePage}>
            <View style={styles.nameHeader}>
              <Pressable
                onPress={() => {
                  setNaming(false);
                  setNewName('');
                  setEditingId(null);
                }}
                hitSlop={8}>
                <Ionicons name="chevron-back" size={24} color={theme.text} />
              </Pressable>
              <ThemedText type="subtitle" style={styles.title}>
                {editingId ? 'Yeniden adlandır' : isIncome ? 'Diğer Gelir' : 'Diğer Gider'}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.nameHint}>
              {editingId
                ? 'Bu ad geçmiş işlemlerde de görünecek.'
                : isIncome
                  ? 'Bu gelir ne için?'
                  : 'Bu gider ne için?'}
            </ThemedText>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder={isIncome ? 'Örn. Kira geliri, Faiz' : 'Örn. Nakliye, Komisyon'}
              placeholderTextColor={theme.textSecondary}
              autoFocus
              onSubmitEditing={onAdd}
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.faint },
              ]}
            />
            <Pressable
              onPress={onAdd}
              disabled={!newName.trim()}
              style={[
                styles.addBtn,
                { backgroundColor: newName.trim() ? theme.text : theme.backgroundSelected },
              ]}>
              <ThemedText type="smallBold" style={{ color: newName.trim() ? theme.background : theme.textSecondary }}>
                {editingId ? 'Kaydet' : 'Ekle ve seç'}
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <>
            <ThemedText type="subtitle" style={styles.title}>
              Kategori
            </ThemedText>
            {/* Long-press is invisible without saying so — the app uses the same
                gesture on the transaction list, but nobody guesses it. */}
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Yeniden adlandırmak veya silmek için basılı tut
            </ThemedText>
            <ScrollView contentContainerStyle={styles.grid}>
              {list.map((c) => {
                const active = c.id === selectedId;
                const isOther = c.name.startsWith('Diğer');
                return (
                  <Pressable
                    key={c.id}
                    style={styles.cell}
                    onLongPress={() => onLongPress(c)}
                    onPress={() => {
                      if (isOther) {
                        setNaming(true);
                        return;
                      }
                      onSelect(c.id);
                      close();
                    }}>
                    <View
                      style={[
                        styles.iconWrap,
                        {
                          backgroundColor: active ? theme.text : theme.backgroundElement,
                          borderColor: active ? theme.text : 'transparent',
                        },
                      ]}>
                      <Ionicons
                        name={isOther ? 'add' : categoryIcon(c.icon)}
                        size={24}
                        color={active ? theme.background : theme.text}
                      />
                    </View>
                    <ThemedText
                      type="small"
                      themeColor={active ? 'text' : 'textSecondary'}
                      numberOfLines={1}
                      style={styles.cellLabel}>
                      {c.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    maxHeight: '70%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.three },
  title: { fontSize: 22, marginBottom: Spacing.one },
  hint: { marginBottom: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  cell: { width: '23%', alignItems: 'center', gap: Spacing.one, marginBottom: Spacing.three },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLabel: { textAlign: 'center', fontSize: 11 },
  namePage: { paddingBottom: Spacing.three },
  nameHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  nameHint: { marginBottom: Spacing.two },
  input: { borderRadius: Spacing.three, padding: Spacing.three, fontSize: 17, borderWidth: 1 },
  addBtn: {
    marginTop: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
});
