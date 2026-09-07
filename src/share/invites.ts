import { supabase } from '@/server/supabase';

/**
 * Davet kodları — uygulamanın sunucudaki `invite` fonksiyonuyla tek teması.
 *
 * İki uç da fonksiyondan geçiyor, doğrudan tabloya yazılmıyor: kodu istemci
 * üretebilseydi kendine istediği hesaba erişim yazabilirdi, kabul eden kişi de
 * kendi üyelik satırını yazamaz — henüz o hesabın hiçbir satırını göremiyor.
 */

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Kullanıcıya gösterilebilecek hata. */
export class InviteError extends Error {}

export interface CreatedInvite {
  code: string;
  expiresAt: number;
}

export interface AcceptedInvite {
  accountId: string;
  accountName: string;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!url || !anonKey) throw new InviteError('Paylaşım henüz kurulmadı.');

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new InviteError('Bu işlem için giriş yapmalısın.');

  let response: Response;
  try {
    response = await fetch(`${url}/functions/v1/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new InviteError('Bağlantı kurulamadı. İnternetini kontrol et.');
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    /* gövde JSON değil; durum kodu yeter */
  }

  if (!response.ok) {
    const message = (payload as { error?: { message?: string } } | null)?.error?.message;
    // Sunucunun mesajı zaten Türkçe ve kullanıcıya gösterilebilir; sadece
    // beklenmedik durumlar için bir yedek metin var.
    throw new InviteError(message || `Paylaşım hatası (${response.status}).`);
  }

  return payload as T;
}

/** Bekleyen bir üyelik satırı için kod üretir. Yalnızca hesabın sahibi çağırabilir. */
export function createInvite(
  accountId: string,
  memberId: string,
  role: 'editor' | 'viewer',
): Promise<CreatedInvite> {
  return call<CreatedInvite>({ action: 'create', accountId, memberId, role });
}

/** Kodu kullanır ve çağıranı hesabın üyesi yapar. */
export function acceptInvite(code: string): Promise<AcceptedInvite> {
  return call<AcceptedInvite>({ action: 'accept', code });
}

/**
 * Kullanıcının yazdığı kodu sunucunun beklediği hâle getirir.
 *
 * Kod büyük harf ve rakamlardan oluşuyor; telefon klavyesi küçük harf yazar ve
 * insanlar araya boşluk koyar. Bunu istemcide temizlemek, "kod geçersiz" hatasını
 * boşluk yüzünden almayı önlüyor.
 */
export function normalizeCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}
