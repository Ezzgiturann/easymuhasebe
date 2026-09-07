-- Kullanıcı başına günlük AI kotası.
--
-- Gemini'ye tek anahtarla bağlanıyoruz ve sınır **proje başına** işliyor, anahtar
-- başına değil. Yani bütün uygulama tek bir bütçeyi paylaşıyor: bugün bir kişinin
-- sabah yaptığı fiş taramaları, akşam soru soran herkesi kesebilir — ve kimse
-- sebebini anlamaz.
--
-- Bu tablo kotayı büyütmüyor, ADİL PAYLAŞTIRIYOR. Sınıra çarpan kişi kendi
-- hakkını doldurmuş olur; diğerleri etkilenmez.

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  kind    text not null check (kind in ('text', 'image')),
  count   integer not null default 0,
  primary key (user_id, day, kind)
);

-- RLS açık ve politika YOK — kasıtlı. Bu tablo istemcinin işi değil: kendi
-- sayacını okuyup yazabilen bir istemci, sayacını sıfırlayabilen bir istemcidir.
-- Yalnızca sunucudaki fonksiyon dokunur.
alter table public.ai_usage enable row level security;

grant select, insert, update on public.ai_usage to service_role;

-- ---------------------------------------------------------------------------
-- Hak alma: artır ve karar ver, tek ifadede.
--
-- Neden tek ifade: "önce oku, sonra artır" iki ayrı sorgu olsaydı, aynı anda
-- gelen iki istek aynı sayıyı okur ve ikisi de geçerdi — kotanın en çok
-- zorlandığı anda, tam olarak eşzamanlı istek yağdığında.
--
-- `on conflict ... where` artırmayı ve sınır kontrolünü atomik yapıyor. Sınır
-- aşıldığında hiçbir satır dönmez ve sayaç da ŞİŞMEZ: hakkı dolmuş biri denemeye
-- devam ederse sayaç yerinde kalır, yarın yine 0'dan başlar.
--
-- `current_date` sunucunun UTC günü — Türkiye saatiyle gece 03:00'te sıfırlanır.
-- Telefonun saatine bakmak, saati değiştirerek kotayı sıfırlamak demekti.
-- ---------------------------------------------------------------------------

create or replace function public.claim_ai_quota(p_user uuid, p_kind text, p_limit int)
returns boolean
language sql
security definer
set search_path = public
as $$
  insert into ai_usage (user_id, day, kind, count)
       values (p_user, current_date, p_kind, 1)
  on conflict (user_id, day, kind)
       do update set count = ai_usage.count + 1
             where ai_usage.count < p_limit
    returning true;
$$;

-- Yalnızca sunucu çağırabilir. authenticated'a verilmiyor: kendi kotasını
-- harcayabilen bir istemci, başkasınınkini de harcayabilir.
revoke all on function public.claim_ai_quota(uuid, text, int) from public, anon, authenticated;
grant execute on function public.claim_ai_quota(uuid, text, int) to service_role;
