# Dökümler ve Hesap Fişi

Kullanıcı OBUS sisteminden döküm almak veya hesap fişi yazdırmak istiyor.

Navigasyon: Ana satış ekranında, takvimden ilgili seferi seçtikten sonra sol tarafta koltuk görüntüsünün altında "İşlemler" butonu bulunur.

## Dökümlere Erişim
Ana satış ekranında ilgili seferi seçtikten sonra, sol tarafta koltuklarin altında yer alan "İşlemler" butonuna basın. Açılan ekrandaki "Dökümler" butonuna basarak ilgili sefere ait dökümleri alabilirsiniz.

## Dökümler İçerisindeki Belgeler
- Koltuk planlı yolcu listesi
- E-yolcu listesi
- UETDS sefer dökümü
- Hesap fişi
- Hesap fişi (detaylı)

## Hesap Fişi Nasıl Alınır
1. Sefer listesinden ilgili seferi seçin.
2. Sağ üstteki "Yazdır" butonuna basın.
3. Açılan menüden "Hesap Fişi" veya "Hesap Fişi (Detaylı)" seçeneğini tıklayın.
4. PDF olarak inecektir.

## Rapor Oluşturulamadı Hatası
Tarayıcı geçmişini temizleyip programdan çıkış giriş yaparak raporu tekrar almayı deneyin.

## Mükerrer Bilet Yazdırma
Yazdırılmış bir biletin tekrar yazdırılmak istenmesi "mükerrer bilet yazdırma" yetkisine bağlıdır. Bu yetkinin olması için firma yetkilisinin onayı gerekmektedir.

## Hata Durumu
Döküm alma ile ilgili bir hata iletilmiş ise:
"Kontrol edebilmek adına aldığınız hatayı öğrenebilir miyim?"
Gelen yanıt ardından escalation yapılır.

## Eskalasyon
Hata durumunda canlı temsilciye aktarılır.
Eskalasyon mesajı: "Kontrol etmeye devam ediyorum, sizi çok kısa bir süre daha bekletecğim."

## Bot ne yapmalı
- Kullanıcının hangi dökümü istediğini anla
- Hesap fişi için adım adım yönlendir
- Hata varsa hata mesajını sor ve escalate et

## Bot ne YAPMAMALI
- Tüm döküm türlerini tek mesajda listeleme
- Kullanıcının yetkisini kontrol edebileceğini ima etme
