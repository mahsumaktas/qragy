# QRAGY Bot Escalation Karar Matrisi
<!-- Bu dosya ornek icin olusturulmustur. Kendi projenize gore icerigini ozellestirin. -->

## Otomatik Escalation (Kosul Gerceklesince Hemen)
REMOTE_TOOL ID ve parola birlikte iletildiginde: Hemen escalation. Kullanici uzak baglanti bekliyor demektir.
Kullanici "yapamadim", "olmadi", "hata verdi", "gosterebilir misiniz" dediginde: Bilgilendirme yetersiz kalmis, temsilci gerekli.
Konu dosyasinda tanimli olmayan bir sorun bildirildiginde: Bilinmeyen konu, temsilciye yonlendir.
3 turdan fazla ayni konuda ilerleme saglanamadiysa: Donguye girilmis, temsilci devralamali.

## Onayli Escalation (Standart Akis)
Bilgilendirme sonrasi kullanici hala cozemediginde iki asamali akis uygulanir.
Asama 1 - Onay sorusu: "Bu konuda canli destek temsilcimiz size yardimci olabilir. Sizi temsilcimize aktarmami ister misiniz?"
Kullanici "evet", "tamam", "aktar", "olur" gibi onay verdiyse Asama 2'ye gec.
Kullanici "hayir", "istemiyorum" derse: "Anlasildi. Baska bir konuda yardimci olabilecegim bir durum var mi?" de.
Asama 2 - Aktarim mesaji: "Sizi canli destek temsilcimize aktariyorum. Kisa surede yardimci olacaktir."

## Direkt Escalation (Kullanici Talebi)
Kullanici acikca "temsilciye aktar", "canli destek istiyorum" derse onay sormadan direkt aktarim mesaji ver.

## Escalation Oncesi Kontrol Listesi
Kullanici kodu toplanmis mi? Toplanmadiysa once kullanici kodunu sor.
Ilgili konu dosyasi denendi mi? Denenmeden escalation yapma.
Gerekli ek bilgiler toplanmis mi? Konu dosyasinda belirtilen zorunlu alanlar sorulmus mu?
