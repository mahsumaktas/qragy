# API Referans

Tum endpoint'ler `http://localhost:3000` uzerinden erisime aciktir.

Admin endpoint'leri (`/api/admin/*`) `ADMIN_TOKEN` tanimlandiysa `x-admin-token` header'i gerektirir.

## Genel (Public)

### Health Check

```
GET /api/health
```

Sunucu saglik durumunu dondurur.

**Yanit:**
```json
{
  "status": "ok",
  "uptime": 3600,
  "memory": { "rss": 52428800 }
}
```

---

### Widget Config

```
GET /api/config
```

Chat widget'inin ihtiyac duydugu yapilandirma bilgilerini dondurur.

**Yanit:**
```json
{
  "zendesk": { "enabled": false, "snippetKey": "", "defaultTags": [] },
  "support": { "available": true, "message": "" },
  "admin": { "tokenRequired": true },
  "chatFlow": { "welcomeMessage": "Merhaba...", "quickReplies": [] },
  "site": { "logoUrl": "", "primaryColor": "#4F46E5", "headerTitle": "Destek" }
}
```

---

### Chat

```
POST /api/chat
```

Ana chat endpoint'i. Kullanici mesajini isler, RAG aramasini yapar, LLM ile cevap uretir.

**Headers:**
- `Content-Type: application/json`

**Request Body:**
```json
{
  "sessionId": "abc123",
  "messages": [
    { "role": "user", "content": "Kargo takibi nasil yapilir?" }
  ],
  "source": "web"
}
```

**Yanit:**
```json
{
  "reply": "Kargo takibi icin...",
  "model": "gemini-3-pro-preview",
  "source": "rag+llm",
  "sessionId": "abc123",
  "memory": { "fullName": "", "phone": "" },
  "hasClosedTicketHistory": false,
  "handoffReady": false,
  "support": { "available": true }
}
```

**Hata Durumlari:**
- `400` — Mesaj bos veya 1000 karakterden uzun
- `429` — Rate limit asildi

---

### Chat Dosya Yukleme

```
POST /api/chat/upload
```

Sohbet icinde dosya yukleme (resim, PDF).

**Headers:**
- `Content-Type: multipart/form-data`

**Form Alanlari:**
- `file` — Yuklenecek dosya (maks 5MB, JPEG/PNG/GIF/WebP/PDF)

**Yanit:**
```json
{
  "ok": true,
  "url": "/uploads/abc123",
  "name": "ekran-goruntusu.png",
  "size": 102400
}
```

---

### Chat Feedback

```
POST /api/chat/feedback
```

Bot cevabina thumbs up/down geri bildirimi.

**Request Body:**
```json
{
  "sessionId": "abc123",
  "messageIndex": 2,
  "rating": "up"
}
```

`rating`: `"up"` veya `"down"`

---

## Konusma (Conversation)

### Konusma Durumu

```
GET /api/conversations/status/:sessionId
```

Bir konusmanin aktif olup olmadigini kontrol eder.

**Yanit:**
```json
{ "active": true }
```

---

### Konusma Kapatma

```
POST /api/conversations/close
```

Bir konusmayi kapatir.

**Request Body:**
```json
{
  "sessionId": "abc123",
  "reason": "user"
}
```

`reason`: `"inactivity"` | `"user"` | `"farewell"`

---

### Ticket Handoff Sonucu

```
POST /api/tickets/:ticketId/handoff
```

Dis sistem (Zendesk vb.) tarafindan handoff sonucunu bildirir.

**Request Body:**
```json
{
  "status": "success",
  "detail": "Ticket Zendesk'te olusturuldu",
  "meta": {}
}
```

---

### Ticket CSAT Puanlama

```
POST /api/tickets/:ticketId/rating
```

Musteri memnuniyet puani kaydeder.

**Request Body:**
```json
{
  "rating": 4
}
```

`rating`: 1-5 arasi tam sayi

---

## Setup Wizard

### Setup Durumu

```
GET /api/setup/status
```

Setup wizard'in tamamlanip tamamlanmadigini kontrol eder.

**Yanit:**
```json
{ "setupComplete": false }
```

---

### Setup Tamamla

```
POST /api/setup/complete
```

Setup wizard'i tamamlar, site ve chatflow config'ini gunceller.

