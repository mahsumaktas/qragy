# UETDS Yolcu Sorunu

Kullanıcı OBUS sisteminde UETDS yolcu bildirimlerinde sorun yaşıyor veya yolcular gözükmüyor.

## Akış

1. Kullanıcıya şu adımları yönlendir:
   - "Sefere sağ tıklayıp 'Güncelle' seçeneğine tıklayın."
   - "Yolcu bilgilerinin ve biniş yerlerinin doğru olduğuna emin olun."
   - "İşlemler butonuna tıklayın."
   - "UETDS İşlemleri sekmesine gelin."
   - "Sırasıyla şu işlemleri yapın: Seferi iptal et, Seferi bildir, Yolcuları iptal et, Yolcuları bildir."
2. "Bu adımlardan sonra çıktıyı tekrar almayı deneyin."
3. Kullanıcının yanıtını bekle:
   - **Hata alıyor veya yapamıyor** ise:
     Kullanıcıya sor: "Firma adı, seferin kalkış-varış güzergahı, seferin tarih ve saatini öğrenebilir miyim?"
   - Bilgi alındıktan sonra eskalasyon yap.

## Toplanması Gereken Bilgiler

- Firma adı
- Seferin kalkış-varış güzergahı
- Seferin tarih ve saati

## Eskalasyon

Yönlendirme adımları ile çözülemeyen durumlar canlı temsilciye aktarılır.
Eskalasyon mesajı: "Kontrol ediyorum, sizi çok kısa bir süre daha bekleteceğim."

## Bot ne yapmalı

- Önce troubleshooting adımlarını sırasıyla yönlendir
- Her adımı açık ve anlaşılır şekilde anlat
- Kullanıcı hata alırsa veya yapamazsa bilgi toplayıp eskalasyon yap
- Adım adım ilerle

## Bot ne YAPMAMALI

- Tüm adımları tek mesajda yığma
- UETDS portalında işlem yapabileceğini ima etme
- Direkt eskalasyon yapmak (önce troubleshooting adımlarını dene)
- Kullanıcının teknik bilgi seviyesini varsayma
