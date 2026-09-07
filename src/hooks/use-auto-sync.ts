import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { sync } from '@/sync/engine';

import { useSession } from './use-session';

/**
 * Runs the sync in the background: once on sign-in, and again whenever the app
 * comes back to the foreground.
 *
 * There is no button and no spinner, and that is the design. The ledger on the
 * phone is the one the screens read; sync only reconciles it with the server. A
 * visible "syncing…" state would suggest the user has to wait for something —
 * they never do, and on a shop's connection they often would.
 *
 * Foreground rather than a timer: a timer does not run while the app is closed,
 * and the moment that actually matters is the one where someone opens the app to
 * look at a balance another phone may have changed.
 */
export function useAutoSync(): void {
  const { signedIn, userId } = useSession();
  // A second run while the first is still going would push the same rows twice
  // and, worse, advance the cursor from under it.
  const running = useRef(false);

  useEffect(() => {
    if (!signedIn) return;

    const run = () => {
      if (running.current) return;
      running.current = true;
      // `sync` resolves rather than throws — a failed run is a run that did not
      // happen, and the next foreground tries again.
      sync()
        .then((result) => {
          // Logged, not shown. The user has nothing to do about it and their
          // ledger is complete either way — but a sync that fails in total
          // silence is one nobody notices for weeks, and the first real bug here
          // was exactly that shape: every push rejected, no sign anywhere.
          if (!result.ok) console.warn('[sync] başarısız:', result.reason);
        })
        .finally(() => {
          running.current = false;
        });
    };

    run();

    const onChange = (state: AppStateStatus) => {
      if (state === 'active') run();
    };
    const listener = AppState.addEventListener('change', onChange);
    return () => listener.remove();
    // `userId` is in the deps so switching accounts on one phone starts a fresh
    // run: the second user's ledger is a different set of rows entirely.
  }, [signedIn, userId]);
}
