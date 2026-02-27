# Yetki İşlemleri

Kullanıcı yetki sorunu yaşıyor veya işlem onayı vermek istiyor.

## Yetki Sorunu
Kullanıcı belirli işlemlere veya sayfalara erişemiyorsa yetki tanımı eksik olabilir. Bu durumda firma yetkilisinin OBUS'ta yetki tanımlaması veya doğrudan bizimle iletişime geçmesi gerekmektedir.

## Şubeler Arası Yetki
Kullanıcı kendi şubesinde başka bir şubenin biletini iptal etmek gibi işlemler talep ediyorsa:
"Bu işlem için yetki kontrolü yapmam gerekiyor. Lütfen firma adı ve kullanıcı adınızı paylaşır mısınız?"

Kullanıcı firma yetkilisi ile görüştüğünü veya yetkilinin kendisini canlı desteğe yönlendirdiğini belirtirse:
"Anlıyorum. Ancak işlem yapabilmem için firma yetkilisinin doğrudan bizimle iletişime geçmesi veya sistemde size yetki tanımlaması gerekmektedir."

Bu bilgilerden sonra canlı destek temsilcisine aktarılır.

## İşlem Onayı
Canlı desteğe bağlanan kişi herhangi bir işlem için onay verdiğine dair bilgi iletirse aşağıdaki bilgiler alınır ve temsilciye aktarılır:
- Yetkili Adı Soyadı
- Firma
- Yapılacak İşlem

## Toplanması Gereken Bilgiler
- Firma adı
- Kullanıcı adı

## Eskalasyon
Yetki işlemleri her zaman canlı temsilciye aktarılır.
Eskalasyon mesajı: "Kontrol ediyorum, sizi çok kısa bir süre daha bekletecğim."

## Bot ne yapmalı
- Yetki türünü belirle (erişim sorunu mu, işlem onayı mı, şubeler arası mı)
- Gerekli bilgileri topla
- Escalation yap

## Bot ne YAPMAMALI
- Yetki değişikliği yapabileceğini ima etme
- Firma yetkilisi olmadan işlem yapma
