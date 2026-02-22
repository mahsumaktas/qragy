# Qragy - AI Musteri Destek Botu

Sifir butceli KOBi'ler icin Turkce AI musteri destek botu. Tek komutla calisir, Raspberry Pi'da bile ayaga kalkar.

## Ozellikler

- AI destekli musteri hizmeti (Gemini, OpenAI, Claude, Groq, Mistral, DeepSeek, Ollama)
- Hybrid RAG (vektor + tam metin arama)
- Admin paneli (analitik, KB yonetimi, bot yapilandirma)
- HITL (Human-in-the-Loop) agent inbox
- Widget (dark mode, CSAT, quick reply, typing indicator)
- Telegram entegrasyonu
- First-run setup wizard
- User-scope hafiza
- Otomatik FAQ onerisi ve icerik boslugu tespiti
- SLA takibi ve ihlal uyarilari
- Prompt versiyonlama ve rollback

## Hizli Baslangic

```bash
git clone https://github.com/mahsumaktas/qragy.git
cd qragy && npm install
cp .env.example .env   # GOOGLE_API_KEY ekleyin
npm start
```

Tarayicida `http://localhost:3000/admin` acin — setup wizard sizi karsilayacak.

[Detayli Kurulum Rehberi](setup-guide.md)

## Dokumantasyon

| Dokuman | Aciklama |
|---------|----------|
| [Kurulum Rehberi](setup-guide.md) | 5 dakikada calisan bot |
| [Admin Kullanim Rehberi](admin-guide.md) | Admin paneli kullanimi |
| [API Referans](api-reference.md) | Tum endpoint'ler |

## Teknoloji

| Katman | Teknoloji |
|--------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| AI | Gemini, OpenAI, Ollama (multi-provider) |
| Vector DB | LanceDB (embedded, serverless) |
| Database | SQLite (better-sqlite3) |
| Frontend | Vanilla JS (sifir framework, sifir build step) |

## Proje Yapisi

```
qragy/
├── server.js              # Ana sunucu dosyasi
├── src/
│   ├── config/            # Ortam degiskeni yukleyici
│   ├── routes/            # API endpoint'leri
│   │   ├── admin/         # Admin panel API'leri
│   │   ├── chat.js        # Chat endpoint
│   │   ├── conversation.js # Konusma yonetimi
│   │   ├── setup.js       # Setup wizard
│   │   └── agentInbox.js  # HITL agent inbox
│   ├── services/          # Is mantigi servisleri
│   ├── middleware/         # Auth, rate limit, guvenlik
│   └── utils/             # Yardimci fonksiyonlar
├── lib/                   # LLM provider, chunker, DB
├── agent/                 # Bot kisililik ve kurallar
├── memory/                # Konusma ve ticket sablonlari
├── public/                # Frontend dosyalari
├── data/                  # Runtime veri (otomatik olusur)
└── tests/                 # Unit ve integration testleri
```

## Lisans

[MIT](../LICENSE) — istediginiz gibi kullanin.
