# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Critical: Expo SDK 54

This project is on **Expo SDK 54 / React Native 0.81 / React 19.1**. Expo's APIs changed significantly in recent versions. Before writing any Expo/React Native code, consult the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ — do not rely on memory of older Expo APIs.

Note: SDK 57 is the current `latest` on npm. This project is deliberately held back to SDK 54 to match
the Expo Go build on the developer's iPhone. Expo packages did not use unified `<sdk>.x` versioning until
SDK 56, so on SDK 54 the versions look unrelated (`expo-router` 6.x, `expo-sqlite` 16.x).
Always resolve versions with `npx expo install <pkg>`, never by hand.

**The developer tests on a physical iPhone through Expo Go.** Any package added must be one Expo Go
bundles — check the "Included in Expo Go" line on its `docs.expo.dev/versions/v54.0.0/sdk/<pkg>` page
before installing, or the app will fail on their device while building fine here. Metro caches the
module map, so a newly installed native module needs `npx expo start -c`.

## Commands

```bash
npm start           # expo start (dev server, choose platform interactively)
npm run ios         # start + open iOS simulator
npm run android     # start + open Android emulator
npm run lint        # expo lint (ESLint)
```

Verify with:

```bash
npm test                                      # jest-expo; pure-logic suites
npm run typecheck                             # tsc --noEmit; strict mode is on
npm run lint
npx expo export --platform ios --output-dir /tmp/x   # catches what the first two can't
```

The export step matters: type-checks and lint have both passed while the bundle was broken (a missing
Babel preset, an unresolvable asset). Run it after any dependency or config change.

## Architecture

**iOS / Android** app built on **expo-router** file-based routing. React Compiler and typed routes are
enabled via `app.json` `experiments`.

> **Web is not a target.** The developer decided on 2026-08-06 not to ship web; don't spend effort
> there or describe this as a universal app. `expo export --platform web` does succeed (metro.config.js
> resolves `.wasm`), but the app would not run. If web is ever revived, three things are needed —
> they were investigated, so don't re-derive them:
>
> 1. **COOP/COEP headers.** `expo-sqlite` stores in OPFS via `createSyncAccessHandle`, which requires a
>    cross-origin-isolated page. Add to `metro.config.js` for the dev server, and to whatever hosts the
>    static export:
>    ```js
>    config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
>      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
>      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
>      return middleware(req, res, next);   // omitting this serves nothing
>    };
>    ```
> 2. **`Alert.alert` is an empty function on web** (`react-native-web/dist/exports/Alert` is literally
>    `static alert() {}`). Every confirmation and error silently does nothing, in 7 files — including
>    the backup-restore confirmation, so restore never runs. Needs a `confirm()/notify()` helper with a
>    `.web` variant.
> 3. **`expo-file-system/legacy` is a null shim on web** — `documentDirectory` and `cacheDirectory` are
>    `null` and no methods exist. Backup export/restore and receipt photos need Blob/download and a
>    file input instead.
>
> Note: `react-native-web` and `react-dom` are **not** removable even though web is unused —
> `expo-router`, `expo-image`, `expo-system-ui` and `@expo/metro-runtime` depend on them.

- **`src/app/`** — routes. `_layout.tsx` is the root: `ThemePreferenceProvider` → `ThemeProvider` →
  `DatabaseProvider` → `SelectedAccountProvider` → `Stack`, plus `AnimatedSplashOverlay`.
- **`src/db/`** — schema, queries, mutations, and the double-entry core (`postings.ts`). The user never
  sees debit/credit; `buildEntries` is the whole translation and asserts its postings sum to zero.
- **`src/ai/`** — the read-only assistant. `client.ts` is the only file that knows the AI provider.
- **Path alias** — import from `@/*` (→ `src/*`) and `@/assets/*` (→ `assets/*`), configured in `tsconfig.json`.

### Navigation

Bottom bar (custom `BottomBar`, not NativeTabs): `Ana Sayfa · İşlemler · (✨ assistant) · Özet · Ayarlar`.

