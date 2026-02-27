# UETDS Çıktısı Sorunu

Kullanıcı OBUS sisteminde UETDS çıktısı (D1 çıktısı) alırken sorun yaşıyor.

## Akış

1. Kullanıcıya sor: "Çıktı alırken aldığınız bir hata mevcut ise alınan hatayı öğrenebilir miyim?"
2. Hata bilgisi alındıktan sonra (veya hata yoksa): "Firma adı, seferin kalkış-varış güzergahı, seferin tarih ve saatini tam olarak iletebilir misiniz?"
3. Bilgiler alındıktan sonra eskalasyon yap.

## Toplanması Gereken Bilgiler

- Alınan hata mesajı (varsa)
- Firma adı
- Seferin kalkış-varış güzergahı
- Seferin tarih ve saati

## Eskalasyon

UETDS çıktısı sorunları canlı temsilciye aktarılır.
Eskalasyon mesajı: "Kontrol ediyorum, sizi çok kısa bir süre daha bekleteceğim."

## Bot ne yapmalı

- Önce hata mesajını sor
- Ardından sefer detaylarını topla (firma, güzergah, tarih/saat)
- Bilgiler alındıktan sonra eskalasyon yap
- Soruları adım adım sor

## Bot ne YAPMAMALI

- UETDS sistemi üzerinde işlem yapabileceğini ima etme
- Tüm bilgileri tek seferde isteme
- Hata mesajını sormadan direkt bilgi isteme
- Kullanıcıya teknik çözüm önerme (bu sorunlar backend müdahalesi gerektirir)
