import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { balanceLabel } from '@/components/account/contacts-tab';
import { TransactionItem } from '@/components/account/transactions-tab';
import { Card } from '@/components/card';
import { MoneyText } from '@/components/money-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { contactsWithBalanceQuery } from '@/db/queries/contacts';
import { accountTransactionsQuery } from '@/db/queries/transactions';
import { useSelectedAccount } from '@/hooks/use-selected-account';
import { useTheme } from '@/hooks/use-theme';
import { contactMatches, prepareTerm, transactionMatches } from '@/utils/search';

/** Results are capped because the lists here are plain ScrollViews, not virtualised. */
const MAX_TRANSACTIONS = 50;
const MAX_CONTACTS = 20;

/**
 * Search across the selected account: transaction descriptions and notes,
 * category names, cari names and phones, and amounts.
 *
 * Filtering runs in JS over the account's rows (see `utils/search.ts` for why).
 * Both queries are already loaded by other screens, so this adds no new read
 * pattern — it reuses them.
 */
export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { accountId } = useSelectedAccount();
  const [query, setQuery] = useState('');

  const { data: transactions } = useLiveQuery(
    accountTransactionsQuery(accountId ?? ''),
    [accountId],
  );
  const { data: contacts } = useLiveQuery(contactsWithBalanceQuery(accountId ?? ''), [accountId]);

  const term = prepareTerm(query);

  const matchedTransactions = useMemo(
    () => (term ? (transactions ?? []).filter((row) => transactionMatches(term, row)) : []),
    [term, transactions],
  );
  const matchedContacts = useMemo(
    () => (term ? (contacts ?? []).filter((row) => contactMatches(term, row)) : []),
    [term, contacts],
  );

  const shownTransactions = matchedTransactions.slice(0, MAX_TRANSACTIONS);
  const shownContacts = matchedContacts.slice(0, MAX_CONTACTS);
  const total = matchedTransactions.length + matchedContacts.length;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Ara' }} />

      <View style={styles.searchBar}>
        {/* Card, not a bare `backgroundElement` fill: that colour is 1.04:1 against
            the page ground and vanishes outside a Card. What actually separates a
            surface here is Card's shadow — its hairline border is 1.09:1 on light. */}
        <Card style={styles.field}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Kişi, açıklama, kategori veya tutar"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text }]}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </Card>
      </View>

      <ScrollView contentContainerStyle={styles.results} keyboardDismissMode="on-drag">
        {!term ? (
          <Hint text="Aramak için en az iki harf ya da bir rakam yaz." />
        ) : total === 0 ? (
          <Hint text={`“${query.trim()}” için sonuç yok.`} />
        ) : (
          <>
            {shownContacts.length > 0 ? (
              <Section title="CARİLER" shown={shownContacts.length} found={matchedContacts.length}>
                <Card>
                  {shownContacts.map((contact, i) => (
                    <Pressable
                      key={contact.id}
                      onPress={() => router.push(`/cari/${contact.id}`)}
                      style={({ pressed }) => [
                        styles.contactRow,
                        {
                          borderBottomColor:
                            i === shownContacts.length - 1 ? 'transparent' : theme.hairline,
                          opacity: pressed ? 0.6 : 1,
                        },
                      ]}>
                      <Avatar label={contact.name} />
                      <View style={styles.contactBody}>
                        <ThemedText type="default" numberOfLines={1}>
                          {contact.name}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {contact.phone ?? balanceLabel(contact.balance)}
                        </ThemedText>
                      </View>
                      <MoneyText
                        kurus={Math.abs(contact.balance)}
                        tone={contact.balance > 0 ? 'in' : contact.balance < 0 ? 'out' : 'neutral'}
                        type="default"
                      />
                      <Ionicons name="chevron-forward" size={17} color={theme.faint} />
                    </Pressable>
                  ))}
                </Card>
              </Section>
            ) : null}

            {shownTransactions.length > 0 ? (
              <Section
                title="İŞLEMLER"
                shown={shownTransactions.length}
                found={matchedTransactions.length}>
                <Card>
                  {shownTransactions.map((row, i) => (
                    <TransactionItem
                      key={row.id}
                      row={row}
                      last={i === shownTransactions.length - 1}
                    />
                  ))}
                </Card>
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

/** Says out loud when results were cut off — a silent cap reads as "that's all there is". */
function Section({
  title,
  shown,
  found,
  children,
}: {
  title: string;
  shown: number;
  found: number;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
        {found > shown ? `${title} · ${found} sonuçtan ilk ${shown}` : `${title} · ${found}`}
      </ThemedText>
      {children}
    </View>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
      {text}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, paddingVertical: Spacing.three, fontSize: 16 },
  results: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five, gap: Spacing.four },
  section: { gap: Spacing.two },
  sectionTitle: { letterSpacing: 1.2, fontSize: 11, marginLeft: Spacing.one },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contactBody: { flex: 1, gap: 1 },
  hint: { textAlign: 'center', marginTop: Spacing.five },
});
