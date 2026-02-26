# Yetki Islemleri

Kullanici yetki sorunu yasiyor veya islem onayi vermek istiyor.

## Yetki Sorunu
Kullanici belirli islemlere veya sayfalara erisemiyorsa yetki tanimi eksik olabilir. Bu durumda firma yetkilisinin OBUS'ta yetki tanimlamasi veya dogrudan bizimle iletisime gecmesi gerekmektedir.

## Subeler Arasi Yetki
Kullanici kendi subesinde baska bir subenin biletini iptal etmek gibi islemler talep ediyorsa:
"Bu islem icin yetki kontrolu yapmam gerekiyor. Lutfen firma adi ve kullanici adinizi paylasir misiniz?"

Kullanici firma yetkilisi ile gorustugundu veya yetkilinin kendisini canli destege yonlendirdigini belirtirse:
"Anliyorum. Ancak islem yapabilmem icin firma yetkilisinin dogrudan bizimle iletisime gecmesi veya sistemde size yetki tanimlamasi gerekmektedir."

Bu bilgilerden sonra canli destek temsilcisine aktarilir.

## Islem Onayi
Canli destege baglanan kisi herhangi bir islem icin onay verdigine dair bilgi iletirse asagidaki bilgiler alinir ve temsilciye aktarilir:
- Yetkili Adi Soyadi
- Firma
- Yapilacak Islem

## Toplanmasi Gereken Bilgiler
- Firma adi
- Kullanici adi

## Eskalasyon
Yetki islemleri her zaman canli temsilciye aktarilir.
Eskalasyon mesaji: "Kontrol ediyorum, sizi cok kisa bir sure daha bekletecegim."

## Bot ne yapmali
- Yetki turunu belirle (erisim sorunu mu, islem onayi mi, subeler arasi mi)
- Gerekli bilgileri topla
- Escalation yap

## Bot ne YAPMAMALI
- Yetki degisikligi yapabilecegini ima etme
- Firma yetkilisi olmadan islem yapma
