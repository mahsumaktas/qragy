# Yazıcı Sorunu

Kullanıcı OBUS sistemi üzerinden yazıcıdan çıktı alamıyor, bilet yazdıramıyor veya yazıcı çalışmıyordur.

## Alt Konu 1: Yazıcıdan Çıktı Alınamıyor

Kullanıcı yazıcıdan hiçbir çıktı alamıyor.

### Akış

1. Kullanıcıya sor: "Yazıcınız açık ve kablolar düzgün takılı mı?"
   - **Hayır** ise: "Yazıcıyı açıp, kabloların düzgün takılı olduğuna emin olduktan sonra tekrar deneyin." (Görüşmeyi sonlandır veya tekrar denedikten sonra devam et.)
   - **Evet** ise: 2. adıma geç.
2. Kullanıcıya sor: "Farklı bir programdan çıktı alabiliyor musunuz?"
   - **Hayır, hiçbir programdan çıktı alamıyorum** ise: "OBUS dışında diğer uygulamalardan da çıktı alamamanız yazıcı kaynaklı bir durumdur. Bilgisayarcınız ile görüşerek destek alabilirsiniz."
   - **Önceden alabiliyordum ama şimdi alamıyorum** ise: Eskalasyon yap.

## Alt Konu 2: Bilet Yazdıramıyor

Kullanıcı OBUS üzerinden bilet yazdırma işlemi yapamıyor.

### Akış

1. "OBUS yazıcı uygulamasının aktif olduğunundan emin olun."
2. "Yazıcınızın sınama sayfası çıkarıp çıkarmadığını kontrol edin."
   - Sınama sayfası yazdırmıyorsa: "Sınama sayfası yazdırmayan yazıcılar için bilgisayarcınız ile görüşmenizi öneririz."
3. Hala çözülmediyse: Kullanıcıdan Alpemix ID ve Parola bilgisini iste.
4. Bilgi alındıktan sonra eskalasyon yap.

## Alt Konu 3: Yazıcı Çalışmıyor

Kullanıcı yazıcının hiç çalışmadığını bildiriyor.

### Akış

1. Kullanıcıdan direkt olarak Alpemix ID ve Parola bilgisini iste.
2. Bilgi alındıktan sonra eskalasyon yap.

## Toplanması Gereken Bilgiler

- Sorunun türü (çıktı alınamıyor / bilet yazdıramıyor / yazıcı çalışmıyor)
- Yazıcının fiziksel durumu (açık mı, kablolar takılı mı)
- Farklı programlardan çıktı durumu
- Alpemix ID ve Parola (eskalasyon gereken durumlarda)

## Eskalasyon

Eskalasyon mesajı: "Kontrol ediyorum, sizi çok kısa bir süre daha bekleteceğim."

Eskalasyon gereken durumlar:
- Önceden çıktı alabiliyordu ama şimdi alamıyor
- Bilet yazdırma sorunu temel adımlarla çözülmediyse
- Yazıcı hiç çalışmıyorsa

## Bot ne yapmalı

- Sorunun türünü anlamak için soru sor
- Alt konuya göre troubleshooting adımlarını sırayla uygula
- Her adımdan sonra sonucu sor
- Çözülemiyorsa Alpemix bilgilerini toplayıp eskalasyon yap

## Bot ne YAPMAMALI

- Tüm troubleshooting adımlarını tek seferde gönderme
- Yazıcı sürücüsü yükleme gibi teknik işlemlere yönlendirme
- OBUS dışındaki yazıcı sorunlarını çözmeye çalışma (bilgisayarcıya yönlendir)
- Alpemix bilgilerini gerek olmadan isteme
