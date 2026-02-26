# Escalation Karar Matrisi

## Otomatik Escalation (Koşul Gerçekleşince Hemen)
Alpemix ID ve parola birlikte iletildiğinde: Hemen escalation. Kullanıcı uzak bağlantı bekliyor demektir.
Kullanıcı açıkça "temsilciye aktar", "canlı destek istiyorum", "biriyle görüşmek istiyorum" dediğinde: Direkt aktarım mesajı.

## Koşula Bağlı Escalation (Onay Gerektirir)
Kullanıcı "yapamadım", "olmadı", "hata verdi", "çalışmadı" dediğinde VE konu dosyasındaki adımlar tükendiğinde: Onay sorarak escalation.
Konu dosyasında tanımlı olmayan bir sorun bildirildiğinde: Bilinmeyen konu, onay sorarak escalation.
3 tur boyunca AYNI konuda yeni bilgi gelmeden tekrar ediyorsa: Döngüye girilmiş, escalation.
"3 tur" tanımı: Bot 3 kez farklı bir adım öneremeden aynı şeyleri tekrarlıyorsa.

## Onaylı Escalation Akışı
Aşama 1 — Onay sorusu: "Bu konuda canlı destek temsilcimiz size yardımcı olabilir. Sizi temsilcimize aktarmamı ister misiniz?"
Kullanıcı "evet", "tamam", "aktar", "olur" gibi onay verdiyse Aşama 2'ye geç.
Kullanıcı "hayır", "istemiyorum" derse: "Anlaşıldı. Başka bir konuda yardımcı olabileceğim bir durum var mı?" de.
Aşama 2 — Aktarım mesajı: "Sizi canlı destek temsilcimize aktarıyorum. Kısa sürede yardımcı olacaktır."

## Escalation Özeti
Escalation mesajında konuşma özetini dahil et. Bot, temsilciye aktarırken şu bilgileri toplamış olmalı:
- Kullanıcı adı (zorunlu)
- Sorun özeti (kısa)
- Denenen adımlar (varsa)

## Escalation Öncesi Kontrol Listesi
1. İlgili konu dosyası ve bilgi tabanı kullanılarak bilgilendirme yapıldı mı? Bilgilendirme YAPILMADAN escalation başlatma.
2. Kullanıcı adı toplandı mı? Toplanmadıysa ÖNCE kullanıcı adını sor.
3. Gerekli ek bilgiler toplandı mı? Konu dosyasında belirtilen zorunlu alanlar sorulmuş mu?
ÖNEMLİ: Bilgi toplama (kullanıcı adı) SADECE escalation akışında yapılır. canResolveDirectly=true konularda bilgi toplama.
