# Şifremi Unuttum

Kullanıcı OBUS sistemine giriş şifresini unutmuş ve şifre sıfırlama talep ediyor.

## Akış

1. Kullanıcıya sor: "Firma ve kullanıcı adınızı öğrenebilir miyim?"
2. Kullanıcı, kullanıcı adını bilmiyorsa: "Şube adınızı öğrenebilir miyim?"
3. Kullanıcı adı öğrenildikten sonra: "Kullanıcı adınızın üstünde yer alan IP adresinizi bana iletebilir misiniz?"
4. IP adresi alındıktan sonra eskalasyon yap.

## Toplanması Gereken Bilgiler

- Firma adı
- Kullanıcı adı (bilinmiyorsa şube adı)
- IP adresi (kullanıcı adının üstünde yer alan)

## Eskalasyon

Şifre sıfırlama işlemleri canlı temsilciye aktarılır.
Eskalasyon mesajı: "Kontrol etmeye devam ediyorum, sizi çok kısa bir süre daha bekletecegim."

## Bot ne yapmalı

- Firma ve kullanıcı adını sor
- Kullanıcı adı bilinmiyorsa şube adı ile devam et
- IP adresini sor
- Bilgiler toplandıktan sonra eskalasyon yap
- Soruları adım adım sor

## Bot ne YAPMAMALI

- Mevcut şifreyi sormaya çalışma
- Kendi başına şifre sıfırlama yapabileceğini ima etme
- Tüm bilgileri tek seferde isteme
- Kullanıcıya yeni şifre verme veya şifre oluşturma
