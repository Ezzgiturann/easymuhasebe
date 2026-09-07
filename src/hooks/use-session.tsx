import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { setCurrentUserId } from '@/auth/current-user';
import { claimUnownedAccounts } from '@/db/mutations/claim';
import { register, signIn, signOut, type RegisterInput, type RegisterResult } from '@/auth/session';
import { supabase } from '@/server/supabase';

interface SessionValue {
  signedIn: boolean;
  /** The signed-in address, so Ayarlar can show whose account this is. */
  email: string | null;
  /** Changes on sign-in and sign-out; live queries scoped to the user key off it. */
  userId: string | null;
  register: (input: RegisterInput) => Promise<RegisterResult>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Holds whether someone is signed in. Sits above the lock, so the order is:
 * sign in, then the PIN on every cold start.
 *
 * The state is not ours to own — the Supabase client is the source of truth, and
 * it can change the answer without us asking: a refresh token can expire, or be
 * revoked from another device. `onAuthStateChange` is how we hear about that.
 * Polling once at startup would leave the app showing a ledger behind a session
 * that stopped being valid hours ago.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;

    /**
     * Record who is signed in, and give them the pre-account ledger if nobody
     * owns it yet. Both have to happen before any screen reads the database:
     * the home list is scoped by owner, so a missed claim shows an empty app to
     * someone whose books are right there on the phone.
     */
    const adopt = (userId: string | null, address: string | null) => {
      setCurrentUserId(userId);
      setUserId(userId);
      setEmail(address);
      if (userId) {
        try {
          claimUnownedAccounts(userId);
        } catch {
          // Never block sign-in over this; the accounts stay unowned and the
          // next sign-in tries again.
        }
      }
    };

    // getSession rather than readSession: the id is needed too, and asking once
    // for both keeps the two from disagreeing.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        adopt(data.session?.user.id ?? null, data.session?.user.email ?? null);
        setSignedIn(data.session !== null);
      })
      .catch(() => {
        // No stored session, or storage unreadable: show the sign-in screen
        // rather than a ledger we cannot vouch for.
        if (active) setSignedIn(false);
      })
      .finally(() => {
        if (active) setReady(true);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      adopt(session?.user.id ?? null, session?.user.email ?? null);
      setSignedIn(session !== null);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      signedIn,
      email,
      userId,
      // `onAuthStateChange` flips `signedIn` on its own; these just do the work
      // and let errors reach the screen so it can show a real reason.
      register: (input) => register(input),
      signIn: async (email, password) => {
        await signIn(email, password);
      },
      signOut: async () => {
        await signOut();
      },
    }),
    [signedIn, email, userId],
  );

  // The splash overlay is still up here; rendering the app and replacing it with
  // the sign-in screen a frame later would flash the ledger.
  if (!ready) return null;

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
