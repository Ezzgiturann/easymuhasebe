import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { KeyboardAwareView } from '@/components/keyboard-aware-view';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { setAccountShared } from '@/db/mutations/accounts';
import { inviteMember, removeMember, type MemberRole } from '@/db/mutations/members';
import { createInvite, InviteError } from '@/share/invites';
import { sync } from '@/sync/engine';
import { profileQuery } from '@/db/profile';
import { accountQuery } from '@/db/queries/accounts';
import { membersQuery } from '@/db/queries/members';
import type { AccountMember } from '@/db/schema';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';

const roleLabel = (r: string) => (r === 'editor' ? 'Düzenleyen' : 'Görüntüleyen');

export default function ShareScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: accounts } = useLiveQuery(accountQuery(id), [id]);
  const { data: members } = useLiveQuery(membersQuery(id), [id]);
  const { data: profileRows } = useLiveQuery(profileQuery());
  const account = accounts?.[0];
  const { userId } = useSession();

  // A shared ledger opens this screen for its members too, and they are not the
  // owner. Saying "Sen · Sahip" to them was wrong on its face; worse, it left the
  // invite form open, so the local member row was written before the server got
  // to refuse — leaving phantom people in the list who could never sync.
  const isOwner = !!account && !!userId && account.ownerUserId === userId;
  const ownerName = isOwner ? profileRows?.[0]?.displayName || 'Sen' : 'Hesap sahibi';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<MemberRole>('editor');

  const list = (members ?? []) as AccountMember[];

  const [creating, setCreating] = useState(false);
  const [codeFor, setCodeFor] = useState<string | null>(null);

  /**
   * Kodu gösterir ve panoya kopyalar.
   *
   * Kopyalama otomatik: kod bir uyarı penceresinde duruyordu ve iOS'ta uyarı
   * penceresindeki yazı seçilemez — yani kodu iletmenin tek yolu sekiz karakteri
   * ezberleyip elle yazmaktı. Düğme yine de duruyor, çünkü pano başka bir şey
   * kopyalanınca kayboluyor ve pencere hâlâ açıkken bunu fark eden olur.
   */
  const showCode = async (code: string, who: string) => {
    const copy = () => Clipboard.setStringAsync(code).catch(() => false);
    const copied = await copy();

    Alert.alert(
      'Davet kodu',
      `${code}\n\n${copied ? 'Kod panoya kopyalandı; WhatsApp’a yapıştırabilirsin.\n\n' : ''}` +
        `Bu kodu ${who} ilet. Uygulamada Ana Sayfa → “Davet kodum var” ` +
        'ya da Ayarlar → Paylaşım bölümüne yazacak. Kod 7 gün geçerli.',
      [
        { text: 'Tekrar kopyala', onPress: () => void copy() },
        { text: 'Tamam', style: 'cancel' },
      ],
    );
  };

  /**
   * Bekleyen bir üye için kod üretir.
   *
   * Kod tek seferlik bir uyarı penceresinde gösterilip kayboluyordu: kapatan
   * kişinin onu geri getirmesinin hiçbir yolu yoktu ve kişi zaten listede
   * olduğu için yeniden eklemek de çözüm değildi. Her bekleyen satırın kendi
   * düğmesi var artık; her basış yeni bir kod üretiyor, eskisi de geçerli
   * kalıyor — hangisi önce kullanılırsa aynı üyelik satırını dolduruyor.
   */
  const onCode = async (m: AccountMember) => {
    if (codeFor) return;
    setCodeFor(m.id);
    try {
      await sync();
      const invite = await createInvite(id, m.id, m.role === 'viewer' ? 'viewer' : 'editor');
      await showCode(invite.code, m.displayName || 'kişiye');
    } catch (e) {
      Alert.alert('Kod üretilemedi', e instanceof InviteError ? e.message : 'Tekrar dene.');
    } finally {
      setCodeFor(null);
    }
  };

  /**
   * Tek dokunuşla davet kodu.
   *
   * Kod almak, aşağıdaki formun dibinde bir yan etkiydi: isim yaz, rol seç,
   * "Ekibe ekle"ye bas, kod uyarı penceresinde çıksın. Oysa bu ekranı açan
   * kişinin istediği şey neredeyse her zaman doğrudan kod. İsim ve rol hâlâ
   * aşağıda; sadece artık zorunlu değiller.
   */
  const onQuickCode = async () => {
    if (!account || creating || !isOwner) return;
    setCreating(true);
    try {
      // Düzenleyen varsayılan: paylaşmanın olağan sebebi birinin işlem
      // girebilmesi. Sadece görsün isteyen aşağıdaki formu kullanır.
      const memberId = inviteMember({ accountId: id, displayName: null, phone: null, role: 'editor' });
      setAccountShared(id, true);
      await sync();
      const invite = await createInvite(id, memberId, 'editor');
      await showCode(invite.code, 'karşı tarafa');
    } catch (e) {
      Alert.alert('Kod üretilemedi', e instanceof InviteError ? e.message : 'Tekrar dene.');
    } finally {
      setCreating(false);
    }
  };

  const onInvite = async () => {
    if (!account || creating) return;
    // Checked here as well as in the UI: the server is the real authority, and
    // reaching it only to be refused would already have written a local member
    // row that can never travel.
    if (!isOwner) {
      Alert.alert('Yetkin yok', 'Bu hesabı yalnızca sahibi paylaşabilir.');
      return;
    }
    if (!name.trim() && !phone.trim()) {
      Alert.alert('Bilgi eksik', 'Kişinin adını veya telefonunu yaz.');
      return;
    }

    setCreating(true);
    const memberId = inviteMember({
      accountId: id,
      displayName: name || null,
      phone: phone || null,
      role,
    });
    setAccountShared(id, true);

    try {
      // Üyelik satırı önce sunucuya gitmeli: davet o satırın id'sini işaret
      // ediyor ve kabul edildiğinde onu dolduruyor. Sunucuda olmayan bir satıra
      // davet yazmak, kabul anında dolduracak bir şey bırakmazdı.
      await sync();
      const invite = await createInvite(id, memberId, role);
      setName('');
      setPhone('');
      await showCode(invite.code, name || 'kişiye');
    } catch (e) {
      // Yerel satır duruyor: sahibin ekranında "bekliyor" olarak görünüyor ve
      // internet gelince tekrar kod üretilebilir. Daveti silmek, kullanıcının
      // yazdığı ismi de silmek olurdu.
      Alert.alert(
        'Kod üretilemedi',
        e instanceof InviteError ? e.message : 'Tekrar dene.',
      );
    } finally {
      setCreating(false);
    }
  };

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.faint },
  ];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Paylaş' }} />
      <KeyboardAwareView>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.toggleRow, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.toggleText}>
              <ThemedText type="default">Paylaşıma aç</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Açınca hesap “Paylaşılan Hesaplar”da görünür.
              </ThemedText>
            </View>
            {/* Paylaşımı açıp kapatmak sahibin kararı. Düzenleyen rolündeki biri
                bunu çevirebilseydi, kendisini davet eden kişinin defterini
                habersizce paylaşıma kapatabilirdi. */}
            <Switch
              value={!!account?.isShared}
              onValueChange={(v) => setAccountShared(id, v)}
              disabled={!isOwner}
              trackColor={{ true: theme.text }}
            />
          </View>

          {isOwner ? (
            <Pressable
              onPress={() => void onQuickCode()}
              disabled={creating}
              style={[styles.sendBtn, styles.section, { backgroundColor: theme.text, opacity: creating ? 0.6 : 1 }]}>
              <Ionicons name="key-outline" size={20} color={theme.background} />
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                {creating ? 'Kod üretiliyor…' : 'Davet kodu oluştur'}
              </ThemedText>
            </Pressable>
          ) : null}

          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            EKİP
          </ThemedText>
          <Card>
            <View style={[styles.memberRow, { borderBottomColor: list.length ? theme.hairline : 'transparent' }]}>
              <Avatar label={ownerName} color={account?.color} />
              <View style={styles.memberBody}>
                <ThemedText type="default">{ownerName}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {isOwner ? 'Sahip' : 'Sahip · bu hesabı seninle paylaştı'}
                </ThemedText>
              </View>
            </View>
            {list.map((m, i) => (
              <View
                key={m.id}
                style={[styles.memberRow, { borderBottomColor: i === list.length - 1 ? 'transparent' : theme.hairline }]}>
                <Avatar label={m.displayName || m.phone || '?'} />
                <View style={styles.memberBody}>
                  <ThemedText type="default" numberOfLines={1}>
                    {/* Tek dokunuşla üretilen davetin adı yok: kodu alan kişi
                        kim olduğunu zaten biliyor, uygulama bilmiyor. */}
                    {m.displayName || m.phone || 'Davetli'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {roleLabel(m.role)}
                    {m.status === 'pending' ? ' · bekliyor' : ''}
                  </ThemedText>
                </View>
                {isOwner && m.status === 'pending' ? (
                  <Pressable
                    onPress={() => void onCode(m)}
                    disabled={codeFor !== null}
                    hitSlop={8}
                    style={[styles.codeBtn, { borderColor: theme.faint }]}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {codeFor === m.id ? '…' : 'Kod al'}
                    </ThemedText>
                  </Pressable>
                ) : null}
                {isOwner ? (
                  <Pressable onPress={() => removeMember(m.id)} hitSlop={8}>
                    <Ionicons name="close-circle" size={22} color={theme.faint} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </Card>

          {!isOwner ? (
            <ThemedText type="small" themeColor="textSecondary" style={[styles.label, styles.section]}>
              Bu hesabı yalnızca sahibi paylaşabilir.
            </ThemedText>
          ) : null}

          {isOwner ? (
          <>
          <ThemedText type="small" themeColor="textSecondary" style={[styles.label, styles.section]}>
            EKİBE KİŞİ EKLE
          </ThemedText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="İsim"
            placeholderTextColor={theme.textSecondary}
            style={inputStyle}
          />
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Telefon"
            placeholderTextColor={theme.textSecondary}
            keyboardType="phone-pad"
            style={[inputStyle, styles.mt]}
          />
          <View style={styles.mt}>
            <Segmented<MemberRole>
              value={role}
              onChange={setRole}
              options={[
                { value: 'editor', label: 'Düzenleyen' },
                { value: 'viewer', label: 'Görüntüleyen' },
              ]}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.roleHint}>
            {role === 'editor'
              ? 'Düzenleyen: işlem ekleyip düzenleyebilir.'
              : 'Görüntüleyen: sadece görür, değiştiremez.'}
          </ThemedText>

          <Pressable
            onPress={() => void onInvite()}
            disabled={creating}
            style={[styles.sendBtn, { backgroundColor: theme.text, opacity: creating ? 0.6 : 1 }]}>
            <Ionicons name="person-add-outline" size={20} color={theme.background} />
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              {creating ? 'Kod üretiliyor…' : 'Ekibe ekle'}
            </ThemedText>
          </Pressable>
          </>
          ) : null}

          {/* Was "Canlı senkron yakında." — written before sync existed and left
              behind after it shipped. A label that describes the app's past is
              worse than no label: it tells the user a working feature is missing. */}
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            Eklediğin kişiler hesabı kendi telefonlarında görür.
          </ThemedText>
        </ScrollView>
      </KeyboardAwareView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: Spacing.five },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    marginBottom: Spacing.four,
  },
  toggleText: { flex: 1, gap: 1 },
  label: { letterSpacing: 1.2, fontSize: 11, marginLeft: Spacing.one, marginBottom: Spacing.two },
  section: { marginTop: Spacing.four },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberBody: { flex: 1, gap: 1 },
  input: { borderRadius: Spacing.three, padding: Spacing.three, fontSize: 16, borderWidth: 1 },
  mt: { marginTop: Spacing.two },
  codeBtn: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 1,
    marginRight: Spacing.two,
  },
  roleHint: { marginTop: Spacing.two, marginLeft: Spacing.one },
  sendBtn: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { marginTop: Spacing.three, textAlign: 'center' },
});