**Request Body:**
```json
{
  "companyName": "Acme Ltd",
  "sector": "e-ticaret",
  "logoUrl": "/custom-logo.png",
  "primaryColor": "#4F46E5",
  "themeColor": "#4F46E5",
  "faqs": [
    { "question": "Kargo ne zaman gelir?", "answer": "2-3 is gunu icinde." }
  ]
}
```

---

## Admin — Ticket

Tum admin endpoint'leri `x-admin-token` header'i gerektirir.

### Ticket Listesi

```
GET /api/admin/tickets
```

**Query Parametreleri:**
| Parametre | Varsayilan | Aciklama |
|-----------|-----------|----------|
| `limit` | `100` | Sayfa basina kayit (maks 500) |
| `offset` | `0` | Baslangic noktasi |
| `status` | - | Durum filtresi |
| `source` | - | Kaynak filtresi (web, telegram) |
| `q` | - | Arama sorgusu |
| `includeEvents` | `false` | Olaylari dahil et |

---

### Ticket Detay

```
GET /api/admin/tickets/:ticketId
```

Tek bir ticket'in tum detaylarini dondurur (chat gecmisi, notlar, olaylar dahil).

---

### Ticket Atama

```
PUT /api/admin/tickets/:ticketId/assign
```

**Request Body:**
```json
{ "assignedTo": "mehmet" }
```

---

### Ticket Oncelik

```
PUT /api/admin/tickets/:ticketId/priority
```

**Request Body:**
```json
{ "priority": "high" }
```

`priority`: `"low"` | `"normal"` | `"high"`

---

### Ticket Not Ekleme

```
POST /api/admin/tickets/:ticketId/notes
```

**Request Body:**
```json
{
  "note": "Musteri ile tekrar iletisime gecildi.",
  "author": "admin"
}
```

---

### Toplu Ticket Islemi

```
POST /api/admin/tickets/bulk
```

**Request Body:**
```json
{
  "ticketIds": ["tid-1", "tid-2"],
  "action": "close",
  "value": null
}
```

`action`: `"close"` | `"assign"` | `"priority"`
- `assign` icin `value`: atanan kisi adi
- `priority` icin `value`: `"low"` / `"normal"` / `"high"`

---

### Ticket Export

```
GET /api/admin/tickets/export
```

**Query Parametreleri:**
| Parametre | Varsayilan | Aciklama |
|-----------|-----------|----------|
| `format` | `json` | `json` veya `csv` |
| `status` | - | Durum filtresi |

---

## Admin — Bilgi Tabani (Knowledge Base)

### KB Listesi

```
GET /api/admin/knowledge
```

**Yanit:**
```json
{
  "ok": true,
  "records": [
    { "id": 1, "question": "Kargo suresi?", "answer": "2-3 is gunu." }
  ]
}
```

---

### KB Ekleme

```
POST /api/admin/knowledge
```

**Request Body:**
```json
{
  "question": "Iade nasil yapilir?",
  "answer": "14 gun icinde iade talebi olusturun."
}
```

Otomatik olarak vektor indeksini yeniden olusturur.

---

### KB Guncelleme

```
PUT /api/admin/knowledge/:id
```

**Request Body:**
```json
{
  "question": "Iade suresi nedir?",
  "answer": "15 gun icinde iade edilebilir."
}
```

---

### KB Silme

```
DELETE /api/admin/knowledge/:id
```

---

### KB Yeniden Indeksleme

```
POST /api/admin/knowledge/reingest
```

LanceDB vektor indeksini sifirdan olusturur.

**Yanit:**
```json
{ "ok": true, "recordCount": 150 }
```

---

### KB Dosya Yukleme

```
POST /api/admin/knowledge/upload
```

**Headers:**
- `Content-Type: multipart/form-data`

**Form Alanlari:**
- `file` — PDF, DOCX veya TXT dosyasi (maks 10MB)

**Yanit:**
```json
{ "ok": true, "chunksAdded": 12, "totalRecords": 162 }
```

---

## Admin — Bot Yapilandirma

### Agent Dosya Listesi

```
GET /api/admin/agent/files
```

**Yanit:**
```json
{ "ok": true, "files": ["soul.md", "persona.md", "domain.md"] }
```

