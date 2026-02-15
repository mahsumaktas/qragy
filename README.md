<p align="center">
  <img src="public/qragy_logo.jpg" alt="Qragy Logo" width="200">
  <h1 align="center">Qragy</h1>
  <p align="center"><strong>Self-Hosted RAG Chatbot &mdash; No Vector DB Required</strong></p>
  <p align="center">
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
    <img src="https://img.shields.io/badge/node-18%2B-brightgreen.svg" alt="Node 18+">
    <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
  </p>
  <p align="center">
    <a href="#quick-start">Quick Start</a> &bull;
    <a href="#features">Features</a> &bull;
    <a href="#admin-panel">Admin Panel</a> &bull;
    <a href="#deploy">Deploy</a> &bull;
    <a href="#api">API</a>
  </p>
</p>

<p align="center">
  <a href="https://render.com/deploy?repo=https://github.com/mahsumaktas/qragy"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render"></a>
</p>

---

### Why Qragy?

**Dify is great but too heavy for Raspberry Pi** (needs Docker, Redis, Postgres).
**Qragy runs on a potato.** It uses LanceDB (embedded vector DB) and Gemini Flash (free).

One process. One CSV file. Zero infrastructure. `npm start` and you have a production-ready AI support bot.

---

> **Too heavy for Raspberry Pi? Use Qragy.**
> Built for self-hosters who want a production-ready AI support bot without the cloud bill.

## What is Qragy?

Qragy is a **fully self-hosted AI customer support chatbot** that runs on a single Node.js process. No Docker. No Kubernetes. No managed vector database. Just `npm start` and you have:

- An AI chatbot that actually knows your product (RAG-powered)
- A full admin panel to manage everything from the browser
- Live agent handoff when the bot can't help
- All running on a **$35 Raspberry Pi** if you want

## Features

### AI That Knows Your Product
- **RAG Search**: Your knowledge base is embedded and searched with vector similarity
- **Topic Routing**: Keywords + AI classify issues into structured flows
- **Deterministic Collection**: Bot gathers required info (branch code, issue summary) before escalating

### Admin Panel (No Code Required)
Manage your entire bot from `/admin`:

| Tab | What You Can Do |
|-----|----------------|
| **Tickets** | View all support requests, chat histories, handoff status |
| **Knowledge Base** | Add/edit/delete Q&A entries, re-embed with one click |
| **Bot Config** | Edit persona, topics, escalation rules, memory templates, env vars |
| **Analytics** | Daily metrics, top topics, resolution rates, SVG charts |
| **System** | Health monitoring, agent config hot-reload |

### LanceDB (Serverless Vector DB)
- **Zero infrastructure**: Embedded database, runs in-process
- **No separate server**: Unlike Pinecone, Weaviate, or Qdrant
- **Persistent**: Survives restarts, stored as local files
- **Fast**: Native vector search, no network round-trips

### Free Embedding Models
| Provider | Model | Dimensions | Cost |
|----------|-------|-----------|------|
| **Google Gemini** | `gemini-embedding-001` | 3072 | Free tier available |
| **OpenAI** | `text-embedding-3-small` | 1536 | $0.02/1M tokens |

Default: Gemini (free, high quality, 3072 dimensions)

### Live Agent Handoff
- **Zendesk integration**: Automatic widget opening + summary injection
- **Embeddable widget**: Drop one `<script>` tag on any website
- **Ticket system**: Every conversation becomes a searchable ticket
- **Support hours**: Enforce business hours, queue after-hours requests

### Self-Hosting Friendly
- **Single process**: One `node server.js`, that's it
- **File-based storage**: CSV + JSON + LanceDB files. No PostgreSQL, no Redis
- **Low resources**: Runs on Raspberry Pi 4 (2GB RAM is enough)
- **No build step**: Vanilla JS frontend, zero bundling

