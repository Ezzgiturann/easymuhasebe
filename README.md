# Easy Hesap

Esnaf ve küçük işletmeler için basit bir hesap defteri uygulaması. Nakit
giriş/çıkış, veresiye satış/alış, tahsilat/ödeme ve kasalar arası transfer —
kullanıcı hiçbir zaman "borç/alacak" görmez, sadece "kime ne kadar verdim,
kimden ne kadar aldım" görür. Arka planda her işlem çift taraflı (double-entry)
bir defter olarak tutulur; muhasebe kısmı tamamen perde arkasında kalır.

React Native + [Expo](https://expo.dev) ile yazıldı, iOS ve Android'de Expo Go
üzerinden çalışır.

## Özellikler

- **İşlemler** — nakit gelir/gider, veresiye satış/alış, tahsilat/ödeme,
  kasadan kasaya transfer. Tutarlar kuruş cinsinden tam sayı olarak tutulur;
  yuvarlama hatası yok.
- **Cariler** — müşteri/tedarikçi bazında bakiye takibi, vadesi geçen
  veresiyeler için uyarı.
- **Kasalar** — nakit, banka, kredi kartı ayrımı; hesap bazında kasa kırılımı.
- **Kategoriler** — gelir/gider için önceden tanımlı kategori seti, ihtiyaca
  göre düzenlenebilir.
- **Hesap paylaşımı** — bir hesabı davet koduyla başka bir kullanıcıyla
  paylaşma (ör. işletme sahibi + muhasebeci). Yetkilendirme tamamen sunucu
  tarafında (Supabase Edge Function + RLS), istemci kendine erişim yazamaz.
- **AI asistan** — "Ahmet'e 500 lira veresiye verdim" gibi doğal dil
  girdisinden işlem önerisi çıkarır; kullanıcı onaylamadan hiçbir şey
  kaydedilmez. Fiş/fatura fotoğrafını okuyup tutar-tarih-kategori önerir.
  Model sadece **öneri üretir**, yazma işlemini her zaman `buildEntries`
  (çift taraflı defterin denklik kontrolü) üzerinden geçen istemci kodu yapar.
- **Çevrimdışı öncelikli** — veri cihazda SQLite'ta tutulur, Supabase ile
  arka planda senkronize olur (pull-then-push, last-write-wins çakışma
  çözümü). İnternet olmadan da çalışır.
- **Ekran kilidi** — 4 haneli PIN + Face ID/Touch ID. Şifreleme değil, hızlı
  bakan biri için bir engel.
- **Yedekleme** — tüm veritabanının tek bir JSON dosyası olarak dışa/içe
  aktarımı; CSV dışa aktarım.
- **Açık/Koyu tema** — cihaz ayarından bağımsız, kullanıcının kendi seçimi.

## Teknoloji

| Katman | Teknoloji |
|---|---|
| Uygulama | Expo SDK 54 · React Native 0.81 · React 19 · TypeScript (strict) |
| Yönlendirme | `expo-router` (dosya tabanlı, typed routes) |
| Yerel veritabanı | `expo-sqlite` + Drizzle ORM |
| Sunucu | Supabase (Postgres, Auth, RLS, Edge Functions / Deno) |
| Yapay zeka | Google Gemini — anahtar yalnızca sunucuda (`ai-proxy` Edge Function), istemci hiçbir zaman görmez |
| Test | Jest (`jest-expo`) — saf mantık: `postings`, `money`, `dates`, `normalize`, `overdue`, `search`, senkronizasyon çözümü |

## Mimari

```
src/
  app/         Ekranlar (expo-router). _layout.tsx kök: Theme → Database → SelectedAccount → Stack.
  db/          Şema, sorgular, mutasyonlar ve çift taraflı defterin çekirdeği (postings.ts).
  ai/          Salt-okunur asistan. client.ts sağlayıcıyı bilen tek dosya.
  sync/        Cihaz ↔ Supabase senkronizasyon motoru (pull → push, last-write-wins).
  share/       Hesap davet kodları (oluşturma/kabul sunucuda, RLS bypass edilmez).
  lock/        PIN kuralları — depolama ve kriptodan bağımsız, testli.
  auth/        Oturum, kimlik bilgileri.
  components/  Paylaşılan UI (ThemedView/ThemedText üzerine kurulu).
  constants/   Tema (Colors/Spacing/Fonts), varsayılan kategoriler, etiketler.
supabase/
  functions/   ai-proxy, invite, email-check — istemcinin yapamayacağı her şey burada.
  migrations/  Şema, RLS, senkron izinleri, davet sistemi, AI kotası.
```

**Para birimi:** tüm tutarlar kuruş cinsinden `integer`. `utils/money.ts`
dışında hiçbir yerde ondalık işlem yapılmaz.

**Çift taraflı defter:** kullanıcı arayüzünde debit/credit hiç görünmez;
`buildEntries` her işlemi dengeli postinglere çevirir ve toplamın sıfır
olduğunu assert eder. Bu, uygulamanın parayı tuttuğu tek yerdir.

**Güvenlik modeli:** Supabase anon key istemci paketine gömülü (kasıtlı —
public bir tanımlayıcı, sır değil). `service_role` anahtarı ve Gemini API
anahtarı yalnızca sunucuda, Edge Function ortam değişkeni olarak durur ve asla
git'e ya da uygulamaya girmez. Davet kabul etme gibi RLS'in izin vermediği
işlemler `service_role` ile sunucuda yapılır.

## Kurulum

```bash
npm install
cp .env.example .env                      # Supabase URL/anon key + SMTP
cp supabase/.env.local.example supabase/.env.local   # Gemini API key (yerel fonksiyon testi için)
```

Yerel Supabase (Docker gerektirir):

```bash
npx supabase start
npx supabase db reset          # migrations'ı uygular
```

Uygulamayı başlat:

```bash
npm start            # dev server, platform seç
npm run ios           # start + iOS simulator
npm run android        # start + Android emulator
```

Fiziksel cihazda test için **Expo Go** kullanılıyor — eklenen her paketin
Expo Go tarafından desteklendiğinden emin olun, yeni native modülden sonra
`npx expo start -c` gerekir.

## Doğrulama

```bash
npm test                                             # jest-expo, saf mantık testleri
npm run typecheck                                    # tsc --noEmit, strict
npm run lint                                          # expo lint
npx expo export --platform ios --output-dir /tmp/x   # bundle'ın gerçekten kurulduğunu doğrular
```

## Kapsam dışı

- **Web hedeflenmiyor.** `expo export --platform web` başarıyla çalışır ama
  uygulama gerçekte çalışmaz (`expo-sqlite` OPFS için cross-origin izolasyon,
  `Alert.alert` web'de boş fonksiyon, `expo-file-system/legacy` web'de null
  shim). `react-native-web`/`react-dom` yalnızca `expo-router`/`expo-image`
  bağımlılığı olduğu için pakette duruyor.

## Lisans

Özel proje — açık kaynak lisansı belirtilmemiştir.
