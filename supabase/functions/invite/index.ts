import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Davet oluşturma ve kabul etme.
 *
 * İki iş de burada, çünkü ikisi de istemcinin yapamayacağı bir şey yapıyor:
 *
 *  - create: kodu üretip yazar. İstemci kendi davetini yazabilseydi, kendine
 *    istediği hesaba erişim yazabilirdi.
 *  - accept: davet edilen kişiyi üye yapar. O kişi henüz hesabın hiçbir satırını
 *    göremiyor, dolayısıyla kendi üyelik satırını da yazamaz — RLS'e takılır.
 *    Bu yüzden burada service_role ile yazılıyor; anahtar sunucuda kalıyor.
 *
 * Bağlantı değil kod: Expo Go'da derin bağlantılar kırılgan çıktı (e-posta
 * doğrulamasında aynı yolu denedik ve geri döndük). Kod WhatsApp'tan da okunur,
 * telefonda elle de yazılır.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Karıştırılabilecek harfler yok: 0/O, 1/I/l. Kod elle yazılacak. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function newCode(): string {
  // crypto.getRandomValues, Math.random değil: kod tahmin edilemez olmalı.
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: { message: 'Yalnızca POST.' } }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !anonKey || !serviceKey) {
    return json({ error: { message: 'Sunucu yapılandırılmamış.' } }, 503);
  }

  // Kim olduğunu kullanıcının kendi jetonuyla soruyoruz; service_role ile
  // sorsaydık "isteği kim yaptı" sorusunun cevabı kaybolurdu.
  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: { message: 'Bu işlem için giriş yapmalısın.' } }, 401);
  }
  const userId = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: { message: 'İstek okunamadı.' } }, 400);
  }

  const admin = createClient(url, serviceKey);
  const now = Date.now();

  if (body.action === 'create') {
    const accountId = String(body.accountId ?? '');
    const memberId = String(body.memberId ?? '');
    const role = body.role === 'viewer' ? 'viewer' : 'editor';
    if (!accountId || !memberId) return json({ error: { message: 'Eksik bilgi.' } }, 400);

    // Sahiplik kontrolü açıkça yapılıyor. Kullanıcının jetonuyla okuyoruz, yani
    // RLS de aynı cevabı doğruluyor — sahibi olmadığı bir hesap zaten görünmez.
    const { data: account } = await asUser
      .from('accounts')
      .select('id, owner_user_id')
      .eq('id', accountId)
      .maybeSingle();
    if (!account || account.owner_user_id !== userId) {
      return json({ error: { message: 'Bu hesabı paylaşma yetkin yok.' } }, 403);
    }

    // memberId'nin gerçekten bu hesabın satırı olduğunu doğrula.
    //
    // Doğrulanmasaydı, kendi hesabının sahibi olan biri BAŞKA bir hesaba ait
    // üyelik satırının id'sini davete koyabilir; davet kabul edilince o satır
    // upsert ile bu hesaba taşınır ve kişi öteki defterden sessizce düşerdi.
    // Satırın hiç olmaması normal — tek dokunuşluk davette henüz gönderilmemiş
    // olabilir; ama varsa başkasının olmamalı.
    const { data: member } = await admin
      .from('account_members')
      .select('id, account_id')
      .eq('id', memberId)
      .maybeSingle();
    if (member && member.account_id !== accountId) {
      return json({ error: { message: 'Bu davet bu hesaba ait değil.' } }, 400);
    }

    const code = newCode();
    const { error } = await admin.from('account_invites').insert({
      id: crypto.randomUUID(),
      account_id: accountId,
      member_id: memberId,
      code,
      role,
      created_by: userId,
      created_at: now,
      expires_at: now + TTL_MS,
    });
    if (error) {
      console.error('invite create:', error.message);
      return json({ error: { message: 'Davet oluşturulamadı.' } }, 500);
    }

    return json({ code, expiresAt: now + TTL_MS });
  }

  if (body.action === 'accept') {
    const code = String(body.code ?? '')
      .toUpperCase()
      .replace(/\s/g, '');
    if (!code) return json({ error: { message: 'Kod boş.' } }, 400);

    const { data: invite } = await admin
      .from('account_invites')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    // Tek ve aynı mesaj: "böyle bir kod yok" ile "süresi dolmuş" arasındaki fark,
    // kod deneyerek arayan birine hangi kodların var olduğunu söylerdi.
    const bad = json({ error: { message: 'Kod geçersiz ya da süresi dolmuş.' } }, 404);
    if (!invite || invite.accepted_at !== null || Number(invite.expires_at) < now) return bad;

    const { data: account } = await admin
      .from('accounts')
      .select('id, name, owner_user_id')
      .eq('id', invite.account_id)
      .maybeSingle();
    if (!account) return bad;
    if (account.owner_user_id === userId) {
      return json({ error: { message: 'Bu hesap zaten senin.' } }, 400);
    }

    // Sahibin ekranındaki "bekliyor" satırının kendisi dolduruluyor; yeni satır
    // açmak orayı çiftlerdi.
    const { error: memberError } = await admin.from('account_members').upsert(
      {
        id: invite.member_id,
        account_id: invite.account_id,
        user_id: userId,
        role: invite.role,
        status: 'active',
        invited_by: invite.created_by,
        created_at: now,
        updated_at: now,
        created_by: invite.created_by,
        updated_by: userId,
      },
      { onConflict: 'id' },
    );
    if (memberError) {
      console.error('invite accept member:', memberError.message);
      return json({ error: { message: 'Katılma işlemi tamamlanamadı.' } }, 500);
    }

    // Üyelik yazıldıktan sonra işaretleniyor: sıra tersine olsaydı, üyelik
    // yazılamadığında kod da harcanmış olurdu.
    await admin
      .from('account_invites')
      .update({ accepted_at: now, accepted_by: userId })
      .eq('id', invite.id);

    return json({ accountId: account.id, accountName: account.name });
  }

  return json({ error: { message: 'Bilinmeyen işlem.' } }, 400);
});
