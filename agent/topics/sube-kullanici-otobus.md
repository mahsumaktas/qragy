# Sube, Kullanici ve Otobus Yonetimi

Kullanici sube, kullanici veya otobus ile ilgili tanimlama islemi yapmak istiyor.

## Sube Olusturma
"Yonetim - Tanimlar - Subeler - Sube Yonetimi" alanindaki "sube ekle" butonuna tikladiktan sonra acilan ekranda basinda kirmizi renkli yildiz bulunan zorunlu alanlar doldurulduktan sonra yeni sube olusturulabilir.

Tali sube (hesap kesmeyen) olusturmak icin: zorunlu alanlara ek olarak "Varsa Bagli Oldugu Ana Sube" kisminda bagli oldugu ana sube secilmelidir. Ana (hesap kesip araca para odeyecek) subeler icin bu kismi bos birakmak gerekmektedir.

## Kullanici Olusturma
"Yonetim - Tanimlar - Kullanici Yonetimi - Kullanicilar" alanindaki "ekle" butonuna tikladiktan sonra:
- Modul kismi "obus" secilmelidir.
- Yetkili subeler kismi kullanicinin bagli olacagi sube secilmelidir.
- Sube secimi ardindan yetkili subeler basliginin yaninda gozuken sube adina tiklanmalidir.
- Acilan ekranda "tanimlar" kismindaki "bilet" secenegi ile normal yetkiler, "tam" ile tum yetkiler toplu sekilde tanimlanabilmektedir. Dilerseniz yetkileri manuel olarak da tanimlayabilirsiniz.

## Otobus Olusturma
"Yonetim - Kartlar - Otobus Yonetimi - Otobusler" alanindaki "ekle" butonuna tikladiktan sonra:
- Otobus Adi ve Plaka bolumune ornek "34 ABC 123" seklinde rakam ve harfler arasinda bosluk birakilarak plaka yazilmalidir.
- Otobus koltuk modeli secilmelidir.
- Arac sahibi secilmelidir.

## Koltuk Modeli Olusturma
"Yonetim - Kartlar - Otobus Yonetimi - Otobus Koltuk Modelleri" alanindaki "ekle" butonuna tikladiktan sonra zorunlu alanlar doldurulup soldaki koltuk numaralari eklendikten sonra kaydet butonu ile islem tamamlanir.

## Otobus Sahibi Olusturma
"Yonetim - Kartlar - Otobus Yonetimi - Otobus Sahipleri" alanindaki "ekle" butonuna tikladiktan sonra zorunlu alanlar doldurularak kaydet butonu ile islem tamamlanir.

## Hata Durumu
Herhangi bir islemde hata veya "yapamadim, olmadi, hata verdi" mesaji gelirse escalation yapilir.
Eskalasyon mesaji: "Kontrol ediyorum, sizi cok kisa bir sure daha bekletecegim."

## Bot ne yapmali
- Hangi tanimlama islemini yapmak istedigini belirle
- Ilgili adimlari adim adim paylas
- Onaylayici mesaj gelirse ugulama prosedurune gec
- Hata gelirse escalate et

## Bot ne YAPMAMALI
- Tum tanimlama islemlerini tek mesajda anlatma
- Kullanicinin yetkisi hakkinda bilgi verme
