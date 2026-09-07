import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  completePasswordReset,
  confirmSignUp,
  isEmailRegistered,
  requestPasswordReset,
  resendConfirmation,
} from '@/auth/account';
import { isValidEmail, passwordRejectionReason } from '@/auth/credentials';
import { AuthError } from '@/auth/session';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { readProfile } from '@/db/profile';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';

type AuthTab = 'login' | 'register';

const TABS: { value: AuthTab; label: string }[] = [
  { value: 'login', label: 'Giriş yap' },
  { value: 'register', label: 'Kayıt ol' },
];

/**
 * The way into the app: two tabs, Giriş yap and Kayıt ol.
 *
 * The account now lives on the server, so this screen no longer knows whether
 * one exists — it asks and reports what the server says. Signing in needs a
 * connection; staying signed in does not.
 */
export function SignInScreen() {
  const theme = useTheme();
  const { register, signIn } = useSession();

  const [name, setName] = useState(() => readProfile()?.displayName ?? '');
  const [phone, setPhone] = useState(() => readProfile()?.phone ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Which code the form is waiting for, if any. Both sign-up and reset mail a
   * code rather than a link, so the two share one input.
   */
  const [awaiting, setAwaiting] = useState<'signup' | 'reset' | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  // A local profile means this phone has been through registration before, so a
  // returning owner lands on "Giriş yap". Either tab is still one tap away.
  const [tab, setTab] = useState<AuthTab>(() => (readProfile()?.displayName ? 'login' : 'register'));

  const onChangeTab = (next: AuthTab) => {
    setTab(next);
    setError(null);
    setNotice(null);
    setAwaiting(null);
    setCode('');
    setPassword('');
    setPassword2('');
  };

  const onRegister = async () => {
    if (!name.trim()) return setError('Adını yaz.');
    if (!isValidEmail(email)) return setError('Geçerli bir e-posta yaz.');
    const reason = passwordRejectionReason(password, email);
    if (reason) return setError(reason);
    if (password !== password2) return setError('İki parola aynı değil.');

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { needsConfirmation } = await register({
        displayName: name,
        email,
        password,
        phone: phone.trim() || null,
      });
      // Not an error — the account exists. Saying nothing here would leave the
      // user staring at a screen that appeared to do nothing at all.
      if (needsConfirmation) {
        setAwaiting('signup');
        setPassword('');
        setPassword2('');
        setNotice('Hesabın oluşturuldu. E-postana gelen kodu gir.');
      }
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'Hesap oluşturulamadı, tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  const onSignIn = async () => {
    if (!isValidEmail(email)) return setError('Geçerli bir e-posta yaz.');

    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'Giriş yapılamadı, tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * A real reset now: the server mails a link, and only whoever can read that
   * mailbox can use it. This used to change the password on the spot with no
   * proof at all — anyone holding the phone could take the account over.
   *
   * The message is the same whether or not the address has an account. Saying
   * "no such account" would turn this button into a way of discovering who is
   * registered here — type addresses, watch which ones differ, and you have a
   * list of this app's users.
   *
   * But "kayıtlı bir hesap varsa" alone was accurate and useless: someone whose
   * address was never registered waits for a code that is never coming and
   * concludes the app is broken. It happened. So the message keeps the ambiguity
   * and adds the way out — the reader can tell which case they are in without
   * the server telling anyone.
   */
  const onForgot = async () => {
    if (!isValidEmail(email)) return setError('Önce e-posta adresini yaz.');

    setBusy(true);
    setError(null);
    try {
      // Asked first so the screen can be honest. `null` means the check failed —
      // then the reset is sent anyway, because a check that cannot answer must
      // not stand between someone and their own account.
      const registered = await isEmailRegistered(email);
      if (registered === false) {
        setError(
          `${email.trim()} adresine ait bir hesap yok. "Kayıt ol" sekmesinden hesap açabilirsin.`,
        );
        return;
      }

      await requestPasswordReset(email);
      setAwaiting('reset');
      setPassword('');
      setPassword2('');
      // Kesin dil yalnızca gerçekten bildiğimizde. Kontrol cevap veremediyse
      // (`null`) "kod gönderildi" demek, adres kayıtlı değilse yalan olurdu —
      // ve tam olarak bu, kullanıcıyı gelmeyecek bir kodu beklerken bıraktı.
      setNotice(
        registered === true
          ? `${email.trim()} adresine bir kod gönderildi. Kodu ve yeni parolanı gir.\n\n` +
              'Birkaç dakikada gelmezse spam klasörüne bak.'
          : `${email.trim()} adresine kayıtlı bir hesap varsa kod gönderildi.\n\n` +
              'Gelmezse spam klasörüne bak; yine yoksa bu adresle kayıt olmamış ' +
              'olabilirsin — "Kayıt ol" sekmesinden hesap açabilirsin.',
      );
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'İstek gönderilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const onConfirmSignUp = async () => {
    if (code.trim().length < 6) return setError('E-postana gelen kodu gir.');

    setBusy(true);
    setError(null);
    try {
      await confirmSignUp(email, code);
      // Confirming opens the session, so there is nothing more to do here.
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'Doğrulanamadı.');
    } finally {
      setBusy(false);
    }
  };

  const onResend = async () => {
    setBusy(true);
    setError(null);
    try {
      await resendConfirmation(email);
      setNotice('Yeni bir kod gönderildi.');
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'Kod gönderilemedi.');
    } finally {
      setBusy(false);
    }
  };

  /** Prove the code, then set the new password — one tap for the user. */
  const onCompleteReset = async () => {
    if (code.trim().length < 6) return setError('E-postana gelen kodu gir.');
    const reason = passwordRejectionReason(password, email);
    if (reason) return setError(reason);
    if (password !== password2) return setError('İki parola aynı değil.');

    setBusy(true);
    setError(null);
    try {
      await completePasswordReset(email, code, password);
      // A successful reset signs the user in, so there is nothing more to do here.
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'Parola değiştirilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const mode = awaiting ?? tab;
  // A sign-up code needs no password fields — the password was already chosen.
  const needsConfirm = mode === 'register' || mode === 'reset';

  const submit =
    mode === 'register'
      ? onRegister
      : mode === 'reset'
        ? onCompleteReset
        : mode === 'signup'
          ? onConfirmSignUp
          : onSignIn;
  const submitLabel =
    mode === 'register'
      ? 'Hesabı oluştur'
      : mode === 'reset'
        ? 'Parolayı değiştir'
        : mode === 'signup'
          ? 'Hesabı doğrula'
          : 'Giriş yap';

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.faint },
  ];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <View style={[styles.logo, { backgroundColor: theme.backgroundElement }]}>
                <Ionicons name="book-outline" size={30} color={theme.text} />
              </View>
              <ThemedText type="title">easy hesap</ThemedText>
            </View>

            {!awaiting ? (
              <View style={styles.tabs}>
                <Segmented<AuthTab> options={TABS} value={tab} onChange={onChangeTab} />
              </View>
            ) : null}

            {mode === 'register' ? (
              <>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Adın"
                  placeholderTextColor={theme.textSecondary}
                  autoFocus
                  style={inputStyle}
                />
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Telefon (opsiyonel)"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="phone-pad"
                  style={[inputStyle, styles.mt]}
                />
              </>
            ) : null}

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="E-posta"
              placeholderTextColor={theme.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              style={[inputStyle, mode === 'register' && styles.mt]}
            />

            {awaiting ? (
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="E-postana gelen kod"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                autoFocus
                style={[inputStyle, styles.mt]}
              />
            ) : null}

            {mode !== 'signup' ? (
            <View style={[styles.passwordWrap, styles.mt]}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={mode === 'reset' ? 'Yeni parola' : 'Parola'}
                placeholderTextColor={theme.textSecondary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                style={[inputStyle, styles.passwordInput]}
              />
              <Pressable
                onPress={() => setShowPassword((s) => !s)}
                hitSlop={8}
                accessibilityLabel={showPassword ? 'Parolayı gizle' : 'Parolayı göster'}
                style={styles.eye}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={theme.textSecondary}
                />
              </Pressable>
            </View>
            ) : null}

            {needsConfirm ? (
              <TextInput
                value={password2}
                onChangeText={setPassword2}
                placeholder="Parola (tekrar)"
                placeholderTextColor={theme.textSecondary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                style={[inputStyle, styles.mt]}
              />
            ) : null}

            {error ? (
              <ThemedText type="small" themeColor="expense" style={styles.error}>
                {error}
              </ThemedText>
            ) : null}

            {notice ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.error}>
                {notice}
              </ThemedText>
            ) : null}

            <Pressable
              onPress={submit}
              disabled={busy}
              style={({ pressed }) => [
                styles.primary,
                { backgroundColor: theme.text, opacity: pressed || busy ? 0.8 : 1 },
              ]}>
              {busy ? (
                <ActivityIndicator size="small" color={theme.background} />
              ) : (
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  {submitLabel}
                </ThemedText>
              )}
            </Pressable>

            {mode === 'login' ? (
              <Pressable onPress={onForgot} style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  Parolamı unuttum
                </ThemedText>
              </Pressable>
            ) : null}

            {mode === 'signup' ? (
              <Pressable onPress={onResend} style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  Kodu tekrar gönder
                </ThemedText>
              </Pressable>
            ) : null}

            {awaiting ? (
              <Pressable
                onPress={() => onChangeTab('login')}
                style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  Vazgeç
                </ThemedText>
              </Pressable>
            ) : null}

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: Spacing.five, justifyContent: 'center', flexGrow: 1 },
  header: { alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.four },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  tabs: { marginBottom: Spacing.three },
  input: { borderRadius: Spacing.three, padding: Spacing.three, fontSize: 16, borderWidth: 1 },
  mt: { marginTop: Spacing.two },
  passwordWrap: { justifyContent: 'center' },
  passwordInput: { paddingRight: Spacing.six },
  // Only `right` is set: with no top/bottom, Yoga centres it using the wrap's
  // own justifyContent, so it stays put whatever height the input works out to.
  eye: { position: 'absolute', right: Spacing.three },
  error: { marginTop: Spacing.two, marginLeft: Spacing.one },
  primary: {
    marginTop: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  link: { alignItems: 'center', paddingVertical: Spacing.three },
});
