import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { MoneyText } from '@/components/money-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { profileQuery } from '@/db/profile';
import { allAccountsQuery } from '@/db/queries/accounts';
import { accessibleAccounts } from '@/utils/accessible-accounts';
import { allMembershipsQuery, allMembersQuery } from '@/db/queries/members';
import { useSelectedAccount } from '@/hooks/use-selected-account';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';

type AccountRow = {
  id: string;
  name: string;
  color: string;
  cachedBalance: number;
  memberCount: number;
  isShared: boolean;
  /** False for a ledger someone else owns and shared with this user. */
  isMine: boolean;
};

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { setAccountId } = useSelectedAccount();
  const { userId } = useSession();
  const { data: allAccounts } = useLiveQuery(allAccountsQuery());
  const { data: memberships } = useLiveQuery(allMembershipsQuery());
  const accounts = accessibleAccounts(allAccounts ?? [], memberships ?? [], userId);
  const { data: memberRows } = useLiveQuery(allMembersQuery());
  const { data: profileRows } = useLiveQuery(profileQuery());
  const profile = profileRows?.[0];

  const counts = new Map<string, number>();
  (memberRows ?? []).forEach((m) => counts.set(m.accountId, (counts.get(m.accountId) ?? 0) + 1));

  const all: AccountRow[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    color: a.color,
    cachedBalance: a.cachedBalance,
    memberCount: counts.get(a.id) ?? 0,
    // A ledger someone else owns is shared by definition — there is no
    // membership row without a share — whatever its own flag happens to say.
    isShared: a.isShared || a.ownerUserId !== userId,
    isMine: a.ownerUserId === userId,
  }));
  const isSharedAccount = (a: AccountRow) => a.isShared || a.memberCount > 0;
  const own = all.filter((a) => !isSharedAccount(a));
  const shared = all.filter(isSharedAccount);
  const total = all.reduce((sum, a) => sum + a.cachedBalance, 0);

  const openAccount = (id: string) => {
    setAccountId(id);
    router.push(`/account/${id}`);
  };
  const share = (id: string) => router.push(`/share/${id}`);

  return (
    <ThemedView style={styles.container}>
      {/* Title comes from (home)/_layout.tsx ('Hesaplarım'). This screen used to
          blank it and put the app's own name there instead — the only screen in
          the app with an empty title, which left the bar reading as two icons
          floating on nothing. */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/profile')}
              hitSlop={8}
              accessibilityLabel="Profil">
              {profile?.displayName ? (
                <Avatar label={profile.displayName} size={30} />
              ) : (
                // Filled, not outline: it sits next to a filled Avatar in the
                // other state, and a thin stroke reads as faint up here.
                <Ionicons name="person-circle" size={30} color={theme.text} />
              )}
            </Pressable>
          ),
        }}
      />
      {/* Nothing exists yet: one sentence about what this is, one button. The
          normal screen would otherwise greet a new user with a zero total, an
          empty account list and a shared-accounts card explaining a feature they
          have nothing to use it on — three sections of nothing. */}
      {all.length === 0 ? (
        <View style={styles.welcome}>
          <EmptyState
            icon="wallet-outline"
            title="Hesap oluştur"
            actionLabel="Yeni Hesap Ekle"
            onAction={() => router.push('/account/new')}
            // The person who was invited to someone else's ledger lands on
            // exactly this screen, and creating an account is the one thing they
            // should not do. Leaving the code in Ayarlar meant they had to be
            // told where to look.
            secondaryLabel="Davet kodum var"
            onSecondary={() => router.push('/join')}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.totalRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Toplam varlık
            </ThemedText>
            <MoneyText kurus={total} tone="neutral" type="subtitle" />
          </View>

          <SectionHeader
            title="Hesaplar"
            action={
              <Pill onPress={() => router.push('/account/new')} theme={theme}>
                Yeni Hesap Ekle
              </Pill>
            }
          />
          {own.length > 0 ? (
            own.map((a) => (
              <AccountCard key={a.id} account={a} onPress={() => openAccount(a.id)} onShare={() => share(a.id)} />
            ))
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Paylaşılmayan hesabın yok.
            </ThemedText>
          )}

          <SectionHeader
            title="Paylaşılan Hesaplar"
            action={
              // Under this heading rather than the one above: a ledger you join
              // lands here, and a button whose result appears in another section
              // is a button that looks broken.
              <Pill
                onPress={() => router.push('/join')}
                theme={theme}
                icon="enter-outline"
                variant="outline">
                Davet kodum var
              </Pill>
            }
          />
          {shared.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Paylaşılan hesabın yok.
            </ThemedText>
          ) : (
            shared.map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                subtitle={
                  // "1 kişiyle paylaşıldı" is the owner's sentence. To the person
                  // who was invited it says the opposite of what happened: they
                  // did not share this ledger, it was shared with them.
                  !a.isMine
                    ? 'Seninle paylaşıldı'
                    : a.memberCount > 0
                      ? `${a.memberCount} kişiyle paylaşıldı`
                      : 'Paylaşıma açık'
                }
                onPress={() => openAccount(a.id)}
                onShare={() => share(a.id)}
              />
            ))
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="default" themeColor="textSecondary">
        {title}
      </ThemedText>
      {action}
    </View>
  );
}