- The raised round button opens the **AI assistant**, not transaction entry.
- Transaction entry is `AddTransactionButton`, a FAB on the **İşlemler tab only**. Remove it and nothing
  in the app can record a transaction.
- `account/[id]` is **Cariler + account admin** (balance, Paylaş, Sil). It deliberately shows no
  transaction list — the İşlemler tab already does, and opening an account selects it.

### Create/edit forms

Create and edit share one screen, switched by an `editId` query param — `transaction/new`, `cari/new`,
and `account/new` all work this way. Add new edit flows the same way rather than writing a second form.

### Platform-specific files

Metro resolves `.web.tsx` over `.tsx` when bundling for web — the same import gets a different
implementation per platform. Current split: `animated-icon.tsx` / `.web.tsx`.

When adding a component with native-only APIs, add a `.web.tsx` sibling rather than branching on
`Platform.OS` throughout.

### Theming

Centralized in `src/constants/theme.ts`:

- **`Colors`** — `light`/`dark` maps; keys are the `ThemeColor` type (`text`, `background`, `surface`,
  `backgroundElement`, `backgroundSelected`, `textSecondary`, `faint`, `hairline`, `income`, `expense`,
  `accent`). Colour is reserved for money; everything else is one ink tone on warm paper.
- **`Spacing`** — named scale (`half`=2 … `six`=64). Use these tokens for padding/margins/radii instead of raw numbers.
- **`Fonts`** — `Platform.select` mapping; web fonts resolve to CSS vars defined in `src/global.css`.

Read the active theme with `useTheme()` (`src/hooks/use-theme.ts`). It resolves through
**`useThemePreference()`** — the Açık/Koyu setting in Ayarlar, persisted in AsyncStorage. The app
opens **light** and stays there until the user changes it; the device scheme is deliberately ignored,
so never reach for React Native's `useColorScheme()` in a screen — that bypasses the setting.

Build UI with the themed primitives **`ThemedView`** and **`ThemedText`** (typed `type` variants like
`title`, `small`, `smallBold`, `code`) rather than raw `View`/`Text`.

### Tests

`jest-expo`, config in `jest.config.js`, files are `src/**/*.test.ts` beside what they test.
They cover the **pure logic only** — `postings` (the double-entry core), `money`, `dates`,
`normalize`, `overdue`, `search`. That is deliberate: those are where a silent wrong answer costs
the user money, and none of them need a device.

Two rules when adding tests:

- **Never put a test file under `src/app/`.** expo-router builds routes from a `require.context`
  over that directory, so a `.test.ts` there would be picked up as a screen.
- A module that imports `@/db/client` (or anything native) pulls in `expo-sqlite` and won't run
  under jest without mocking. Keep new logic in a pure module and let the caller do the I/O —
  `utils/overdue.ts` and `ai/proposal.ts`'s parse half are the pattern.

### Money

Amounts are **INTEGER kuruş** everywhere. `utils/money.ts` owns the conversions:
`formatTRY` for display, `parseAmountToKurus` for input, and `kurusToInput` to put a stored amount
back into a form field. Do not use `formatKurus` for that last case — its thousand separators parse
back as `NaN` and would silently zero the amount on edit.

## Yayın yapılandırması

`eas.json` içinde `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_ANON_KEY` düz metin durur —
**kasıtlı.** EAS derlemesi `.env.local` dosyasını okumaz, ve bu iki değer zaten uygulama paketinin
içine gömülüyor. Anon anahtarı "bu istek uygulamadan geliyor" der, "bu istek her şeyi yapabilir"
demez; neye erişilebileceğini Row Level Security belirler.

`service_role` anahtarı asla buraya, git'e ya da uygulamaya girmez — o RLS'i tamamen atlar.
Sunucu tarafı gizli değerler (`GEMINI_API_KEY`) `supabase secrets set` ile buluta yazılır,
SMTP bilgileri ise gitignore'lu `.env` dosyasından okunur.
