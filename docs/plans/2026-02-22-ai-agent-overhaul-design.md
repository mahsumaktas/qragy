# Qragy AI Agent Overhaul — Design Document

**Tarih:** 2026-02-22
**Amac:** Qragy'yi production-ready AI agent seviyesine cikarmak (10/10)
**Strateji:** Katmanli Iterasyon — once moduler yapi, sonra sirayla iyilestirme

---

## 1. Moduler Yapi

Monolitik `server.js` (185KB) asagidaki yapiya donusturulecek:

```
server.js                          # Ince — app setup + route mounting + listen
src/
  config/index.js                  # ENV parsing, defaults, validation
  middleware/
    auth.js                        # Admin token validation
    rateLimiter.js                 # IP-based rate limiting
    security.js                    # CORS, headers, input sanitization
    injectionGuard.js              # Prompt injection detection [YENi]
  services/
    llm.js                         # LLM orchestration (providers.js wrapper)
    rag.js                         # Knowledge search + RRF + relevance scoring
    memory.js                      # Conversation memory + compression [YENi]
    statemachine.js                # 7+1 state conversation FSM [YENi]
    escalation.js                  # 3-layer escalation + loop detection [YENi]
    topic.js                       # Topic detection + drift handling
    ticket.js                      # Ticket CRUD + duplicate detection
    analytics.js                   # Analytics buffer + flush
    webhook.js                     # Webhook dispatch + HMAC signing
  routes/
    chat.js                        # POST /api/chat
    admin.js                       # /api/admin/*
    sunshine.js                    # /api/sunshine/*
    telegram.js                    # Telegram bot polling
    health.js                      # /api/health, /api/system
  prompt/
    builder.js                     # System prompt construction + token management
  utils/
    session.js                     # Server-side UUID session management [YENi]
    sanitizer.js                   # PII masking, input cleaning
    validators.js                  # Field validation (branchCode, phone, etc.)
lib/                               # DEGISMEZ
  db.js, providers.js, chunker.js
tests/
  unit/                            # Modul bazli unit testler
  integration/                     # Uctan uca akis testleri
```

**Prensip:** `lib/` mevcut haliyle kalir. Yeni kod `src/` altinda. `server.js` sadece setup.

---

## 2. Hafiza ve Baglam Yonetimi (src/services/memory.js)

### Sliding Window + Progressive Summary

| Mesaj Sayisi | Strateji |
|---|---|
| < 20 | Tum gecmis olduğu gibi |
| 20-40 | Eski mesajlar LLM ile ozetlenir, son 12 tam kalir |
| 40+ | Ozet + son 8 mesaj |

### Progressive Fallback (ozet basarisiz olursa)

1. LLM ozet (512 token)
2. Extractive ozet (her turdan 1 cumle)
3. Ilk 3 + son 8 mesaj (en kotu durum)

### Token Butcesi

| Parca | Max Token |
|---|---|
| System prompt | 8000 |
| Conversation history | 4000 |
| RAG context | 2000 |
| Response budget | 1024 |
| **Toplam** | **~15000** |

### Farewell Fix

- `farewellOffered = true` set edilecek
- Farewell sonrasi yeni mesaj → closed_followup state → "Baska bir konuda yardimci olabilir miyim?"

---

## 3. RAG Kalitesi (src/services/rag.js)

### Dinamik Relevance Threshold

| Distance | Guven | Davranis |
|---|---|---|
| < 0.5 | Yuksek | Direkt kullan |
| 0.5-0.8 | Orta | RRF ile birlikte kullan |
| 0.8-1.2 | Dusuk | Sadece full-text desteklerse kullan |
| > 1.2 | Yok | Filtrele |

### Adaptive topK

| KB Boyutu | topK |
|---|---|
| < 50 | 3 |
| 50-500 | 5 |
| 500+ | 7 |

RRF sonrasi final max 5 sonuc.

### Gelistirilmis Full-Text Scoring

- Exact question match: +15
- Phrase match (2+ kelime ardisik): +8
- Word in question: +3
- Word in answer: +1
- Turkish stemming bonusu: +2

### Sonuc Bulunamadi Davranisi

0 sonuc → recordContentGap() + AI'ya "Bilgi bankasinda bu konuda bilgi bulunamadi" notu.
AI kendi bilgisiyle cevap vermesin, "Bu konuda bilgim yok" desin.

---

## 4. State Machine (src/services/statemachine.js)

### States

```
welcome | topic_detection | topic_guided_support | info_collection |
escalation_handoff | farewell | fallback_ticket_collect | closed_followup [YENi]
```

### Transition Rules

```
welcome → topic_detection          : Konu iceren mesaj
welcome → welcome                  : Sadece selamlama (max 2 tur)
welcome(2. tur) → topic_detection  : Otomatik yonlendirme

topic_detection → topic_guided_support     : Konu bulundu
topic_detection → fallback_ticket_collect  : 2 tur konu bulunamadi

topic_guided_support → info_collection     : Adimlar tukendi + escalation gerekli
topic_guided_support → farewell            : "tesekkurler/oldu/tamam"
topic_guided_support → topic_detection     : TOPIC DRIFT (farkli konu)
topic_guided_support → escalation_handoff  : "temsilci istiyorum" veya loop detected

info_collection → escalation_handoff       : Bilgiler toplandi veya 5 tur gecti

escalation_handoff → farewell              : Handoff basarili

farewell → closed_followup                 : Kullanici tekrar yazdi
closed_followup → topic_detection          : Yeni konu
```