### v2 Features
- **Rate Limiting**: Configurable per-IP thresholds with in-memory tracking
- **Analytics**: Daily metrics, top topics, SVG charts in the admin panel
- **Webhooks**: HMAC-SHA256 signed notifications to Slack, n8n, Zapier
- **File Upload**: PDF/DOCX/TXT upload for knowledge base with auto-chunking
- **Telegram**: Bot channel integration via long polling
- **Team Features**: Ticket assignment, priority levels, internal notes
- **Prompt Versioning**: Auto-snapshot and rollback for bot configuration

## Quick Start

### 1. Clone

```bash
git clone https://github.com/mahsumaktas/qragy.git
cd qragy
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Add your Gemini API key (free at [aistudio.google.com](https://aistudio.google.com)):

```env
GOOGLE_API_KEY=your_key_here
BOT_NAME=My Support Bot
COMPANY_NAME=My Company
```

### 3. Ingest Knowledge Base

```bash
node scripts/ingest.js
```

### 4. Run

```bash
npm start
```

Open `http://localhost:3000` for the chatbot, `http://localhost:3000/admin` for the admin panel.

## Deploy

### Render (One-Click)

<a href="https://render.com/deploy?repo=https://github.com/mahsumaktas/qragy"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render"></a>

### Raspberry Pi

```bash
# On your Pi
git clone https://github.com/mahsumaktas/qragy.git
cd qragy && npm install
cp .env.example .env   # edit with your API key
node scripts/ingest.js
npm install -g pm2
pm2 start server.js --name qragy
pm2 save && pm2 startup
```

### Any VPS

Works on any machine with Node.js 18+. No Docker needed (but works with Docker too).

## Architecture

```
User <-> Chat Widget <-> Express Server <-> Gemini AI
                              |
                    +---------+---------+
                    |         |         |
                 Topics    LanceDB    Zendesk
                (flow)     (RAG)     (handoff)
```

**How a message flows:**
1. User sends a message
2. Topic detection (keywords + AI classification)
3. RAG search finds relevant Q&A from knowledge base
4. Gemini generates contextual reply using topic instructions + RAG results
5. Bot collects required fields
6. Escalation to Zendesk when needed

## Project Structure

```
qragy/
├── server.js              # Everything: API, AI, RAG, tickets
├── knowledge_base.example.csv  # Example Q&A data template
├── agent/                 # Bot personality & rules
│   ├── soul.md            # Who is the bot
│   ├── persona.md         # How it talks
│   ├── topics/            # Structured support flows
│   │   ├── _index.json    # Topic registry
│   │   └── *.md           # Topic instructions
│   └── ...                # Escalation, filtering, etc.
├── memory/                # Conversation templates
├── public/                # Frontend (vanilla JS)
│   ├── index.html         # Chat page
│   ├── admin.html         # Admin panel
│   └── embed.js           # Embeddable widget
├── scripts/ingest.js      # CSV -> LanceDB embedder
└── data/                  # Runtime data (auto-created)
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_API_KEY` | Gemini API key **(required)** | - |
| `BOT_NAME` | Bot display name | `Qragy Bot` |
| `COMPANY_NAME` | Your company name | - |
| `REMOTE_TOOL_NAME` | Remote desktop tool (for escalation detection) | - |
| `ADMIN_TOKEN` | Admin panel password | - |
| `ZENDESK_ENABLED` | Enable Zendesk handoff | `false` |
| `SUPPORT_HOURS_ENABLED` | Enforce business hours | `false` |
| `DETERMINISTIC_COLLECTION_MODE` | Structured info gathering | `true` |
| `RATE_LIMIT_ENABLED` | Enable per-IP rate limiting | `true` |
| `GOOGLE_FALLBACK_MODEL` | Fallback model on primary error | `gemini-2.0-flash` |
| `TELEGRAM_ENABLED` | Enable Telegram bot integration | `false` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token | - |
| `WEBHOOK_ENABLED` | Enable webhook notifications | `false` |
| `WEBHOOK_URL` | Webhook endpoint URL | - |
| `WEBHOOK_SECRET` | HMAC-SHA256 signing secret | - |

