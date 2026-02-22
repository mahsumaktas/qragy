# Admin Kullanim Rehberi

Admin paneline `http://localhost:3000/admin` adresinden erisebilirsiniz.

## Giris

`ADMIN_TOKEN` ortam degiskeni tanimlandiysa, admin paneline girerken sifre sorulur. Bu sifre `.env` dosyasinda veya Admin > Env sekmesinden degistirilebilir.

## Dashboard

Admin panelinin ana sayfasi KPI kartlarini gosterir:

- **Bugunun sohbetleri** — Bugunku toplam chat sayisi
- **Bu haftanin sohbetleri** — Haftalik chat sayisi ve onceki haftaya gore trend
- **CSAT ortalamasi** — Musteri memnuniyet puani (1-5)
- **Cozum orani** — Escalation olmadan cozulen sohbet yuzdesi
- **Ortalama yanitlama suresi** — Bot yanitlama suresi (ms)
- **En cok sorulan konular** — Haftanin top 5 konusu

Trendler otomatik hesaplanir: onceki haftaya/aya gore yuzde degisim gosterilir.

## Ticket Yonetimi

### Ticket Listesi

- **Filtreleme:** Durum (open, handoff_pending, handoff_success), kaynak (web, telegram), arama
- **Siralama:** Olusturma tarihine gore (en yeni ustte)
- **Toplu islemler:** Birden fazla ticket secip toplu kapatma, atama veya oncelik degistirme
- **Export:** CSV veya JSON formatinda disari aktarma

### Ticket Detay

Her ticket'ta su bilgiler yer alir:

- **Chat gecmisi** — Tam konusma kaydi
- **Musteri bilgileri** — Isim, telefon, sube kodu, sirket adi
- **Dahili notlar** — Sadece admin'lerin gordugu ic notlar
- **Olay gecmisi** — Tum islemler kronolojik olarak (atama, oncelik, kapatma)
- **CSAT puani** — Musteri degerlendirmesi (varsa)

### Islemler

- **Atama:** Ticket'i bir ekip uyesine ata
- **Oncelik:** `low` / `normal` / `high` olarak belirle
- **Not ekle:** Dahili not birak
- **Kapat:** Ticket'i cozulmus olarak isaretle

## Bilgi Tabani (Knowledge Base)

Botun cevap uretirken kullandigi soru-cevap veritabani.

### Kayit Yonetimi

- **Ekleme:** "Yeni Kayit" butonuyla soru-cevap cifti ekleyin
- **Duzenleme:** Mevcut kaydi guncelleyin
- **Silme:** Kaydi kalici olarak silin

Her ekleme/guncelleme/silme isleminden sonra vektor indeksi otomatik olarak yeniden olusturulur.

### Dosya Yukleme

Desteklenen formatlar:
- **PDF** — Otomatik metin cikarma
- **DOCX** — Word belgesi
- **TXT** — Duz metin

Yuklenen dosyalar otomatik olarak chunk'lanir, her chunk icin LLM ile soru uretilir ve bilgi tabanina eklenir.

### Yeniden Indeksleme

"Yeniden Indeksle" butonu ile LanceDB vektor indeksini sifirdan olusturabilirsiniz. CSV'de manuel degisiklik yaptiyseniz kullanin.

## Bot Yapilandirma

### Agent Dosyalari

Botun kisiligini ve davranislarini belirleyen markdown dosyalari:

| Dosya | Aciklama |
|-------|----------|
| `soul.md` | Botun temel kimligi ve degerleri |
| `persona.md` | Konusma tonu ve uslup |
| `domain.md` | Alan bilgisi ve uzmanlik |
| `bootstrap.md` | Sifirdan baslangic sablonu |
| `response-policy.md` | Yanitlama politikalari |
| `skills.md` | Botun yetenekleri |
| `hard-bans.md` | Kesinlikle yasaklanan davranislar |
| `escalation-matrix.md` | Escalation kurallari |
| `definition-of-done.md` | Tamamlanma kriterleri |
| `output-filter.md` | Cikti filtreleme kurallari |

Bu dosyalar admin panelinden dogrudan duzenlenebilir. Her degisiklik otomatik olarak versiyonlanir.

### Konular (Topics)

Yapilandirilmis destek akislari:

- **Baslik ve ID** — Konu tanimlayicisi
- **Anahtar kelimeler** — Otomatik konu tespiti icin keyword listesi
- **Gerekli bilgiler** — Bot'un toplayacagi zorunlu alanlar (isim, telefon vb.)
- **Escalation gerektirir mi** — Konu insan operatore yonlendirilmeli mi
- **Dogrudan cozulebilir mi** — Bot kendi basina cevaplayabilir mi
- **Icerik (markdown)** — Konuya ozel talimatlar

