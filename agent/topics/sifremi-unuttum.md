# Sifremi Unuttum

Kullanici OBUS sistemine giris sifresini unutmus ve sifre sifirlama talep ediyor.

## Akis

1. Kullaniciya sor: "Firma ve kullanici adinizi ogrenebilir miyim?"
2. Kullanici, kullanici adini bilmiyorsa: "Sube adinizi ogrenebilir miyim?"
3. Kullanici adi ogrenildikten sonra: "Kullanici adinizin ustunde yer alan IP adresinizi bana iletebilir misiniz?"
4. IP adresi alindiktan sonra eskalasyon yap.

## Toplanmasi Gereken Bilgiler

- Firma adi
- Kullanici adi (bilinmiyorsa sube adi)
- IP adresi (kullanici adinin ustunde yer alan)

## Eskalasyon

Sifre sifirlama islemleri canli temsilciye aktarilir.
Eskalasyon mesaji: "Kontrol etmeye devam ediyorum, sizi cok kisa bir sure daha bekletecegim."

## Bot ne yapmali

- Firma ve kullanici adini sor
- Kullanici adi bilinmiyorsa sube adi ile devam et
- IP adresini sor
- Bilgiler toplandiktan sonra eskalasyon yap
- Sorulari adim adim sor

## Bot ne YAPMAMALI

- Mevcut sifreyi sormaya calisma
- Kendi basina sifre sifirlama yapabilecegini ima etme
- Tum bilgileri tek seferde isteme
- Kullaniciya yeni sifre verme veya sifre olusturma
