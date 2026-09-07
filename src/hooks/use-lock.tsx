import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { isLockEnabled } from '@/lock/store';

/**
 * How long the app may sit in the background before it asks for the PIN again.
 * Zero would re-lock every time the camera or the photo picker takes over the
 * screen, which is exactly what happens while attaching a receipt.
 */
const RELOCK_AFTER_MS = 60_000;

interface LockValue {
  /** True while the PIN screen should be covering the app. */
  locked: boolean;
  /** Whether a PIN has been set at all. */
  enabled: boolean;
  unlock: () => void;
  /** Re-read the stored state after the user turns the lock on or off. */
  refresh: () => Promise<void>;
}

const LockContext = createContext<LockValue | null>(null);

/**
 * Holds whether the ledger is currently covered by the PIN screen.
 *
 * Deliberately not persisted: "locked" is a fact about this run of the app. It
 * starts locked whenever a PIN exists, so a cold start always asks.
 */
export function LockProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const read = useCallback(async () => {
    try {
      return await isLockEnabled();
    } catch {
      // A lock we cannot read is a lock we cannot honour; reporting it off keeps
      // the owner in their own ledger rather than stranded at a PIN screen that
      // will never accept anything.
      return false;
    }
  }, []);

  useEffect(() => {
    // Only the cold start locks. `refresh` deliberately does not: the user who
    // just set a PIN in Ayarlar is already inside, and throwing them at the PIN
    // screen the instant they saved would read as being kicked out.
    read()
      .then((on) => {
        setEnabled(on);
        setLocked(on);
      })
      .finally(() => setReady(true));
  }, [read]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (enabled && since !== null && Date.now() - since >= RELOCK_AFTER_MS) setLocked(true);
      } else if (state === 'background') {
        // 'inactive' is also the state during the iOS app switcher preview and a
        // permission dialog, so only a real background counts.
        backgroundedAt.current = Date.now();
      }
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [enabled]);

  const value = useMemo<LockValue>(
    () => ({
      locked,
      enabled,
      unlock: () => setLocked(false),
      refresh: async () => {
        setEnabled(await read());
      },
    }),
    [locked, enabled, read],
  );

  // Nothing until we know whether to lock: rendering the ledger first and
  // covering it a frame later would show the balances the lock exists to hide.
  if (!ready) return null;

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

export function useLock(): LockValue {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error('useLock must be used within LockProvider');
  return ctx;
}