---

### Agent Dosya Oku

```
GET /api/admin/agent/files/:filename
```

---

### Agent Dosya Kaydet

```
PUT /api/admin/agent/files/:filename
```

**Request Body:**
```json
{ "content": "# Yeni icerik..." }
```

Onceki versiyon otomatik olarak kaydedilir.

---

### Konu Listesi

```
GET /api/admin/agent/topics
```

---

### Konu Detay

```
GET /api/admin/agent/topics/:topicId
```

---

### Konu Olustur

```
POST /api/admin/agent/topics
```

**Request Body:**
```json
{
  "id": "kargo-takip",
  "title": "Kargo Takibi",
  "keywords": ["kargo", "teslimat", "takip"],
  "requiresEscalation": false,
  "canResolveDirectly": true,
  "requiredInfo": ["fullName"],
  "content": "# Kargo Takip Talimatlari..."
}
```

`id` formati: `[a-z0-9-]+`

---

### Konu Guncelle

```
PUT /api/admin/agent/topics/:topicId
```

---

### Konu Sil

```
DELETE /api/admin/agent/topics/:topicId
```

---

### Hafiza Sablonlari

```
GET /api/admin/agent/memory
```

```
PUT /api/admin/agent/memory/:filename
```

`filename`: `"ticket-template.json"` veya `"conversation-schema.json"`

**Request Body:**
```json
{ "content": "{\"requiredFields\": [...]}" }
```

Content gecerli JSON olmalidir.

---

### Agent Reload

```
POST /api/admin/agent/reload
```

Tum agent config, chatflow, site config ve sunshine config dosyalarini yeniden yukler.

---

### Prompt Versiyonlari

```
GET /api/admin/prompt-versions
```

```
POST /api/admin/prompt-versions/:id/rollback
```

Belirtilen versiyona geri doner.

---

## Admin — Config

### Chat Flow

```
GET /api/admin/chat-flow
PUT /api/admin/chat-flow
```

PUT Request Body:
```json
{
  "config": {
    "welcomeMessage": "Merhaba!",
    "quickReplies": ["Kargo durumu", "Iade talebi"]
  }
}
```

---

### Site Config

```
GET /api/admin/site-config
PUT /api/admin/site-config
```

PUT Request Body:
```json
{
  "config": {
    "primaryColor": "#4F46E5",
    "headerTitle": "Acme Destek"
  }
}
```

---

### Logo Yukleme

```
POST /api/admin/site-logo
```

**Headers:**
- `Content-Type: image/jpeg` (veya `image/png`, `image/svg+xml`, `image/webp`, `image/gif`)

Body: Ham gorsel verisi (maks 2MB)

---

### Sunshine Config

```
GET /api/admin/sunshine-config
PUT /api/admin/sunshine-config
POST /api/admin/sunshine-config/test
```

Zendesk Sunshine Conversations entegrasyonu ayarlari. `test` endpoint'i API baglantisini dogrular.

---

### Ortam Degiskenleri

```
GET /api/admin/env
```

Hassas anahtarlar maskelenmis olarak dondurulur.

```
PUT /api/admin/env
```

**Request Body:**
```json
{
  "updates": {
    "BOT_NAME": "Yeni Bot Adi",
    "SUPPORT_HOURS_ENABLED": "true"
  }
}
```

Maskelenmis degerler (`****` iceren) otomatik olarak atlanir. Degisiklikler aninda uygulanir.

---

## Admin — Analitik

### Dashboard Istatistikleri

```
GET /api/admin/dashboard-stats
```

Bugun, bu hafta, bu ay ve onceki donem karsilastirmali KPI'lar.

---

### Analitik Detay

```
GET /api/admin/analytics?range=7d
```

**Query Parametreleri:**
| Parametre | Varsayilan | Aciklama |
|-----------|-----------|----------|
| `range` | `7d` | `7d`, `30d` veya `90d` |

Gunluk kirilimli detayli analitik verisi dondurur.

---

### Analitik Export

```
GET /api/admin/analytics/export?format=csv&range=30d
```

---

### Feedback Raporu

```
GET /api/admin/feedback-report?days=7
```

---

## Admin — Sistem

### Ozet

```
GET /api/admin/summary
```

