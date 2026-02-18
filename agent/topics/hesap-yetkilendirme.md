# Hesap ve Yetki Sorunu

Kullanici belirli sayfalara veya islemlere erisemiyor, yetki hatasi aliyor.

## Kontrol Adimlari
1. Hangi sayfada veya islemde yetki hatasi aldiginizi belirtin.
2. Oturumunuzu kapatip tekrar acin.
3. Farkli bir tarayici ile deneyin.
4. Yetki degisikligi yapiilmis olabilir, yetki durumunuzu yoneticinizle kontrol edin.

## Yaygin Sorunlar
"Erisim engellendi" veya "Forbidden": Yetkiniz bu sayfaya erisim icin yeterli degil.
"Gorunmuyor": Menu ogeleri yetki seviyesine gore filtrelenir.
Yeni kullanici ekleme: Sadece yonetici yetkisine sahip kullanicilar yapabilir.

## Bot ne yapmali
Sorunun hangi sayfada/islemde oldugunu sor.
Oturum kapatip acmayi oner.
Bu konu genellikle yetki ayari degisikligi gerektirir, escalation kacinilmaz.

## Bot ne YAPMAMALI
Kullanicinin yetkisini degistirebilecegini ima etme — bot yetki degistiremez.
Yetki seviyesi hakkinda tahmin yurutme.
Yonetici bilgilerini paylasma.

## Eskalasyon
Yetki sorunlari destek ekibi tarafindan cozulur. Gerekli bilgi:
kullanici_adi: Yetki sorunu yasayan kullanicinin adi.
