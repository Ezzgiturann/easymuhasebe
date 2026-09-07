-- Tablo izinleri.
--
-- Postgres'te erişim iki ayrı kapıdan geçiyor ve ikisi de açık olmalı:
--
--   GRANT  -> "bu rol bu tabloya hiç dokunabilir mi?"   (tablo düzeyi)
--   RLS    -> "hangi satırlarına dokunabilir?"          (satır düzeyi)
--
-- Bir önceki migration yalnızca ikincisini yazmıştı. Sonuç: politikalar kusursuz
-- görünüyordu ama her istek "permission denied for table accounts" ile dönüyordu.
-- Politika yazmak izin vermek değildir.
--
-- DELETE bilerek verilmiyor. Hiçbir satır fiziksel silinmiyor; silmek deleted_at
-- yazan bir UPDATE. İzni hiç vermemek, ileride yanlışlıkla yazılmış bir DELETE'in
-- veritabanına ulaşmasını da imkânsız kılar.
--
-- anon rolüne hiçbir şey verilmiyor: giriş yapmamış bir istemcinin defterde işi yok.

grant usage on schema public to authenticated;

grant select, insert, update on public.accounts        to authenticated;
grant select, insert, update on public.account_members to authenticated;
grant select, insert, update on public.categories      to authenticated;
grant select, insert, update on public.contacts        to authenticated;
grant select, insert, update on public.transactions    to authenticated;
grant select, insert, update on public.entries         to authenticated;

grant execute on function public.can_read_account(uuid)  to authenticated;
grant execute on function public.can_write_account(uuid) to authenticated;
