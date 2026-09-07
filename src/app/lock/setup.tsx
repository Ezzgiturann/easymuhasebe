import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { setPin } from '@/lock/store';
import { pinRejectionReason } from '@/lock/pin';
import { LockScreen } from '@/components/lock-screen';
import { useLock } from '@/hooks/use-lock';

/**
 * Choosing a PIN: enter it once, then again.
 *
 * The second pass is not ceremony — a PIN mistyped once is a PIN that locks the
 * owner out of their own ledger on the next cold start, with no reset short of
 * deleting the app.
 */
export default function LockSetupScreen() {
  const router = useRouter();
  const { refresh } = useLock();
  const [first, setFirst] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onComplete = (pin: string) => {
    if (saving) return;

    if (first === null) {
      const reason = pinRejectionReason(pin);
      if (reason) {
        Alert.alert('Olmadı', reason);
        return;
      }
      setFirst(pin);
      return;
    }

    if (pin !== first) {
      Alert.alert('Eşleşmedi', 'İki PIN aynı değil, baştan deneyelim.');
      setFirst(null);
      return;
    }

    setSaving(true);
    setPin(pin)
      .then(refresh)
      .then(() => {
        router.dismiss();
        Alert.alert('PIN açıldı', 'Uygulamayı her açtığında PIN sorulacak.');
      })
      .catch(() => {
        Alert.alert('Kaydedilemedi', 'PIN telefona yazılamadı, tekrar dene.');
        setFirst(null);
      })
      .finally(() => setSaving(false));
  };

  return (
    <LockScreen
      title={first === null ? 'Yeni PIN belirle' : 'PIN’i tekrar gir'}
      onComplete={onComplete}
      onUnlock={() => {}}
      allowBiometric={false}
    />
  );
}