/**
 * The two things you can do with accounts, in two weights.
 *
 * `outline` exists because plain grey text next to a solid ink button did not
 * read as a button at all — it looked like a caption. Same height, same shape,
 * same padding as the filled one; only the fill differs. That is enough to say
 * "second choice" without saying "not really an option".
 */
function Pill({
  children,
  onPress,
  theme,
  icon = 'add',
  variant = 'filled',
}: {
  children: React.ReactNode;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'filled' | 'outline';
}) {
  const outline = variant === 'outline';
  const ink = outline ? theme.text : theme.background;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        outline
          ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.faint }
          : { backgroundColor: theme.text },
        { opacity: pressed ? 0.7 : 1 },
      ]}>
      <Ionicons name={icon} size={17} color={ink} />
      <ThemedText type="smallBold" style={{ color: ink }}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

function AccountCard({
  account,
  subtitle,
  onPress,
  onShare,
}: {
  account: AccountRow;
  subtitle?: string;
  onPress: () => void;
  onShare: () => void;
}) {
  const theme = useTheme();
  return (
    <Card style={styles.accCard}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.accMain, { opacity: pressed ? 0.6 : 1 }]}>
        <View style={[styles.dot, { backgroundColor: account.color }]} />
        <View style={styles.accText}>
          <ThemedText type="default" numberOfLines={1}>
            {account.name}
          </ThemedText>
          {subtitle ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        <MoneyText kurus={account.cachedBalance} tone="neutral" type="default" />
      </Pressable>
      <Pressable onPress={onShare} hitSlop={6} style={styles.iconBtn}>
        <Ionicons name="share-social-outline" size={19} color={theme.textSecondary} />
      </Pressable>
      <Pressable onPress={onPress} hitSlop={6} style={[styles.chevCircle, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  welcome: { flex: 1, justifyContent: 'center' },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  totalRow: { gap: Spacing.one, paddingTop: Spacing.two, paddingBottom: Spacing.one },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
    marginLeft: Spacing.one,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingLeft: Spacing.two,
    paddingRight: Spacing.three,
    paddingVertical: Spacing.one + 3,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  accCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    marginBottom: Spacing.two,
  },
  accMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  dot: { width: 10, height: 10, borderRadius: 5 },
  accText: { flex: 1, gap: 1 },
  iconBtn: { padding: Spacing.one },
  chevCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  hint: { marginLeft: Spacing.one },
  sharedHint: { paddingVertical: Spacing.four },
});
