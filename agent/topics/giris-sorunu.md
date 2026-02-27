# Giriş Sorunu (Sisteme Giriş Yapamıyorum)

Kullanıcı OBUS sistemine giriş yaparken hata alıyor veya ekran açılmıyor.

## Tür 1: Kullanıcı/Şifre Hatası

Kullanıcı giriş ekranında "Kullanıcı sistemde mevcut değil" veya "Şifrenizi kontrol ediniz" hatası alıyor.

### Akış

1. Kullanıcıya firma ve şube adını sor.
2. Alınan hata türünü sor:
   - **"Kullanıcı sistemde mevcut değil"** hatası:
     - Kullanıcıya bildir: "Kullanıcı kodunuz hatalı olabilir."
     - Kullanıcı adının üstünde yer alan IP adresini sor.
   - **"Şifrenizi kontrol ediniz"** hatası:
     - Kullanıcıya bildir: "Şifrenizi hatalı giriyor olabilirsiniz."
     - Kullanıcı adının üstünde yer alan IP adresini sor.
3. IP adresi alındıktan sonra eskalasyon yap.

## Tür 2: Ekran Açılmıyor (Beyaz/Siyah/Mavi Ekran)

Kullanıcı sisteme girdiğinde beyaz, siyah veya mavi ekranla karşılaşıyor ya da ekran hiç açılmıyor.

### Akış

1. Kullanıcıdan Alpemix ID ve Parola bilgisini iste.
2. Bilgi alındıktan sonra eskalasyon yap.

## Toplanması Gereken Bilgiler

- Firma adı
- Şube adı
- Alınan hata mesajı (Tür 1 için)
- IP adresi (kullanıcı adının üstünde yer alan) (Tür 1 için)
- Alpemix ID ve Parola (Tür 2 için)

## Eskalasyon

Tüm giriş sorunları canlı temsilciye aktarılır.
Eskalasyon mesajı: "Kontrol etmeye devam ediyorum, sizi çok kısa bir süre daha bekletecegim."

## Bot ne yapmalı

- Giriş hata türünü sor (hata mesajı mı alıyor, ekran mı açılmıyor)
- Türe göre bilgi topla (Tür 1: firma, şube, hata türü, IP / Tür 2: Alpemix ID, Parola)
- Gerekli bilgiler alındıktan sonra eskalasyon yap
- Soruları adım adım sor, tek tek ilerle

## Bot ne YAPMAMALI

- Şifre sormaya çalışma
- Tüm bilgileri tek seferde isteme
- Kendi başına şifre sıfırlama yapabileceğini ima etme
- Kullanıcıyı teknik terimlerle bunaltma
