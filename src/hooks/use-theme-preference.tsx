import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

/** The two themes the app actually has. */
export type ThemePreference = 'light' | 'dark';

/**
 * What a phone that has never been told otherwise gets.
 *
 * Light, not the device scheme: this is a ledger read in daylight, on a counter,
 * often by someone whose phone sits in dark mode for everything else. Following
 * the device meant a shopkeeper's first impression of the app was a black screen
 * they never asked for.
 */
const DEFAULT_PREFERENCE: ThemePreference = 'light';

const STORAGE_KEY = 'easyhesap.themePreference';

interface ThemePreferenceValue {
  /** What the UI should render — the stored choice, or the device on first run. */
  scheme: ThemePreference;
  setPreference: (next: ThemePreference) => void;
}

const ThemePreferenceContext = createContext<ThemePreferenceValue | null>(null);

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark';
}

/**
 * Holds the light/dark choice and persists it.
 *
 * There is no "system" option: the app has exactly two themes, and a third
 * setting that happens to equal one of them is just confusing. The app opens
 * light and stays there until the user says otherwise in Ayarlar — after which
 * the choice sticks regardless of what the phone does.
 *
 * Renders nothing until the stored value has been read; the app is behind the
 * splash overlay at that point, so rendering early would only flash the wrong theme.
 */
export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  /** null until the user has ever chosen — that's what makes the default apply. */
  const [preference, setPreferenceState] = useState<ThemePreference | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    // try/catch as well as .catch(): if the native module is missing, getItem
    // throws synchronously rather than rejecting, and an uncaught throw here
    // would take the whole app down over a colour preference.
    try {
      AsyncStorage.getItem(STORAGE_KEY)
        .then((stored) => {
          if (active && isPreference(stored)) setPreferenceState(stored);
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
  }, []);

  const value = useMemo<ThemePreferenceValue>(
    () => ({
      scheme: preference ?? DEFAULT_PREFERENCE,
      setPreference: (next) => {
        // Apply immediately; the write is a background detail the UI needn't wait for.
        setPreferenceState(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      },
    }),
    [preference],
  );

  if (!loaded) return null;

  return (
    <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>
  );
}

export function useThemePreference(): ThemePreferenceValue {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) throw new Error('useThemePreference must be used within ThemePreferenceProvider');
  return ctx;
}
