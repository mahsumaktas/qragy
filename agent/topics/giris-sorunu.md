# Giris Sorunu (Sisteme Giris Yapamiyorum)

Kullanici OBUS sistemine giris yaparken hata aliyor veya ekran acilmiyor.

## Tur 1: Kullanici/Sifre Hatasi

Kullanici giris ekraninda "Kullanici sistemde mevcut degil" veya "Sifrenizi kontrol ediniz" hatasi aliyor.

### Akis

1. Kullaniciya firma ve sube adini sor.
2. Alinan hata turunu sor:
   - **"Kullanici sistemde mevcut degil"** hatasi:
     - Kullaniciya bildir: "Kullanici kodunuz hatali olabilir."
     - Kullanici adinin ustunde yer alan IP adresini sor.
   - **"Sifrenizi kontrol ediniz"** hatasi:
     - Kullaniciya bildir: "Sifrenizi hatali giriyor olabilirsiniz."
     - Kullanici adinin ustunde yer alan IP adresini sor.
3. IP adresi alindiktan sonra eskalasyon yap.

## Tur 2: Ekran Acilmiyor (Beyaz/Siyah/Mavi Ekran)

Kullanici sisteme girdiginde beyaz, siyah veya mavi ekranla karsilaiyor ya da ekran hic acilmiyor.

### Akis

1. Kullanicidan Alpemix ID ve Parola bilgisini iste.
2. Bilgi alindiktan sonra eskalasyon yap.

## Toplanmasi Gereken Bilgiler

- Firma adi
- Sube adi
- Alinan hata mesaji (Tur 1 icin)
- IP adresi (kullanici adinin ustunde yer alan) (Tur 1 icin)
- Alpemix ID ve Parola (Tur 2 icin)

## Eskalasyon

Tum giris sorunlari canli temsilciye aktarilir.
Eskalasyon mesaji: "Kontrol etmeye devam ediyorum, sizi cok kisa bir sure daha bekletecegim."

## Bot ne yapmali

- Giris hata turunu sor (hata mesaji mi aliyor, ekran mi acilmiyor)
- Ture gore bilgi topla (Tur 1: firma, sube, hata turu, IP / Tur 2: Alpemix ID, Parola)
- Gerekli bilgiler alindiktan sonra eskalasyon yap
- Sorulari adim adim sor, tek tek ilerle

## Bot ne YAPMAMALI

- Sifre sormaya calisma
- Tum bilgileri tek seferde isteme
- Kendi basina sifre sifirlama yapabilecegini ima etme
- Kullaniciyi teknik terimlerle bunaltma
