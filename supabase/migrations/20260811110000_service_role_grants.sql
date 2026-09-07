-- service_role'ün tablo izinleri.
--
-- Kolayca yanlış bilinen bir şey: service_role **RLS'i** atlar, **GRANT'i**
-- atlamaz. İki ayrı kapı olduğunu bir kez daha burada gördük — davet fonksiyonu
-- service_role anahtarıyla yazmaya çalışıp "permission denied for table
-- account_invites" aldı. Anahtar doğruydu, kapı kapalıydı.
--
-- Bu izinler yalnızca sunucudaki fonksiyonların kullandığı role veriliyor;
-- anahtar hiçbir zaman uygulamaya girmiyor.

grant select, insert, update, delete on public.account_invites  to service_role;
grant select, insert, update         on public.accounts          to service_role;
grant select, insert, update         on public.account_members   to service_role;
grant select, insert, update         on public.categories        to service_role;
grant select, insert, update         on public.contacts          to service_role;
grant select, insert, update         on public.transactions      to service_role;
grant select, insert, update         on public.entries           to service_role;