Full list in [`.env.example`](.env.example).

## Admin Panel

### Tickets
View all conversations with full chat history, handoff status, and search.

### Knowledge Base
CRUD interface for Q&A pairs. Each save re-embeds the entry. "Re-ingest" button rebuilds the entire vector index.

### Bot Config
- **Agent Files**: Edit `soul.md`, `persona.md`, and all personality files from the browser
- **Topics**: Create/edit/delete structured support flows with keywords, escalation rules, and required info
- **Memory Templates**: JSON editors for ticket and conversation schemas
- **Environment**: Edit all env vars (sensitive values masked)

### Analytics
Daily conversation metrics, top topics, resolution rates, and SVG charts for visual reporting.

### System
Health dashboard with uptime, memory usage, agent file status, and hot-reload button.

## API

All admin endpoints require `x-admin-token` header when `ADMIN_TOKEN` is set.

<details>
<summary>View all endpoints</summary>

### Chat
- `POST /api/chat` - Send message, get AI response

### Tickets
- `GET /api/admin/summary` - Dashboard stats
- `GET /api/admin/tickets` - List tickets
- `GET /api/admin/tickets/:id` - Ticket detail

### Knowledge Base
- `GET /api/admin/knowledge` - List entries
- `POST /api/admin/knowledge` - Add entry
- `PUT /api/admin/knowledge/:id` - Update entry
- `DELETE /api/admin/knowledge/:id` - Delete entry
- `POST /api/admin/knowledge/reingest` - Rebuild vector index

### Bot Config
- `GET/PUT /api/admin/agent/files/:name` - Read/write agent files
- `GET/POST/PUT/DELETE /api/admin/agent/topics/:id` - Topic CRUD
- `GET/PUT /api/admin/agent/memory/:name` - Memory templates
- `GET/PUT /api/admin/env` - Environment variables

### Analytics
- `GET /api/admin/analytics` - Dashboard metrics and charts

### Webhooks
- `GET /api/admin/webhooks/config` - Get webhook configuration
- `PUT /api/admin/webhooks/config` - Update webhook configuration
- `POST /api/admin/webhooks/test` - Send test webhook

### File Upload
- `POST /api/admin/knowledge/upload` - Upload PDF/DOCX/TXT file

### Team
- `PUT /api/admin/tickets/:id/assign` - Assign ticket to team member
- `PUT /api/admin/tickets/:id/priority` - Set ticket priority
- `POST /api/admin/tickets/:id/notes` - Add internal note

### Prompt Versions
- `GET /api/admin/agent/versions` - List prompt versions
- `POST /api/admin/agent/versions/rollback` - Rollback to a previous version

### System
- `GET /api/admin/system` - Health info
- `POST /api/admin/agent/reload` - Hot-reload config

</details>

## Embedding Widget

Add Qragy to any website with one script tag:

```html
<script>
  window.__QRAGY_API = "https://your-qragy-server.com";
</script>
<script src="https://your-qragy-server.com/embed.js"></script>
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| AI | Google Gemini API |
| Vector DB | LanceDB (embedded, serverless) |
| Embeddings | Gemini Embedding 001 (3072d) |
| Frontend | Vanilla JS (zero build step) |
| Storage | CSV + JSON files |

## Why Qragy?

| | Qragy | Dify | Botpress | Intercom |
|---|---|---|---|---|
| Self-hosted | Yes | Partial | No | No |
| Runs on Pi | Yes | No | No | No |
| Vector DB | Embedded | External | External | Managed |
| Free tier | Unlimited | Limited | Limited | No |
| Admin panel | Built-in | Yes | Yes | Yes |
| Open source | MIT | Apache 2.0 | AGPL | No |
| Setup time | 2 min | 30+ min | 15+ min | N/A |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). PRs welcome!

## License

[MIT](LICENSE) - Use it however you want.
