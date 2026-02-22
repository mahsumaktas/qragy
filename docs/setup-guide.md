# Kurulum Rehberi

## Gereksinimler

- Node.js 18+
- npm

## Adimlar

### 1. Projeyi indirin

```bash
git clone https://github.com/mahsumaktas/qragy.git
cd qragy
```

### 2. Bagimliliklari yukleyin

```bash
npm install
```

### 3. Ortam degiskenlerini ayarlayin

```bash
cp .env.example .env
```

Minimum gerekli:
```
GOOGLE_API_KEY=your-gemini-api-key
ADMIN_TOKEN=your-admin-password
```

Gemini API anahtarini ucretsiz alin: https://aistudio.google.com

### 4. Uygulamayi baslatin

```bash
npm start
```

### 5. Setup Wizard

Tarayicinizda `http://localhost:3000/admin` adresine gidin.
Ilk acilista setup wizard sizi karsilayacak:

1. **Sirket Bilgileri** — Sirket adi ve sektoru
2. **Gorunum** — Logo ve tema rengi
3. **SSS** — Ornek soru-cevaplar (opsiyonel)
4. **Onizleme** — Widget onizleme

Setup wizard tamamlandiginda bot otomatik olarak sektorunuze uygun sablonlarla yapilandirilir.

### 6. Bilgi Tabani

Admin panelinden "Bilgi Tabani" sekmesine gidip icerik ekleyin:

- **Manuel ekleme:** Soru-cevap ciftleri tek tek eklenebilir
- **CSV yukleme:** `question,answer` formatinda CSV dosyasi yukleyin
- **Dosya yukleme:** PDF, DOCX veya TXT dosyasi yukleyin — otomatik chunk'lanir ve soru uretilir

## Ortam Degiskenleri

### Zorunlu

| Degisken | Aciklama |
|----------|----------|
| `GOOGLE_API_KEY` | Gemini API anahtari (veya `GEMINI_API_KEY`) |
| `ADMIN_TOKEN` | Admin paneli sifresi |

### LLM Ayarlari

