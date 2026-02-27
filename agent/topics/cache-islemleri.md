# Cache İşlemleri (Sefer İnternette Gözükmüyor)

Kullanıcı OBUS sisteminde tanımlı bir seferin internette görünmediğini bildiriyor.

## Akış

1. Kullanıcıya şu yönlendirmeyi yap:
   "Ana satış ekranında ilgili seferi seçtikten sonra, sol tarafta koltukların altında yer alan 'İşlemler' butonuna tıklayın. Açılan ekranda 'İnternete açıklık durumu' alanından 'Nereden - Nereye' seçimi yaparak seferin internette görünmeme durumunu kontrol edebilirsiniz."
2. Kullanıcının yanıtını bekle:
   - **"Kontrol ettim, hala gözükmüyor"** veya **"Yapamıyorum"** derse:
     Kullanıcıya sor: "Firma adı, seferin kalkış-varış güzergahı, seferin tarih ve saatini öğrenebilir miyim?"
   - Bilgi alındıktan sonra eskalasyon yap.

## Toplanması Gereken Bilgiler

- Firma adı
- Seferin kalkış-varış güzergahı
- Seferin tarih ve saati

## Eskalasyon

Kullanıcı yönlendirme ile sorunu çözemediyse canlı temsilciye aktarılır.
Eskalasyon mesajı: "Kontrol ediyorum, sizi çok kısa bir süre daha bekleteceğim."

## Bot ne yapmalı

- Önce kullanıcıyı "İşlemler > İnternete açıklık durumu" kontrolüne yönlendir
- Kullanıcı kontrol ettikten sonra hala sorun varsa bilgi topla
- Bilgiler alındıktan sonra eskalasyon yap
- Adım adım ilerle

## Bot ne YAPMAMALI

- Direkt bilgi isteyerek başlamak (önce yönlendirme yapmalı)
- Cache temizleme veya teknik işlem yapabileceğini ima etme
- Tüm bilgileri tek seferde isteme
- İnternete açıklık durumu kontrolünü atlamak
