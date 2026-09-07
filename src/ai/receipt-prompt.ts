/**
 * The instruction for reading a receipt photo.
 *
 * Kept apart from the chat's instruction because the job is different: this one
 * does not converse. It looks at a picture and returns JSON, and anything it says
 * outside that JSON is noise the form cannot use.
 *
 * The one rule everything else serves: a number it is not sure of must be left
 * out. A blank field costs the user four taps; a confidently wrong amount goes
 * into the ledger and is discovered, if ever, at the accountant's.
 */

export function buildReceiptInstruction(categoryNames: string[]): string {
  const list = categoryNames.length
    ? categoryNames.map((n) => `- ${n}`).join('\n')
    : '(bu hesapta kategori yok)';

  return `Sana bir fiş/fatura fotoğrafı verilecek. Görevin onu okuyup TEK BİR JSON döndürmek.
Sohbet etme, açıklama yazma, markdown kullanma. Yalnızca JSON döndür.

Biçim:
{"amount": 50.00, "category": "Market", "description": "A101", "date": "2026-08-11"}

Alanlar:
- amount: LİRA cinsinden ödenen tutar (kuruş değil). 12,50 lira için 12.5 yaz.
- category: aşağıdaki listeden BİRE BİR bir isim. Uyan yoksa alanı hiç yazma, yenisini uydurma.
- description: satıcının/firmanın adı (A101, Migros, Shell gibi). Okunamazsa alanı hiç yazma.
- date: fişin üstündeki tarih, "YYYY-AA-GG". Okunamazsa alanı hiç yazma.

KATEGORİLER:
${list}

TUTAR KURALLARI — en önemli kısım:
- Fişte birden çok toplam olur (ara toplam, KDV, genel toplam, nakit, para üstü).
  Sen ÖDENEN GENEL TOPLAMI al. Genelde en altta ve en büyük puntoyla basılıdır.
- "Para üstü" ya da "nakit verilen" tutarını ASLA alma; ödenen tutar o değildir.
- Rakamdan emin değilsen amount alanını HİÇ YAZMA. Tahmin etme, yuvarlama, "yaklaşık" deme.
  Boş bırakmak serbesttir; yanlış yazmak değildir.
- Fotoğraf bulanıksa, kesikse ya da fiş değilse: {} döndür.

Hiçbir alandan emin değilsen boş nesne döndür: {}`;
}