| Degisken | Varsayilan | Aciklama |
|----------|-----------|----------|
| `LLM_PROVIDER` | `gemini` | LLM saglayici (`gemini` / `openai` / `ollama` / `anthropic` / `groq` / `mistral` / `deepseek`) |
| `LLM_MODEL` | - | Model adi (provider'a gore) |
| `LLM_API_KEY` | - | LLM API anahtari (GOOGLE_API_KEY'e fallback) |
| `LLM_BASE_URL` | - | Ozel API endpoint (Ollama vb.) |
| `GOOGLE_MODEL` | `gemini-3-pro-preview` | Gemini model adi |
| `GOOGLE_FALLBACK_MODEL` | - | Hata durumunda kullanilacak yedek model |
| `GOOGLE_MAX_OUTPUT_TOKENS` | `1024` | Maksimum cikti token sayisi |
| `GOOGLE_REQUEST_TIMEOUT_MS` | `15000` | LLM istek zaman asimi (ms) |

### Embedding Ayarlari

| Degisken | Varsayilan | Aciklama |
|----------|-----------|----------|
| `EMBEDDING_PROVIDER` | `gemini` | Embedding saglayici |
| `EMBEDDING_MODEL` | `gemini-embedding-001` | Embedding model adi |
| `EMBEDDING_API_KEY` | - | Embedding API anahtari |
| `EMBEDDING_BASE_URL` | - | Ozel embedding endpoint |

### Sunucu Ayarlari

| Degisken | Varsayilan | Aciklama |
|----------|-----------|----------|
| `PORT` | `3000` | Sunucu portu |
| `BOT_NAME` | `QRAGY Bot` | Bot adi |
| `COMPANY_NAME` | - | Sirket adi |
| `ALLOWED_ORIGIN` | - | CORS icin izin verilen origin |

### Mesai Saati

| Degisken | Varsayilan | Aciklama |
|----------|-----------|----------|
| `SUPPORT_HOURS_ENABLED` | `false` | Mesai saati kontrolu aktif mi |
| `SUPPORT_TIMEZONE` | `Europe/Istanbul` | Saat dilimi |
| `SUPPORT_OPEN_HOUR` | `7` | Acilis saati |
| `SUPPORT_CLOSE_HOUR` | `24` | Kapanis saati |
| `SUPPORT_OPEN_DAYS` | `1,2,3,4,5,6,7` | Acik gunler (1=Pzt, 7=Paz) |

### Guvenlik

| Degisken | Varsayilan | Aciklama |
|----------|-----------|----------|
| `RATE_LIMIT_ENABLED` | `true` | IP bazli rate limiting |
| `RATE_LIMIT_MAX` | `20` | Pencere basina maks istek |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit penceresi (ms) |
| `DATA_RETENTION_DAYS` | `90` | Veri saklama suresi (gun) |

### Entegrasyonlar

| Degisken | Varsayilan | Aciklama |
|----------|-----------|----------|
| `TELEGRAM_ENABLED` | `false` | Telegram entegrasyonu |
| `TELEGRAM_BOT_TOKEN` | - | Telegram bot token |
| `ZENDESK_ENABLED` | `false` | Zendesk entegrasyonu |
| `ZENDESK_SNIPPET_KEY` | - | Zendesk widget anahtari |
| `WEBHOOK_ENABLED` | `false` | Webhook bildirimleri |
| `WEBHOOK_URL` | - | Webhook endpoint URL |
| `WEBHOOK_SECRET` | - | HMAC-SHA256 imza anahtari |

### SLA

| Degisken | Varsayilan | Aciklama |
|----------|-----------|----------|
| `SLA_FIRST_RESPONSE_MIN` | `5` | Ilk yanitlama suresi limiti (dk) |
| `SLA_RESOLUTION_MIN` | `60` | Cozum suresi limiti (dk) |

### Diger

| Degisken | Varsayilan | Aciklama |
|----------|-----------|----------|
| `DETERMINISTIC_COLLECTION_MODE` | `true` | Yapilandirilmis bilgi toplama modu |
| `DEPLOY_WEBHOOK_SECRET` | - | GitHub auto-deploy webhook secret |

## Multi-Model Yapilandirma

### Gemini (Varsayilan, Ucretsiz)

```env
GOOGLE_API_KEY=your_key_here
```

### OpenAI

```env
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
```

### Ollama (Tamamen Yerel, API Key Gerekmez)

```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
LLM_BASE_URL=http://localhost:11434/v1
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_BASE_URL=http://localhost:11434
```

### Anthropic (Claude)

```env
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-...
LLM_MODEL=claude-sonnet-4-20250514
```

### Groq

```env
LLM_PROVIDER=groq
LLM_API_KEY=gsk_...
LLM_MODEL=llama-3.3-70b-versatile
```

## Docker

### Docker Run

```bash
docker run -d -p 3001:3000 \
  -e GOOGLE_API_KEY=your_key \
  -e ADMIN_TOKEN=your_password \
  -v qragy-data:/app/data \
  ghcr.io/mahsumaktas/qragy
```

### Docker Compose

```bash
git clone https://github.com/mahsumaktas/qragy.git
cd qragy
cp .env.example .env   # API key ekleyin
docker compose up -d
```

## Raspberry Pi

```bash
git clone https://github.com/mahsumaktas/qragy.git
cd qragy && npm install
cp .env.example .env    # GOOGLE_API_KEY ekleyin
npm install -g pm2
pm2 start server.js --name qragy
pm2 save && pm2 startup
```

## Gelistirme

```bash
# Development mode (auto-restart)
npm run dev

# Testleri calistir
npm test

# Coverage raporu
npm run test:coverage

# Lint
npm run lint
```
