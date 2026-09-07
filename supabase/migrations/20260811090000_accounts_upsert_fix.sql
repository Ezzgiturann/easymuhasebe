-- Hesabın kendi eklenmesine takılmasını düzeltir.
--
-- Senkron motoru satırları UPSERT ile gönderiyor: INSERT ... ON CONFLICT (id)
-- DO UPDATE. Postgres bu ifadede, çakışma olmasa bile, çakışabilecek satırı
-- okuyabilmesi gerektiği için SELECT politikasını da uyguluyor.
--
-- Eski politika `can_read_account(id)` idi: hesabı accounts tablosunda arayan bir
-- fonksiyon. Yeni bir hesap henüz o tabloda olmadığı için cevap "okuyamazsın"
-- çıkıyor ve ekleme kendi okunamazlığına takılıyordu. Belirtisi kafa karıştırıcı:
-- düz INSERT 201 dönüyor, aynı satır UPSERT ile 403 dönüyordu.
--
-- Çözüm satırı aramak yerine satıra bakmak: sahibi zaten satırın kendi
-- `owner_user_id` sütununda yazıyor. Paylaşılan hesaplar için üyelik araması
-- gereklidir, o yüzden ikinci koşul duruyor.
--
-- Alt tablolar (categories, transactions, ...) bu sorundan etkilenmiyor: onların
-- politikası `account_id`'ye bakıyor ve o hesap zaten var.

drop policy accounts_select on public.accounts;

create policy accounts_select on public.accounts
  for select using (owner_user_id = auth.uid() or can_read_account(id));
