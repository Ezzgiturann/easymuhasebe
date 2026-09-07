import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ask, AskError, isAssistantConfigured } from '@/ai/client';
import { buildContext } from '@/ai/context';
import { clearHistory, loadHistory, saveHistory, type Message } from '@/ai/history';
import { buildSystemInstruction } from '@/ai/prompt';
import {
  commitProposal,
  describeProposal,
  parseReply,
  type TransactionProposal,
} from '@/ai/proposal';
import { AccountSwitcher } from '@/components/account-switcher';
import { ScopeHeader } from '@/components/account/scope-header';
import { Card } from '@/components/card';
import { dayLabel } from '@/db/dates';
import { Spacing } from '@/constants/theme';
import { accountQuery } from '@/db/queries/accounts';
import { useSelectedAccount } from '@/hooks/use-selected-account';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useTheme } from '@/hooks/use-theme';

/** Shown on the empty screen so the user learns what this thing is for. */
const STARTERS = [
  'Kim bana ne kadar borçlu?',
  'Bu ay ne kadar harcadım?',
  'Bugün 500 lira nakit satış oldu',
  'Kasada ne kadar var?',
];

export default function ChatScreen() {
  const theme = useTheme();
  const keyboardHeight = useKeyboardHeight();
  const router = useRouter();
  const { accountId, setAccountId } = useSelectedAccount();
  const { data: accounts } = useLiveQuery(accountQuery(accountId ?? ''), [accountId]);
  const account = accounts?.[0];
  const scrollRef = useRef<ScrollView>(null);

  const [turns, setTurns] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The one proposal awaiting confirmation, and what happened to it. */
  const [pending, setPending] = useState<TransactionProposal | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // A pending proposal is deliberately NOT restored with the transcript: a card
  // from days ago would offer to write against a ledger that has since moved on.
  useEffect(() => {
    let active = true;
    loadHistory().then((stored) => {
      if (!active) return;
      setTurns(stored);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const remember = (next: Message[]) => {
    setTurns(next);
    saveHistory(next).then((failure) => {
      if (failure) setStorageError(`Sohbet kaydedilemiyor: ${failure}`);
    });
  };

  const onClear = () => {
    Alert.alert('Sohbeti temizle', 'Bu konuşma silinsin mi? Kayıtlı işlemler etkilenmez.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Temizle',
        style: 'destructive',
        onPress: () => {
          setTurns([]);
          setPending(null);
          setOutcome(null);
          setError(null);
          clearHistory();
        },
      },
    ]);
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;

    const next: Message[] = [...turns, { role: 'user', text: question }];
    remember(next);
    setInput('');
    setError(null);
    setPending(null);
    setOutcome(null);
    setBusy(true);

    try {
      // Built per send, so the answer always reflects the ledger as it is now.
      const instruction = buildSystemInstruction(buildContext(accountId));
      const reply = await ask(next, instruction);
      const parsed = parseReply(reply);

      remember([...next, { role: 'assistant', text: reply, display: parsed.message }]);
      if (parsed.proposal) setPending(parsed.proposal);
      if (parsed.error) setError(parsed.error);
    } catch (e) {
      setError(e instanceof AskError ? e.message : 'Beklenmeyen bir hata oldu.');
    } finally {
      setBusy(false);
    }
  };

  const onSave = () => {
    if (!pending) return;
    // There is nowhere to write without an account. This used to return in
    // silence: the user described a sale, the assistant prepared it, they tapped
    // Kaydet and nothing whatsoever happened.
    if (!accountId) {
      Alert.alert('Önce bir hesap gerekiyor', 'Bu işlemi yazabilmem için açık bir hesap olmalı.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Hesap Oluştur', onPress: () => router.push('/account/new') },
      ]);
      return;
    }
    try {
      commitProposal(accountId, pending);
      setOutcome('Kaydedildi.');
    } catch (e) {
      setOutcome(e instanceof Error ? e.message : 'Kaydedilemedi.');
    } finally {
      setPending(null);
    }
  };

  const canSend = input.trim().length > 0 && !busy;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () =>
            turns.length > 0 ? (
              <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="Sohbeti temizle">
                <Ionicons name="trash-outline" size={20} color={theme.textSecondary} />
              </Pressable>
            ) : null,
        }}
      />
      {/* Padded by hand rather than by KeyboardAvoidingView, which measures itself
          against the window and so computes no overlap at all inside a modal.
          The bottom safe-area inset is dropped while the keyboard is up: the
          keyboard already covers the home indicator, and keeping it would leave a
          strip of empty paper between the composer and the keys. */}
      <SafeAreaView
        edges={keyboardHeight > 0 ? [] : ['bottom']}
        style={[styles.container, { paddingBottom: keyboardHeight }]}>
        {/* The assistant only sees the selected account, and this screen opens
            from the bottom bar anywhere — so unlike the İşlemler tab, nothing
            on screen would otherwise say which ledger is being discussed. */}
        {account ? (
          <ScopeHeader
            name={account.name}
            color={account.color}
            onPress={() => setSwitcherOpen(true)}
          />
        ) : null}

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          keyboardDismissMode="interactive">
          {/* Wait for the stored transcript before deciding the screen is empty,
              or a saved conversation flashes the starter prompts first. */}
          {!loaded ? null : turns.length === 0 ? (
            <Empty onPick={send} disabled={busy} />
          ) : (
            turns.map((turn, i) => <Bubble key={i} turn={turn} />)
          )}

          {pending ? (
            <ProposalCard
              proposal={pending}
              onSave={onSave}
              onDismiss={() => {
                setPending(null);
                setOutcome('Vazgeçildi.');
              }}
            />
          ) : null}

          {outcome ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.outcome}>
              {outcome}
            </ThemedText>
          ) : null}

          {busy ? (
            <View style={styles.typing}>
              <ActivityIndicator size="small" color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                Bakıyor…
              </ThemedText>
            </View>
          ) : null}

          {error ? (
            <View style={[styles.error, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="alert-circle-outline" size={18} color={theme.expense} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.errorText}>
                {error}
              </ThemedText>
            </View>
          ) : null}

          {storageError ? (
            <ThemedText type="small" themeColor="expense" style={styles.outcome}>
              {storageError}
            </ThemedText>
          ) : null}
        </ScrollView>

        <View style={[styles.composer, { borderTopColor: theme.hairline }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Bir şey sor…"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.faint },
            ]}
            multiline
            onSubmitEditing={() => send(input)}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={!canSend}
            style={[
              styles.sendButton,
              { backgroundColor: canSend ? theme.text : theme.backgroundSelected },
            ]}>
            <Ionicons
              name="arrow-up"
              size={20}
              color={canSend ? theme.background : theme.textSecondary}
            />
          </Pressable>
        </View>
      </SafeAreaView>

      {account ? (
        <AccountSwitcher
          visible={switcherOpen}
          selectedId={account.id}
          onSelect={setAccountId}
          onClose={() => setSwitcherOpen(false)}
        />
      ) : null}
    </ThemedView>
  );
}

