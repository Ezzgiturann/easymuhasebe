-- Sunucudaki defter: telefondaki tabloların karşılığı + kimin neyi görebileceği.
--
-- Telefondaki 8 tablonun 6'sı buraya geliyor. Gelmeyen ikisi:
--   users                    -> Supabase'in kendi auth.users tablosu var; yerel
--                               tablo sadece ad/telefon önbelleği.
--   description_suggestions  -> işlem geçmişinden yeniden üretilen yerel önbellek.
--                               Sayaç içeriyor, birleştirilemez; taşınmaz.

-- ---------------------------------------------------------------------------
-- TABLOLAR
-- ---------------------------------------------------------------------------

create table public.accounts (
  id                uuid primary key,
  owner_user_id     uuid not null references auth.users (id) on delete cascade,
  name              text not null,
  color             text not null,
  currency          text not null default 'TRY',
  is_shared         boolean not null default false,
  opening_balance   bigint not null default 0,
  opening_kasa_type text,
  sort_order        integer not null default 0,
  -- cached_balance BİLEREK YOK. İşlemlerden türetilen bir toplam; iki telefon
  -- ayrı ayrı artırıp "son yazan kazanır" ile birleşirse bakiye yanlış çıkar.
  -- Her cihaz kendi kopyasını kendi verisinden hesaplar.
  created_at        bigint not null,
  updated_at        bigint not null,
  created_by        uuid,
  updated_by        uuid,
  device_id         uuid,
  deleted_at        bigint
);

