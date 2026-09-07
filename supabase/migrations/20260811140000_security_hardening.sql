-- Yayın öncesi güvenlik taramasında çıkan iki açık.

-- ---------------------------------------------------------------------------
-- 1. anon rolünün TRUNCATE yetkisi
--
-- Giriş yapmamış istemcinin kullandığı rol, tabloların hepsinde TRUNCATE,
-- REFERENCES ve TRIGGER yetkisine sahipti (Postgres'in varsayılan hak devrinden
-- geliyor). TRUNCATE'in tehlikesi şurada: **RLS'i tamamen atlar.** Satır bazlı
-- kurallarımızın hiçbiri onu durdurmaz, tabloyu boşaltır.
--
-- PostgREST bugün TRUNCATE'i dışarı açmıyor, yani doğrudan sömürülebilir değil.
-- Ama bu, kuralın değil aracın koruması — anon rolünün defterde hiçbir işi yok.
-- ---------------------------------------------------------------------------

revoke all on public.accounts        from anon;
revoke all on public.account_members from anon;
revoke all on public.account_invites from anon;
revoke all on public.categories      from anon;
revoke all on public.contacts        from anon;
revoke all on public.transactions    from anon;
revoke all on public.entries         from anon;

-- Bundan sonra oluşturulacak tablolar için de aynısı geçerli olsun.
alter default privileges in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------------------
-- 2. Üyenin kendi rolünü yükseltebilmesi
--
-- Eski politika şuydu:
--   USING (hesabın sahibi misin OR user_id = auth.uid())
--
-- İkinci koşul, davet edilen kişinin kendi satırını kabul edebilmesi için
-- konmuştu. Ama kabul işlemi Edge Function'da service_role ile yapılıyor, yani
-- bu koşula hiç ihtiyaç yoktu — buna karşılık şunu mümkün kılıyordu:
--
--   'viewer' rolündeki biri kendi üyelik satırını UPDATE edip role='editor'
--   yazar ve başkasının defterine işlem girmeye başlar.
--
-- UPDATE politikasında WITH CHECK yazılmadığında Postgres USING ifadesini yeni
-- satır için de uyguluyor; user_id değişmediği için kontrol geçiyordu. Rolü
-- değiştirmek yetki yükseltmenin ta kendisi.
--
-- Artık üyelik satırlarını yalnızca hesabın sahibi değiştirebilir.
-- ---------------------------------------------------------------------------

drop policy members_update on public.account_members;

create policy members_update on public.account_members
  for update using (
    exists (select 1 from public.accounts a
             where a.id = account_id and a.owner_user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.accounts a
             where a.id = account_id and a.owner_user_id = auth.uid())
  );
