# Yazici Sorunu

Kullanici OBUS sistemi uzerinden yazicidan cikti alamiyor, bilet yazdiramiyor veya yazici calismiyordur.

## Alt Konu 1: Yazicidan Cikti Alinamiyor

Kullanici yazicidan hicbir cikti alamiyor.

### Akis

1. Kullaniciya sor: "Yaziciniz acik ve kablolar duzgun takili mi?"
   - **Hayir** ise: "Yaziciyi acip, kablolarin duzgun takili olduguna emin olduktan sonra tekrar deneyin." (Gorusmeyi sonlandir veya tekrar denedikten sonra devam et.)
   - **Evet** ise: 2. adima gec.
2. Kullaniciya sor: "Farkli bir programdan cikti alabiliyor musunuz?"
   - **Hayir, hicbir programdan cikti alamiyorum** ise: "OBUS disinda diger uygulamalardan da cikti alamamaniz yazici kaynakli bir durumdur. Bilgisayarciniz ile goruserek destek alabilirsiniz."
   - **Onceden alabiliyordum ama simdi alamiyorum** ise: Eskalasyon yap.

## Alt Konu 2: Bilet Yazdiramiyor

Kullanici OBUS uzerinden bilet yazdirma islemi yapamiyor.

### Akis

1. "OBUS yazici uygulamasinin aktif oldugunundan emin olun."
2. "Yazicinizin sinama sayfasi cikarip cikarmadigini kontrol edin."
   - Sinama sayfasi yazdirmiyorsa: "Sinama sayfasi yazdirmayan yazicilar icin bilgisayarciniz ile gorusmenizi oneririz."
3. Hala cozulmediyse: Kullanicidan Alpemix ID ve Parola bilgisini iste.
4. Bilgi alindiktan sonra eskalasyon yap.

## Alt Konu 3: Yazici Calismiyor

Kullanici yazicinin hic calismadigini bildiriyor.

### Akis

1. Kullanicidan direkt olarak Alpemix ID ve Parola bilgisini iste.
2. Bilgi alindiktan sonra eskalasyon yap.

## Toplanmasi Gereken Bilgiler

- Sorunun turu (cikti alinamiyor / bilet yazdiramiyor / yazici calismiyor)
- Yazicinin fiziksel durumu (acik mi, kablolar takili mi)
- Farkli programlardan cikti durumu
- Alpemix ID ve Parola (eskalasyon gereken durumlarda)

## Eskalasyon

Eskalasyon mesaji: "Kontrol ediyorum, sizi cok kisa bir sure daha bekletecegim."

Eskalasyon gereken durumlar:
- Onceden cikti alabiliyordu ama simdi alamiyor
- Bilet yazdirma sorunu temel adimlarla cozulmediyse
- Yazici hic calismiyorsa

## Bot ne yapmali

- Sorunun turunu anlamak icin soru sor
- Alt konuya gore troubleshooting adimlarini sirayla uygula
- Her adimdan sonra sonucu sor
- Cozulemiyorsa Alpemix bilgilerini toplayip eskalasyon yap

## Bot ne YAPMAMALI

- Tum troubleshooting adimlarini tek seferde gonderme
- Yazici surucusu yukleme gibi teknik islemlere yonlendirme
- OBUS disindaki yazici sorunlarini cozmaye calisma (bilgisayarciya yonlendir)
- Alpemix bilgilerini gerek olmadan isteme