create table public.account_members (
  id            uuid primary key,
  account_id    uuid not null references public.accounts (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete cascade,
  phone         text,
  display_name  text,
  role          text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  status        text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  invited_by    uuid,
  created_at    bigint not null,
  updated_at    bigint not null,
  created_by    uuid,
  updated_by    uuid,
  device_id     uuid,
  deleted_at    bigint
);

create table public.categories (
  id          uuid primary key,
  account_id  uuid not null references public.accounts (id) on delete cascade,
  name        text not null,
  icon        text not null default 'tag',
  color       text,
  kind        text not null check (kind in ('income', 'expense')),
  sort_order  integer not null default 0,
  created_at  bigint not null,
  updated_at  bigint not null,
  created_by  uuid,
  updated_by  uuid,
  device_id   uuid,
  deleted_at  bigint
);

create table public.contacts (
  id                uuid primary key,
  account_id        uuid not null references public.accounts (id) on delete cascade,
  name              text not null,
  phone             text,
  note              text,
  opening_balance   bigint not null default 0,
  payment_term_days integer,
  created_at        bigint not null,
  updated_at        bigint not null,
  created_by        uuid,
  updated_by        uuid,
  device_id         uuid,
  deleted_at        bigint
);

create table public.transactions (
  id               uuid primary key,
  account_id       uuid not null references public.accounts (id) on delete cascade,
  tx_date          text not null,
  kind             text not null,
  direction        text not null check (direction in ('in', 'out')),
  amount           bigint not null,
  kasa_type        text,
  to_kasa_type     text,
  category_id      uuid references public.categories (id),
  contact_id       uuid references public.contacts (id),
  description      text,
  description_norm text,
  note             text,
  -- Telefondaki dosya yolu. Fotoğrafın kendisi Storage'a taşınana kadar bu
  -- alan başka cihazda bir işe yaramaz; taşınıyor olması ileride bağlanacak.
  receipt_uri      text,
  created_at       bigint not null,
  updated_at       bigint not null,
  created_by       uuid,
  updated_by       uuid,
  device_id        uuid,
  deleted_at       bigint
);

create table public.entries (
  id             uuid primary key,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  account_id     uuid not null references public.accounts (id) on delete cascade,
  tx_date        text not null,
  ledger_type    text not null,
  kasa_type      text,
  category_id    uuid references public.categories (id),
  contact_id     uuid references public.contacts (id),
  amount         bigint not null,
  created_at     bigint not null,
  updated_at     bigint not null,
  created_by     uuid,
  updated_by     uuid,
  device_id      uuid,
  deleted_at     bigint
);

-- ---------------------------------------------------------------------------
-- İNDEKSLER
--
-- Senkronun her çekişi "şu tarihten sonra değişenler" diye soruyor, o yüzden
-- her tabloda (account_id, updated_at) indeksi var. Onsuz her çekiş tabloyu
-- baştan sona tarar ve defter büyüdükçe yavaşlar.
-- ---------------------------------------------------------------------------

create index accounts_owner_idx      on public.accounts (owner_user_id);
create index accounts_sync_idx       on public.accounts (owner_user_id, updated_at);
create index members_account_idx     on public.account_members (account_id, updated_at);
create index members_user_idx        on public.account_members (user_id) where user_id is not null;
create index categories_sync_idx     on public.categories (account_id, updated_at);
create index contacts_sync_idx       on public.contacts (account_id, updated_at);
create index transactions_sync_idx   on public.transactions (account_id, updated_at);
create index transactions_date_idx   on public.transactions (account_id, tx_date);
create index entries_sync_idx        on public.entries (account_id, updated_at);
create index entries_tx_idx          on public.entries (transaction_id);

-- ---------------------------------------------------------------------------
-- ERİŞİM KURALLARI
--
-- İki yardımcı fonksiyon. `security definer` olmaları kritik: fonksiyon kendi
-- sahibinin yetkisiyle çalışır, yani içindeki sorgu RLS'e takılmaz. Olmasaydı
-- account_members'ın politikası account_members'ı sorgular, o da politikayı
-- tekrar çağırır ve Postgres sonsuz özyineleme hatası verirdi. Supabase'de en
-- sık düşülen tuzak budur.
--
-- `set search_path` da güvenlik gereği: definer bir fonksiyonda arama yolu
-- sabitlenmezse, çağıran taraf kendi şemasını öne alıp fonksiyonun hangi tabloya
-- baktığını değiştirebilir.
-- ---------------------------------------------------------------------------

create or replace function public.can_read_account(a uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.accounts acc
     where acc.id = a and acc.owner_user_id = auth.uid()
  ) or exists (
    select 1 from public.account_members m
     where m.account_id = a
       and m.user_id = auth.uid()
       and m.status = 'active'
       and m.deleted_at is null
  );
$$;

-- Okuyabilmek yazabilmek değil. 'viewer' rolü defteri görür ama işlem giremez;
-- ayrımı burada yapmazsak rol alanı süs olur.
create or replace function public.can_write_account(a uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.accounts acc
     where acc.id = a and acc.owner_user_id = auth.uid()
  ) or exists (
    select 1 from public.account_members m
     where m.account_id = a
       and m.user_id = auth.uid()
       and m.status = 'active'
       and m.deleted_at is null
       and m.role in ('owner', 'editor')
  );
$$;

alter table public.accounts        enable row level security;
alter table public.account_members enable row level security;
alter table public.categories      enable row level security;
alter table public.contacts        enable row level security;
alter table public.transactions    enable row level security;
alter table public.entries         enable row level security;

-- RLS açıldığı anda varsayılan "hiç kimse hiçbir şey" olur. Aşağıda tek tek
-- verilmeyen her yetki kapalıdır — DELETE dahil, ve bu kasıtlı: hiçbir satır
-- fiziksel silinmiyor, silme deleted_at yazan bir UPDATE.

create policy accounts_select on public.accounts
  for select using (can_read_account(id));

-- Hesabı ancak kendi adına açabilirsin. Bu satır olmasa biri başkasının
-- kimliğiyle hesap yaratıp o kişinin defterine erişim iddia edebilirdi.
create policy accounts_insert on public.accounts
  for insert with check (owner_user_id = auth.uid());

create policy accounts_update on public.accounts
  for update using (can_write_account(id))
  with check (owner_user_id = auth.uid());

create policy members_select on public.account_members
  for select using (can_read_account(account_id));

-- Davet etmek ve daveti geri almak hesap sahibinin işi, editörün değil.
create policy members_insert on public.account_members
  for insert with check (
    exists (select 1 from public.accounts a
             where a.id = account_id and a.owner_user_id = auth.uid())
  );

create policy members_update on public.account_members
  for update using (
    exists (select 1 from public.accounts a
             where a.id = account_id and a.owner_user_id = auth.uid())
    -- Davet edilen kişi kendi satırını kabul edebilsin diye.
    or user_id = auth.uid()
  );

create policy categories_select on public.categories
  for select using (can_read_account(account_id));
create policy categories_insert on public.categories
  for insert with check (can_write_account(account_id));
create policy categories_update on public.categories
  for update using (can_write_account(account_id));

create policy contacts_select on public.contacts
  for select using (can_read_account(account_id));
create policy contacts_insert on public.contacts
  for insert with check (can_write_account(account_id));
create policy contacts_update on public.contacts
  for update using (can_write_account(account_id));

create policy transactions_select on public.transactions
  for select using (can_read_account(account_id));
create policy transactions_insert on public.transactions
  for insert with check (can_write_account(account_id));
create policy transactions_update on public.transactions
  for update using (can_write_account(account_id));

create policy entries_select on public.entries
  for select using (can_read_account(account_id));
create policy entries_insert on public.entries
  for insert with check (can_write_account(account_id));
create policy entries_update on public.entries
  for update using (can_write_account(account_id));
