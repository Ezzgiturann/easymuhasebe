import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * "Bu adres kayıtlı mı?"
 *
 * Parola sıfırlama ekranı bunu soruyor. Amaç kullanıcının bir saat boyunca
 * gelmeyecek bir kodu beklememesi: adres kayıtlı değilse ekran bunu söyleyip
 * "Kayıt ol" sekmesine yönlendiriyor.
 *
 * Kimliksiz çalışmak zorunda — parolasını unutmuş birinin oturumu yoktur. Bu da
 * onu doğası gereği bir tarama aracına aday yapıyor, o yüzden IP başına saatlik
 * sınırla korunuyor.
 *
 * Bilerek verilen bir taviz: bu bilgi zaten kayıt formundan sızıyordu ("bu
 * e-posta ile zaten bir hesap var"). Bir yerde söyleyip öbür yerde saklamak
 * korumak değil, yalnızca kullanıcıyı zorlamaktı.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Saatte kaç sorgu — IP başına.
 *
 * 20 ile başlamıştı ve fazla düşüktü: Türkiye'de operatörler tek bir genel IP'yi
 * yüzlerce aboneye paylaştırıyor (CGNAT), yani bir IP çoğu zaman bir kişi değil
 * bir kalabalık. Sınır tam da bu yüzden yanlış insanı kilitler. Sınamada bunu
 * canlı gördük: aynı evden yapılan test, telefonun kontrolünü kapattı.
 *
 * 60, bir insana fazlasıyla yeter (parolasını unutan biri bir iki kez sorar) ve
 * adres listesi çıkarmak isteyene hâlâ yetmez. Kaldı ki bu bilgi kayıt formundan
 * da alınabiliyor; buradaki sınır tek koruma değil, ucuz olanı.
 */
const HOURLY_LIMIT = 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** Zincirdeki ilk adres istemcininki; sonrakiler ara sunucular. */
function callerIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0].trim() || 'bilinmeyen';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: { message: 'Yalnızca POST.' } }, 405);

  const projectUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!projectUrl || !serviceKey) {
    return json({ error: { message: 'Sunucu yapılandırılmamış.' } }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: { message: 'İstek okunamadı.' } }, 400);
  }

  const email = String(body.email ?? '')
    .trim()
    .toLowerCase();
  if (!email || !email.includes('@')) {
    return json({ error: { message: 'Geçerli bir e-posta yaz.' } }, 400);
  }

  const admin = createClient(projectUrl, serviceKey);

  const { data: allowed, error: rateError } = await admin.rpc('claim_email_check', {
    p_ip: callerIp(req),
    p_limit: HOURLY_LIMIT,
  });

  // Sayaç okunamıyorsa KAPALI tarafa düşüyoruz — kotadaki tercihin tersi, ve
  // bilerek. Orada sınırı okuyamamak çalışan bir uygulamayı durdurmak demekti;
  // burada sınırsız bir adres tarama ucu açmak demek. Şüphede olan taraf hangisi
  // ise kapı ona göre kapanır.
  if (rateError) {
    console.error('email-check rate:', rateError.message);
    return json({ error: { message: 'Şu an kontrol edilemiyor, tekrar dene.' } }, 503);
  }
  if (!allowed) {
    return json({ error: { message: 'Çok fazla deneme yapıldı. Biraz bekle.' } }, 429);
  }

  // Varlık kontrolü de veritabanında: `auth` şeması API'ye açık değil ve
  // açılmamalı. Fonksiyon yalnızca "var mı yok mu" döndürüyor — kullanıcı
  // satırından hiçbir alan bu uçtan dışarı çıkmıyor.
  const { data: registered, error } = await admin.rpc('email_is_registered', {
    p_email: email,
  });

  if (error) {
    console.error('email-check query:', error.message);
    return json({ error: { message: 'Şu an kontrol edilemiyor, tekrar dene.' } }, 503);
  }

  return json({ registered: registered === true });
});
