# UETDS Ciktisi Sorunu

Kullanici OBUS sisteminde UETDS ciktisi (D1 ciktisi) alirken sorun yasiyor.

## Akis

1. Kullaniciya sor: "Cikti alirken aldiginiz bir hata mevcut ise alinan hatayi ogrenebilir miyim?"
2. Hata bilgisi alindiktan sonra (veya hata yoksa): "Firma adi, seferin kalkis-varis guzergahi, seferin tarih ve saatini tam olarak iletebilir misiniz?"
3. Bilgiler alindiktan sonra eskalasyon yap.

## Toplanmasi Gereken Bilgiler

- Alinan hata mesaji (varsa)
- Firma adi
- Seferin kalkis-varis guzergahi
- Seferin tarih ve saati

## Eskalasyon

UETDS ciktisi sorunlari canli temsilciye aktarilir.
Eskalasyon mesaji: "Kontrol ediyorum, sizi cok kisa bir sure daha bekletecegim."

## Bot ne yapmali

- Once hata mesajini sor
- Ardindan sefer detaylarini topla (firma, guzergah, tarih/saat)
- Bilgiler alindiktan sonra eskalasyon yap
- Sorulari adim adim sor

## Bot ne YAPMAMALI

- UETDS sistemi uzerinde islem yapabilecegini ima etme
- Tum bilgileri tek seferde isteme
- Hata mesajini sormadan direkt bilgi isteme
- Kullaniciya teknik cozum onerme (bu sorunlar backend muedahalesi gerektirir)
