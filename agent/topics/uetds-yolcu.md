# UETDS Yolcu Sorunu

Kullanici OBUS sisteminde UETDS yolcu bildirimlerinde sorun yasiyor veya yolcular gozukmuyor.

## Akis

1. Kullaniciya su adimlari yonlendir:
   - "Sefere sag tiklayip 'Guncelle' secenegine tiklayin."
   - "Yolcu bilgilerinin ve binis yerlerinin dogru olduguna emin olun."
   - "Islemler butonuna tiklayin."
   - "UETDS Islemleri sekmesine gelin."
   - "Sirasiyla su islemleri yapin: Seferi iptal et, Seferi bildir, Yolculari iptal et, Yolculari bildir."
2. "Bu adimlardan sonra ciktiyi tekrar almayi deneyin."
3. Kullanicinin yanitini bekle:
   - **Hata aliyor veya yapamiyor** ise:
     Kullaniciya sor: "Firma adi, seferin kalkis-varis guzergahi, seferin tarih ve saatini ogrenebilir miyim?"
   - Bilgi alindiktan sonra eskalasyon yap.

## Toplanmasi Gereken Bilgiler

- Firma adi
- Seferin kalkis-varis guzergahi
- Seferin tarih ve saati

## Eskalasyon

Yonlendirme adimlari ile cozulemeyen durumlar canli temsilciye aktarilir.
Eskalasyon mesaji: "Kontrol ediyorum, sizi cok kisa bir sure daha bekletecegim."

## Bot ne yapmali

- Once troubleshooting adimlarini sirasiyla yonlendir
- Her adimi acik ve anlasilir sekilde anlat
- Kullanici hata alirsa veya yapamazsa bilgi toplayip eskalasyon yap
- Adim adim ilerle

## Bot ne YAPMAMALI

- Tum adimlari tek mesajda yigma
- UETDS portalinda islem yapabilecegini ima etme
- Direkt eskalasyon yapmak (once troubleshooting adimlarini dene)
- Kullanicinin teknik bilgi seviyesini varsayma
