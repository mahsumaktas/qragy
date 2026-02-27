# Şube, Kullanıcı ve Otobüs Yönetimi

Kullanıcı şube, kullanıcı veya otobüs ile ilgili tanımlama işlemi yapmak istiyor.

Navigasyon: OBUS panelinde üst menüdeki "Yönetim" sekmesine tıklanır, açılan menüden ilgili alt bölüm seçilir.

## Şube Oluşturma
Üst menüden "Yönetim > Tanımlar > Şubeler > Şube Yönetimi" sayfasına gidin. "Şube ekle" butonuna tıkladıktan sonra açılan ekranda başında kırmızı renkli yıldız bulunan zorunlu alanlar doldurulduktan sonra yeni şube oluşturulabilir.

Tali şube (hesap kesmeyen) oluşturmak için: zorunlu alanlara ek olarak "Varsa Bağlı Olduğu Ana Şube" kısmında bağlı olduğu ana şube seçilmelidir. Ana (hesap kesip araca para ödeyecek) şubeler için bu kısmı boş bırakmak gerekmektedir.

## Kullanıcı Oluşturma
Üst menüden "Yönetim > Tanımlar > Kullanıcı Yönetimi > Kullanıcılar" sayfasına gidin. "Ekle" butonuna tıkladıktan sonra:
- Modül kısmı "obus" seçilmelidir.
- Yetkili şubeler kısmı kullanıcının bağlı olacağı şube seçilmelidir.
- Şube seçimi ardından yetkili şubeler başlığının yanında gözüken şube adına tıklanmalıdır.
- Açılan ekranda "tanımlar" kısmındaki "bilet" seçeneği ile normal yetkiler, "tam" ile tüm yetkiler toplu şekilde tanımlanabilmektedir. Dilerseniz yetkileri manuel olarak da tanımlayabilirsiniz.

## Otobüs Oluşturma
Üst menüden "Yönetim > Kartlar > Otobüs Yönetimi > Otobüsler" sayfasına gidin. "Ekle" butonuna tıkladıktan sonra:
- Otobüs Adı ve Plaka bölümüne örnek "34 ABC 123" şeklinde rakam ve harfler arasında boşluk bırakılarak plaka yazılmalıdır.
- Otobüs koltuk modeli seçilmelidir.
- Araç sahibi seçilmelidir.

## Koltuk Modeli Oluşturma
Üst menüden "Yönetim > Kartlar > Otobüs Yönetimi > Otobüs Koltuk Modelleri" sayfasına gidin. "Ekle" butonuna tıkladıktan sonra zorunlu alanlar doldurulup soldaki koltuk numaraları eklendikten sonra kaydet butonu ile işlem tamamlanır.

## Otobüs Sahibi Oluşturma
Üst menüden "Yönetim > Kartlar > Otobüs Yönetimi > Otobüs Sahipleri" sayfasına gidin. "Ekle" butonuna tıkladıktan sonra zorunlu alanlar doldurularak kaydet butonu ile işlem tamamlanır.

## Hata Durumu
Herhangi bir işlemde hata veya "yapamadım, olmadı, hata verdi" mesajı gelirse escalation yapılır.
Eskalasyon mesajı: "Kontrol ediyorum, sizi çok kısa bir süre daha bekletecegim."

## Bot ne yapmalı
- Hangi tanımlama işlemini yapmak istediğini belirle
- İlgili adımları adım adım paylaş
- Onaylayıcı mesaj gelirse uygulama prosedürüne geç
- Hata gelirse escalate et

## Bot ne YAPMAMALI
- Tüm tanımlama işlemlerini tek mesajda anlatma
- Kullanıcının yetkisi hakkında bilgi verme
