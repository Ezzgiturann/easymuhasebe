import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { allAccountsQuery } from '@/db/queries/accounts';
import { allMembershipsQuery } from '@/db/queries/members';
import { accessibleAccounts } from '@/utils/accessible-accounts';
import { useSession } from '@/hooks/use-session';

/**
 * Per user. The stored id was never a leak — an account another user cannot see
 * fails the existence check below and falls back — but it did mean signing in as
 * someone else started you pointed at a ledger that was not yours, and the
 * screens spent a render deciding what to do about it.
 */
const storageKey = (userId: string | null) =>
  userId ? `easyhesap.selectedAccountId.${userId}` : null;

interface SelectedAccountValue {
  /** The account İşlemler / Özet / Ara operate on. Null when there are no
   *  accounts yet. Defaults to the first account until the user picks one. */
  accountId: string | null;
  setAccountId: (id: string) => void;
}

const SelectedAccountContext = createContext<SelectedAccountValue | null>(null);

/**
 * Remembers which account the scoped screens work on, across app restarts.
 *
 * The stored id is never trusted: it is validated against the live account list
 * on every render, so an account deleted on this device — or one that vanished
 * because a backup was restored over the top — silently falls back to the first
 * account instead of leaving the app pointed at nothing.
 */
export function SelectedAccountProvider({ children }: { children: React.ReactNode }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { userId } = useSession();
  // Both queries are identity-free; the filtering below uses the current user id
  // on every render. This provider mounts before sign-in finishes, and a query
  // with the id compiled into it would have stayed stale for the whole session —
  // which is exactly how İşlemler ended up insisting there were no accounts while
  // the home screen listed one.
  const { data: allAccounts } = useLiveQuery(allAccountsQuery());
  const { data: memberships } = useLiveQuery(allMembershipsQuery());
  const accounts = accessibleAccounts(allAccounts ?? [], memberships ?? [], userId);

  useEffect(() => {
    let active = true;

    // try/catch as well as .catch(): a missing native module throws synchronously
    // rather than rejecting, and that must not take the app down.
    const key = storageKey(userId);
    if (!key) {
      setLoaded(true);
      return;
    }

    try {
      AsyncStorage.getItem(key)
        .then((stored) => {
          if (active && stored) setPicked(stored);
        })
        .catch(() => {})
        .finally(() => {
          if (active) setLoaded(true);
        });
    } catch {
      setLoaded(true);
    }

    return () => {
      active = false;
    };
    // Re-read when the user changes: the previous person's choice is not this
    // person's, and their ledger is not even visible to them.
  }, [userId]);

  const value = useMemo<SelectedAccountValue>(() => {
    // Fall back to the first account so the scoped screens work before a pick.
    const fallback = accounts[0]?.id ?? null;
    const stillExists = picked !== null && accounts.some((a) => a.id === picked);

    return {
      accountId: stillExists ? picked : fallback,
      setAccountId: (id) => {
        setPicked(id);
        const key = storageKey(userId);
        if (key) AsyncStorage.setItem(key, id).catch(() => {});
      },
    };
  }, [picked, accounts, userId]);

  // Render nothing until the stored id is known. Without this the scoped screens
  // would mount against the first account and visibly jump to the real one.
  // Safe: the splash overlay is still covering the app at this point.
  if (!loaded) return null;

  return <SelectedAccountContext.Provider value={value}>{children}</SelectedAccountContext.Provider>;
}

export function useSelectedAccount(): SelectedAccountValue {
  const ctx = useContext(SelectedAccountContext);
  if (!ctx) throw new Error('useSelectedAccount must be used within SelectedAccountProvider');
  return ctx;
}
