-- "Bu adres kayıtlı mı" sorusu için IP başına hız sınırı.
--
-- Parola sıfırlama ekranı, adresin kayıtlı olmadığını açıkça söyleyebilsin diye
-- bir kontrol ucu açıyoruz. Kullanıcı o anda oturum açmış olamaz — parolasını
-- unutmuş — dolayısıyla uç kimliksiz çalışmak zorunda.
--
-- Kimliksiz bir "kayıtlı mı" ucu, sınırsız bırakılırsa adres tarama aracıdır.
-- Sınırlandığında ise gerçek kullanıcıya yetip tarayana yetmeyen bir şey olur:
-- parolasını unutan biri saatte bir iki kez sorar, liste çıkarmak isteyen binlerce.
--
-- Not: bu bilgi zaten kayıt formundan sızıyordu ("bu e-posta ile zaten bir hesap
-- var"). Sıfırlamada saklamak hiçbir şeyi korumuyor, yalnızca kullanıcıyı
-- gelmeyecek bir kodu beklerken bırakıyordu.

create table public.email_check_rate (
  ip     text not null,
  hour   timestamptz not null,
  count  integer not null default 0,
  primary key (ip, hour)
);

-- İstemcinin işi değil; yalnızca sunucudaki fonksiyon dokunur.
alter table public.email_check_rate enable row level security;
grant select, insert, update on public.email_check_rate to service_role;

-- Aynı atomik örüntü: artır ve karar ver tek ifadede. Ayrı okuma/yazma olsaydı,
-- eşzamanlı istek yağdığında — yani tam da tarama anında — sınır delinirdi.
create or replace function public.claim_email_check(p_ip text, p_limit int)
returns boolean
language sql
security definer
set search_path = public
as $$
  insert into email_check_rate (ip, hour, count)
       values (p_ip, date_trunc('hour', now()), 1)
  on conflict (ip, hour)
       do update set count = email_check_rate.count + 1
             where email_check_rate.count < p_limit
    returning true;
$$;

revoke all on function public.claim_email_check(text, int) from public, anon, authenticated;
grant execute on function public.claim_email_check(text, int) to service_role;

-- ---------------------------------------------------------------------------
-- Varlık kontrolü de burada, PostgREST üzerinden değil.
--
-- `auth` şeması API'ye açık değil (ve açılmamalı). Kontrolü `security definer`
-- bir fonksiyona koymak, auth tablosuna erişimi tek bir satıra hapsediyor:
-- fonksiyon yalnızca "var mı yok mu" diyor, kullanıcı satırından hiçbir şey
-- dışarı çıkmıyor.
-- ---------------------------------------------------------------------------

create or replace function public.email_is_registered(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from auth.users u where lower(u.email) = lower(p_email));
$$;

revoke all on function public.email_is_registered(text) from public, anon, authenticated;
grant execute on function public.email_is_registered(text) to service_role;