### Topic Drift Handling

Konu degisiminde:
1. Onceki konunun 1 cumlelik ozeti olusturulur
2. `topicHistory[]` dizisine eklenir
3. Yeni konu context'i yuklenir
4. Prompt'a "Onceki konular" notu eklenir
5. "Onceki konuya donelim" denirse topicHistory'den restore

### Loop Detection

- Son 3 user mesajinin semantic similarity'si > 0.85 → LOOP
- Ayni state'te 4+ tur → LOOP
- Ayni topic'te 6+ tur + collectedInfo degismedi → LOOP
- Tespit → "Standart adimlar sorununuzu cozmemis gorunuyor. Canli destek temsilcisine aktarayim mi?"

---

## 5. Escalation Zekasi (src/services/escalation.js)

### Layer 1 — Anlik (Deterministik)

- Credential tespiti (ID + sifre birlikte)
- Kullanici acik talep: "temsilciye aktar", "canli destek"
- Tehdit/kufur tespiti

### Layer 2 — Kosullu (Kural Tabanli) [YENi]

- "yapamadim/olmadi/cozemedim" + adimlar verilmis → onay sor
- Negatif sentiment 3+ tur ust uste → onay sor
- Topic adimlarinin tamami tukendi → onay sor
- Bilinmeyen konu + 2 tur → fallback_ticket_collect

### Layer 3 — Loop Detection [YENi]

- Ayni state'te 4+ tur
- Son 3 mesaj benzer
- collectedInfo 3+ turdur degismedi

### Sentiment Detection (dependency'siz)

Negatif/pozitif kelime listesi ile basit skorlama.
3 tur ust uste negatif → escalation trigger.

### Post-Handoff Davranisi

- Basarili → farewell + "handed_off" flag
- Basarisiz → "Temsilciler mesgul, ticket olusturduk"
- Sonrasi mesaj → "Talebiniz iletildi. Baska konuda yardimci olabilir miyim?"

---

## 6. Guvenlik

### Prompt Injection — 3 Katman

**Katman 1 — Input Sanitization (her mesajda, sifir latency):**
Bilinen injection pattern'lerini regex ile filtrele.
Tespit → bloke + generic cevap.

**Katman 2 — LLM Classification (supheli mesajlarda):**
"instruction", "prompt", "ignore" gibi kelimeler varsa kucuk LLM call.
"evet" → bloke, "hayir" → devam.

**Katman 3 — Output Validation (her cevapta):**
Bot cevabinda system prompt parcasi, AI itirafi, kural aciklamasi var mi kontrol.
Tespit → sanitize + generic cevap.

### Server-Side Session (src/utils/session.js)

- Ilk istek → server `crypto.randomUUID()` uretir
- Sonraki istekler → DB'de dogrulama
- Kullanici-provided sessionId kabul edilmez

### Response Validation Genisletmesi

- Tekrar: 2+ ayni cumle VEYA ayni kelime 5+ kez
- 15+ hallucination marker
- Dil tutarliligi kontrolu
- MAX_TOKENS kesilmesinde kayitsiz sart retry

---

## 7. System Prompt Token Yonetimi (src/prompt/builder.js)

### Oncelik Sistemi

| Oncelik | Parcalar | Davranis |
|---|---|---|
| 1 (Zorunlu) | soul, persona, hardBans, memory, history | Her zaman tam |
| 2 (Onemli) | bootstrap, escalation, responsePolicy, topicContent, ragResults | Gerekirse kisilir |
| 3 (Opsiyonel) | domain, skills, dod, outputFilter | Ilk kisilir |

Toplam > 15000 token → once priority 3 kisilir, sonra 2.

### Topic File Cache Invalidation

Admin guncelleme endpoint'lerinde `topicFileCache.delete(topicId)` cagrisi.

---

## 8. Deterministic Collection Iyilestirmesi

- Multi-field extraction: Tek mesajdan birden fazla alan cikarilabilir
- Eksik kalanlar tek tek sorulur
- branchCode validation: min 1 harf + 1 rakam, email reject, pure numeric reject

---

## 9. Test Altyapisi

**Framework:** Vitest

**Unit testler:**
- statemachine.test.js, escalation.test.js, rag.test.js
- memory.test.js, topic.test.js, injectionGuard.test.js, session.test.js

**Integration testler:**
- chat.test.js (uctan uca akis)
- escalation-flow.test.js (chat → escalation → ticket → handoff)
- admin.test.js (KB CRUD, cache invalidation)

---

## Kararlar Ozeti

| Karar | Secim |
|---|---|
| Mimari | Moduler (src/ altinda) |
| Session | Server-side UUID |
| Injection savunmasi | 3 katmanli (regex + LLM + output) |
| Context yonetimi | Sliding window + progressive summary |
| Test | Vitest, unit + integration |
| Strateji | Katmanli iterasyon |
