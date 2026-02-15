# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