### Hafiza Sablonlari (Memory)

- **ticket-template.json** — Ticket olusturulurken kullanilan sablon
- **conversation-schema.json** — Konusma verisi yapisi

### Chat Flow Ayarlari

- Karsilama mesaji
- Hizli yanitlar (quick replies)
- CSAT aktif/pasif
- Dosya yukleme aktif/pasif

### Site Ayarlari

- Logo
- Tema rengi
- Header baslik
- Hero baslik

### Ortam Degiskenleri (Env)

Admin panelinden `.env` dosyasindaki degiskenleri dogrudan gorebilir ve guncelleyebilirsiniz. Hassas anahtarlar (API key, token) maskelenir.

Degisiklikler aninda uygulanir — sunucu yeniden baslatmaya gerek yoktur.

## Analitik

### Dashboard

7, 30 veya 90 gunluk araliklarda:

- **Toplam chat sayisi**
- **AI / deterministik cevap dagilimi**
- **Ortalama yanitlama suresi**
- **Escalation orani ve sayisi**
- **CSAT ortalamasi**
- **Deflection orani** (AI'in cozumu yuzdesi)
- **Feedback (begen/begenmedi)**
- **Duygu analizi dagilimi**
- **Gunluk trend grafikleri**
- **En cok sorulan konular**

### Export

Analitik verisini CSV veya JSON olarak indirebilirsiniz.

## Agent Inbox (HITL)

Human-in-the-Loop sistemi ile canli sohbetlere mudahale edebilirsiniz.

### Nasil Calisir

1. Bot bir konusmayi insan operatore yonlendirdiginde, konusma Agent Inbox'a duser
2. **Bekleyen** listesinde yeni konusmalar gorulur
3. "Sahiplen" butonu ile konusmayi alin
4. Dogrudan kullaniciya mesaj gonderebilirsiniz
5. "Birak" butonu ile konusmayi tekrar bota devredin

### Canli Guncellemeler

Agent Inbox, SSE (Server-Sent Events) ile canli olarak guncellenir:
- Yeni konusma bildirimi
- Sahiplenme bildirimi
- Mesaj bildirimi
- Birakma bildirimi

## Feedback Raporu

Kullanicilarin bot cevaplarina verdigi "begen/begenmedi" geri bildirimlerinin analizi:

- Son X gundeki feedback dagilimi
- Feedback trendi

## SLA Takibi

- **Ilk yanitlama suresi** — Varsayilan 5 dakika
- **Cozum suresi** — Varsayilan 60 dakika
- **SLA uyum orani** — Ihlal edilmeyen ticket yuzdesi
- **Ihlal listesi** — Hangi ticket'lar SLA'yi asti

SLA limitleri `SLA_FIRST_RESPONSE_MIN` ve `SLA_RESOLUTION_MIN` ile ayarlanabilir.

## Otomatik FAQ

LLM kullanarak cozulmus ticket'lardan otomatik FAQ onerisi olusturur:

1. "Oneriler Olustur" butonu ile cozulmus ticket'lardan FAQ cikarilir
2. Oneriler "beklemede" durumunda listelenir
3. Her oneriyi **onayla** (bilgi tabanina ekler) veya **reddet** edebilirsiniz

## Icerik Boslugu Tespiti

Bot cevaplayamadigi sorulari otomatik olarak kaydeder:

- En cok sorulan ama cevaplanamayan konular listelenir
- Sayiya gore siralanir
- Isaretlenen bosluklari bilgi tabanina ekleyerek kapatabilirsiniz

## Prompt Versiyonlama

Agent dosyalarindaki her degisiklik otomatik olarak versiyonlanir:

- **Gecmis versiyonlar** listesini goruntuleyebilirsiniz
- **Rollback** ile onceki versiyona geri donebilirsiniz

## Sistem Durumu

- **Uptime** — Sunucu calisma suresi
- **Node.js versiyonu**
- **Bellek kullanimi** — RSS, heap
- **Agent dosya durumu** — Hangi dosyalar yuklendi
- **Bilgi tabani** — Kayit sayisi
- **LLM sagligi** — API durumu, hata oranlari
- **Hot reload** — Tum config dosyalarini yeniden yukle

## Yedekleme

"Yedekle" butonu ile SQLite veritabaninin bir yedegini olusturabilirsiniz.

## Audit Log

Son 100 admin islemi kronolojik olarak kayit altindadir:
- Ticket atamalari
- Oncelik degisiklikleri
- FAQ onaylari
- Toplu islemler