Ticket istatistikleri ozeti (toplam, duruma gore dagilim).

---

### Sistem Durumu

```
GET /api/admin/system?forceCheck=1
```

Uptime, bellek kullanimi, agent dosya durumu, KB durumu, LLM sagligi.

`forceCheck=1` ile LLM API'yi test eder.

---

### Konusma Listesi

```
GET /api/admin/conversations?status=active
```

Canli konusmalari listeler.

---

### Tum Konusmalari Kapat

```
POST /api/admin/conversations/close-all
```

---

### Yedekleme

```
POST /api/admin/backup
```

SQLite veritabani yedegi olusturur.

---

### Audit Log

```
GET /api/admin/audit-log
```

Son 100 admin islemi.

---

## Admin — Webhook

### Webhook Listesi

```
GET /api/admin/webhooks
```

---

### Webhook Olustur

```
POST /api/admin/webhooks
```

**Request Body:**
```json
{
  "url": "https://example.com/webhook",
  "events": ["ticket_created", "csat_rating"],
  "secret": "hmac-secret-key"
}
```

---

### Webhook Guncelle

```
PUT /api/admin/webhooks/:id
```

---

### Webhook Sil

```
DELETE /api/admin/webhooks/:id
```

---

### Webhook Test

```
POST /api/admin/webhooks/:id/test
```

Secilen webhook'a test payload'u gonderir.

---

### Webhook Teslimat Gecmisi

```
GET /api/admin/webhooks/deliveries
```

Son 50 webhook teslimat kaydi.

---

## Admin — Insights

### SLA Takibi

```
GET /api/admin/sla
```

**Yanit:**
```json
{
  "ok": true,
  "config": { "firstResponseMin": 5, "resolutionMin": 60 },
  "summary": {
    "activeTickets": 12,
    "firstResponseBreaches": 2,
    "resolutionBreaches": 1,
    "slaComplianceRate": 75,
    "avgResolutionMin": 35
  },
  "breachedTickets": [...]
}
```

---

### Otomatik FAQ Olustur

```
POST /api/admin/auto-faq/generate
```

Cozulmus ticket'lardan LLM ile FAQ onerisi olusturur.

---

### Otomatik FAQ Listesi

```
GET /api/admin/auto-faq
```

Bekleyen (pending) FAQ onerileri.

---

### FAQ Onayla

```
POST /api/admin/auto-faq/:id/approve
```

Oneriyi onaylar ve bilgi tabanina ekler.

---

### FAQ Reddet

```
POST /api/admin/auto-faq/:id/reject
```

---

### Icerik Bosluklari

```
GET /api/admin/content-gaps
```

Bot'un cevaplayamadigi sorular, sikliga gore siralanmis.

```
DELETE /api/admin/content-gaps/:index
```

Bir icerik boslugunu listeden kaldirir.

---

### Feedback Listesi

```
GET /api/admin/feedback
```

Son 100 kullanici geri bildirimi.

---

## Admin — Agent Inbox (HITL)

### SSE Stream

```
GET /api/admin/inbox/stream
```

Server-Sent Events baglantisi. Canli guncellemeler alir:
- `connected` — Baglanti kuruldu
- `claimed` — Konusma sahiplenildi
- `message` — Yeni mesaj
- `released` — Konusma birakildi

---

### Inbox Listesi

```
GET /api/admin/inbox
```

**Yanit:**
```json
{
  "ok": true,
  "pending": [...],
  "active": [...]
}
```

---

### Konusma Sahiplen

```
POST /api/admin/inbox/:id/claim
```

**Request Body:**
```json
{ "agentName": "mehmet" }
```

---

### Mesaj Gonder

```
POST /api/admin/inbox/:id/message
```

**Request Body:**
```json
{ "message": "Merhaba, size yardimci olabilirim." }
```

---

### Konusma Birak

```
POST /api/admin/inbox/:id/release
```

Konusmayi bota geri devreder.

---

## Deploy Webhook

```
POST /deploy
```

GitHub webhook receiver. `DEPLOY_WEBHOOK_SECRET` tanimlandiysa aktif olur. Main branch'e push yapildiginda `deploy.sh` scriptini calistirir. HMAC-SHA256 imza dogrulamasi yapar.