function Empty({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  const theme = useTheme();

  return (
    <View style={styles.empty}>
      {/* Same symbol as the button that opened this screen — two different icons
          for one feature makes it read as two features. */}
      <MaterialCommunityIcons name="face-agent" size={34} color={theme.textSecondary} />
      {isAssistantConfigured() ? (
        <View style={styles.starters}>
          {STARTERS.map((s) => (
            <Pressable
              key={s}
              onPress={() => onPick(s)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.starter,
                { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.6 : 1 },
              ]}>
              <ThemedText type="small">{s}</ThemedText>
            </Pressable>
          ))}
        </View>
      ) : (
        // Written for whoever is holding the phone, not for a developer. The old
        // copy told the user to edit .env.local and restart a dev server.
        <View style={[styles.setup, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">Yardımcı şu an kullanılamıyor</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {/* "Yakında açılacak" diyordu: bu bir yapılandırma eksiği, gelecek
                bir özellik değil. Kullanıcıya beklemesi gereken bir şey varmış
                gibi göstermek yanlış bilgi. */}
            Bağlantını kontrol edip tekrar dene.
          </ThemedText>
        </View>
      )}
    </View>
  );
}

/**
 * The confirmation gate. Nothing the assistant proposes reaches the ledger until
 * this is tapped — a misheard amount should cost one glance, not a wrong entry.
 */
function ProposalCard({
  proposal,
  onSave,
  onDismiss,
}: {
  proposal: TransactionProposal;
  onSave: () => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();

  return (
    <Card style={styles.proposal}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.proposalTitle}>
        KAYDEDİLECEK İŞLEM
      </ThemedText>
      <ThemedText type="default">{describeProposal(proposal)}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {dayLabel(proposal.txDate)}
        {proposal.description ? ` · ${proposal.description}` : ''}
      </ThemedText>

      <View style={styles.proposalActions}>
        <Pressable
          onPress={onSave}
          style={({ pressed }) => [
            styles.proposalSave,
            { backgroundColor: theme.text, opacity: pressed ? 0.8 : 1 },
          ]}>
          <Ionicons name="checkmark" size={18} color={theme.background} />
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            Kaydet
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => [
            styles.proposalDismiss,
            { borderColor: theme.faint, opacity: pressed ? 0.6 : 1 },
          ]}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Vazgeç
          </ThemedText>
        </Pressable>
      </View>
    </Card>
  );
}

function Bubble({ turn }: { turn: Message }) {
  const theme = useTheme();
  const mine = turn.role === 'user';
  const text = turn.display ?? turn.text;
  if (!text) return null;

  return (
    <View
      style={[
        styles.bubble,
        mine
          ? { alignSelf: 'flex-end', backgroundColor: theme.text }
          : { alignSelf: 'flex-start', backgroundColor: theme.backgroundElement },
      ]}>
      <ThemedText type="small" style={mine ? { color: theme.background } : undefined}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two, flexGrow: 1 },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Spacing.four,
  },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  emptyText: { textAlign: 'center' },
  starters: { gap: Spacing.two, alignSelf: 'stretch' },
  starter: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, borderRadius: Spacing.three },
  setup: { gap: Spacing.one, padding: Spacing.three, borderRadius: Spacing.three, alignSelf: 'stretch' },
  typing: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingLeft: Spacing.one },
  error: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  errorText: { flex: 1 },
  proposal: { paddingVertical: Spacing.three, gap: Spacing.one },
  proposalTitle: { letterSpacing: 1.2, fontSize: 11, marginBottom: Spacing.one },
  proposalActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  proposalSave: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  proposalDismiss: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
  },
  outcome: { textAlign: 'center', marginTop: Spacing.one },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
