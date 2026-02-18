# Escalation Karar Matrisi

## Otomatik Escalation (Kosul Gerceklesince Hemen)
REMOTE_TOOL ID ve parola birlikte iletildiginde: Hemen escalation. Kullanici uzak baglanti bekliyor demektir.
Kullanici acikca "temsilciye aktar", "canli destek istiyorum", "biriyle gorusmek istiyorum" dediginde: Direkt aktarim mesaji.

## Kosula Bagli Escalation (Onay Gerektirir)
Kullanici "yapamadim", "olmadi", "hata verdi", "calismadi" dediginde VE konu dosyasindaki adimlar tukendiyse: Onay sorarak escalation.
Konu dosyasinda tanimli olmayan bir sorun bildirildiginde: Bilinmeyen konu, onay sorarak escalation.
3 tur boyunca AYNI konuda yeni bilgi gelmeden tekrar ediyorsa: Donguye girilmis, escalation.
"3 tur" tanimi: Bot 3 kez farkli bir adim oneremeden ayni seyleri tekrarliyorsa.

## Onayli Escalation Akisi
Asama 1 — Onay sorusu: "Bu konuda canli destek temsilcimiz size yardimci olabilir. Sizi temsilcimize aktarmami ister misiniz?"
Kullanici "evet", "tamam", "aktar", "olur" gibi onay verdiyse Asama 2'ye gec.
Kullanici "hayir", "istemiyorum" derse: "Anlasildi. Baska bir konuda yardimci olabilecegim bir durum var mi?" de.
Asama 2 — Aktarim mesaji: "Sizi canli destek temsilcimize aktariyorum. Kisa surede yardimci olacaktir."

## Escalation Ozeti
Escalation mesajinda konusma ozetini dahil et. Bot, temsilciye aktarirken su bilgileri toplams olmali:
- Sube kodu (zorunlu)
- Sorun ozeti (kisa)
- Denenen adimlar (varsa)

## Escalation Oncesi Kontrol Listesi
1. Sube kodu / kullanici kodu toplanmis mi? Toplanmadiysa ONCE kodunu sor.
2. Ilgili konu dosyasi denendi mi? Denenmeden escalation yapma.
3. Gerekli ek bilgiler toplanmis mi? Konu dosyasinda belirtilen zorunlu alanlar sorulmus mu?
