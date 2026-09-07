-- Davetler.
--
-- Ayrı bir tablo, account_members'a bir sütun eklemek yerine. Sebep: davet
-- kodunu görebilecek tek kişi hesabın sahibi, davet edilen kişi ise kodu
-- kullanabilmeli ama hesabın hiçbir satırını göremiyor olmalı — henüz üye değil.
-- İki farklı erişim kuralı, iki farklı tablo.
--
-- Kodun kendisi sunucuda üretiliyor ve INSERT yetkisi hiç kimseye verilmiyor:
-- davet oluşturmak da kabul etmek de Edge Function üzerinden geçiyor. İstemcinin
-- kendi davetini yazabilmesi, kendine istediği hesaba erişim yazabilmesi demekti.

create table public.account_invites (
  id          uuid primary key,
  account_id  uuid not null references public.accounts (id) on delete cascade,
  -- Doldurulacak account_members satırı. Davet kabul edilince o satıra user_id
  -- yazılıyor; yeni bir satır açılmıyor, çünkü sahibin ekranında davet zaten
  -- "bekliyor" olarak duruyor ve ikinci satır orayı çiftler.
  member_id   uuid not null,
  code        text not null unique,
  role        text not null check (role in ('editor', 'viewer')),
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  bigint not null,
  expires_at  bigint not null,
  accepted_at bigint,
  accepted_by uuid references auth.users (id) on delete set null
);

create index account_invites_code_idx    on public.account_invites (code);
create index account_invites_account_idx on public.account_invites (account_id);

alter table public.account_invites enable row level security;

-- Sahip kendi davetlerini görebilir: kodu tekrar göstermek, süresini okumak için.
-- INSERT/UPDATE/DELETE politikası bilerek yok — hepsi fonksiyondan geçiyor.
create policy invites_select on public.account_invites
  for select using (
    exists (select 1 from public.accounts a
             where a.id = account_id and a.owner_user_id = auth.uid())
  );

grant select on public.account_invites to authenticated;
