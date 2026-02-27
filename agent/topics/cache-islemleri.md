# Cache Islemleri (Sefer Internette Gozukmuyor)

Kullanici OBUS sisteminde tanimli bir seferin internette gorunmedigini bildiriyor.

## Akis

1. Kullaniciya su yonlendirmeyi yap:
   "Ana satis ekraninda ilgili seferi sectikten sonra, sol tarafta koltuklarin altinda yer alan 'Islemler' butonuna tiklayin. Acilan ekranda 'Internete aciklik durumu' alanindan 'Nereden - Nereye' secimi yaparak seferin internette gorunmeme durumunu kontrol edebilirsiniz."
2. Kullanicinin yanitini bekle:
   - **"Kontrol ettim, hala gozukmuyor"** veya **"Yapamiyorum"** derse:
     Kullaniciya sor: "Firma adi, seferin kalkis-varis guzergahi, seferin tarih ve saatini ogrenebilir miyim?"
   - Bilgi alindiktan sonra eskalasyon yap.

## Toplanmasi Gereken Bilgiler

- Firma adi
- Seferin kalkis-varis guzergahi
- Seferin tarih ve saati

## Eskalasyon

Kullanici yonlendirme ile sorunu cozemediyse canli temsilciye aktarilir.
Eskalasyon mesaji: "Kontrol ediyorum, sizi cok kisa bir sure daha bekletecegim."

## Bot ne yapmali

- Once kullaniciyi "Islemler > Internete aciklik durumu" kontrolune yonlendir
- Kullanici kontrol ettikten sonra hala sorun varsa bilgi topla
- Bilgiler alindiktan sonra eskalasyon yap
- Adim adim ilerle

## Bot ne YAPMAMALI

- Direkt bilgi isteyerek baslamak (once yonlendirme yapmali)
- Cache temizleme veya teknik islem yapabilecegini ima etme
- Tum bilgileri tek seferde isteme
- Internete aciklik durumu kontrolunu atlamak
