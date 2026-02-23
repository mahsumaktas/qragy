# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.1.0] - 2026-02-23

### Added
- Action-capable admin assistant — reads/updates agent files, manages KB, configures integrations
- Multi-step agent loop (max 3 iterations) with dangerous action confirmation
- File upload support for admin assistant (PDF/DOCX/XLSX/TXT parsing)
- Multi-chat bot test panel — open parallel test sessions in a grid layout
- `ADMIN_ASSISTANT_MODEL` env variable for separate assistant model selection
- Admin sidebar reorganized into 3 groups: Yonetim, Bot Ayarlari, Sistem
- Full Turkish character support across admin panel

### Fixed
- ESLint errors and warnings for CI (empty catch blocks, unused vars, let→const)
- test-widget.html now includes full chat widget HTML structure
- X-Frame-Options header allows same-origin iframes for bot test panel

## [2.0.0] - 2026-02-22

### Added
- **Multi-provider LLM support** — Gemini, OpenAI, Anthropic, Groq, Mistral, DeepSeek, Ollama via raw fetch()
- **Hybrid RAG** — vector + full-text search with Reciprocal Rank Fusion
- **LLM reranker** — re-ranks search results using LLM or Cohere
- **CRAG evaluator** — Corrective RAG checks relevance before answering
- **Query analyzer** — intent classification for better retrieval
- **Contextual chunker** — LLM-enhanced document chunking with context
- **Quality scorer** — automatic response quality evaluation
- **Reflexion** — self-reflection loop for low-quality answers
- **Knowledge graph** — entity extraction and relationship mapping
- **Core memory** — persistent user facts across conversations
- **Human-in-the-loop (HITL)** — agent inbox with SSE live updates, claim/release
- **Conversation summarizer** — automatic long conversation compression
- **SQLite backend** — tickets, conversations, analytics in better-sqlite3
- **Injection guard** — prompt injection detection + output validation
- **URL extractor** — fetch and index web page content for RAG
- Modular pipeline architecture (services/pipeline, services/rag, services/intelligence)
- Setup wizard for first-run configuration
- SLA monitoring, auto-FAQ generation, content gap detection
- Feedback reports with CSAT tracking
- Audit logging for admin actions
- Admin panel: insights tab, system backup, WhatsApp config

### Changed
- Architecture refactored from monolithic to modular service pattern
- Test suite expanded from 45 to 440+ tests across 60 files
- Admin panel redesigned with sidebar navigation

## [1.1.0] - 2026-02-15

### Added
- Rate limiting with configurable thresholds (in-memory, per-IP)
- Model fallback when primary Gemini model returns errors
- Analytics dashboard with SVG charts, daily metrics, top topics
- Webhook notifications with HMAC-SHA256 signing (Slack, n8n, Zapier)
- PDF/DOCX/TXT file upload for knowledge base with auto-chunking
- Telegram bot channel integration via long polling
- Service worker for offline caching
- Team features: ticket assignment, priority levels, internal notes
- Prompt versioning with auto-snapshot and rollback
- Conversation search with text and source filters
- Code/data separation: runtime data stays in `data/` (gitignored)

### Changed
- Knowledge base CSV moved from root to `data/knowledge_base.csv`
- Example KB template renamed to `knowledge_base.example.csv`
- Auto-copy of example KB on first run

### Removed
- Duplicate `qragy_logo.jpg` from repository root

## [1.0.0] - 2026-02-14

### Added
- AI-powered RAG chatbot with LanceDB vector search
- Gemini AI integration (Flash + Pro models)
- Admin panel with 4 tabs (Tickets, Knowledge Base, Bot Config, System)
- Topic routing with keyword detection and AI classification
- Deterministic info collection before escalation
- Zendesk live agent handoff integration
- Embeddable chat widget (`embed.js`)
- CSV-based knowledge base with vector embeddings
- Support hours enforcement
- Configurable bot personality via markdown files
- Ticket management system
- Hot-reload for agent configuration
