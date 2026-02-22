# Next-Gen RAG & Memory System Design

## Goal
Build an AI-empowered RAG and memory system that surpasses Dify, Botpress, and Flowise by implementing techniques none of them offer natively: Contextual Retrieval, CRAG, Adaptive Query Routing, MemGPT-style Tiered Memory, Reflexion, and Lightweight GraphRAG.

## Architecture
Adaptive Pipeline: AI classifies query complexity and routes through FAST (direct LLM), STANDARD (hybrid search + rerank), or DEEP (CRAG + multi-hop) paths. Tiered memory (Core/Recall/Archival) with auto-extraction. Self-improving via Reflexion on negative feedback. Lightweight Knowledge Graph built from ticket closures.

## Tech Stack
- Node.js single-process
- SQLite (WAL) + FTS5 for BM25 sparse search, structured data, graph storage
- LanceDB for dense vector search and archival memory
- Cohere Rerank API (with LLM-as-reranker fallback)
- Existing LLM providers (Gemini, OpenAI, Claude, Groq, Mistral, DeepSeek, Ollama)

---

## 1. Adaptive RAG Pipeline

### 1.1 Query Analyzer
Single LLM call producing structured JSON:
- `complexity`: simple | medium | complex
- `intent`: greeting | faq | product_support | complaint | escalation
- `subQueries`: decomposed sub-questions for complex queries
- `requiresMemory`: boolean
- `requiresGraph`: boolean

### 1.2 Three Paths
- **FAST** (simple + greeting/chitchat): LLM direct, no retrieval. 2 LLM calls.
- **STANDARD** (medium + info queries): Hybrid search → Rerank → Generate. 3 LLM calls.
- **DEEP** (complex or standard-insufficient): CRAG loop with retry. 3-5 LLM calls.

### 1.3 Unified Hybrid Search Engine
Replaces duplicate rag.js + knowledge.js with single searchEngine.js:
- **Dense:** LanceDB vector search (existing)
- **Sparse:** SQLite FTS5 BM25 (replaces CSV disk reads)
- **Fusion:** RRF with hash-based key (fixes collision), Turkish stopword filtering
- **Adaptive top-K** preserved

### 1.4 Contextual Retrieval (Anthropic approach)
At indexing time (not runtime):
1. Chunk created
2. LLM generates 1-2 sentence context for chunk
3. Context prepended to chunk before embedding
4. Stored in LanceDB with contextual embedding

Effect: 67% reduction in retrieval failure per Anthropic benchmarks. Zero runtime cost.

### 1.5 Cross-Encoder Reranking
Multi-fallback strategy:
1. Cohere Rerank API (primary, 100+ languages including Turkish)
2. LLM-as-reranker (fallback — ask LLM to rank results)
3. RRF score (last resort — existing behavior)

### 1.6 CRAG (Corrective RAG)
In DEEP path or when STANDARD results are insufficient:
1. LLM evaluates each result: RELEVANT / PARTIAL / IRRELEVANT
2. RELEVANT → proceed to generation
3. PARTIAL → prune irrelevant chunks, generate with remainder
4. IRRELEVANT → query rewrite + retry search (max 2 attempts)
5. Still insufficient → graceful fallback (escalation offer)

---

## 2. MemGPT-Style Tiered Memory

### 2.1 Core Memory (always in prompt, ~500 tokens)
- User profile: name, branch, preferences, past issues
- Active context: current topic, conversation state
- Storage: SQLite `user_core_memory` table
- **Auto-managed by AI**: After each conversation, async LLM call extracts profile updates

### 2.2 Recall Memory (searched on demand)
- Conversation summaries, ticket summaries
- Storage: SQLite with FTS5 index for BM25 search
- Triggered when Query Analyzer sets `requiresMemory: true`
- Consolidates memory.js + conversationUtils.js + conversationSummarizer.js

### 2.3 Archival Memory (semantic search)
- Long-term learnings, patterns, reflexion logs
- Storage: LanceDB vector embeddings
- Searched when relevant context needed for complex queries

### 2.4 Token Budget Enforcement
```
TOTAL = model_context - response_budget
Core Memory:     500 tokens (fixed)
System Prompt:   2000 tokens (soul + persona)
RAG Context:     3000 tokens (search results, post-rerank)
Recall Memory:   1000 tokens (conversation history)
Chat History:    remaining (dynamic)
Response Budget: 1024-4096 (model-dependent)
```
Each section trimmed BEFORE prompt assembly. No more unbounded growth.

---

## 3. Reflexion (Self-Improving Agent)

### 3.1 Trigger
- User gives thumbs-down feedback
- Quality scorer detects low faithfulness/relevancy

### 3.2 Process
1. Async LLM call: "Why was this answer wrong?"
2. Analysis stored in SQLite: topic, error type, correct info
3. On similar future queries, reflexion record added to context as warning

### 3.3 Quality Scoring (RAGAS-inspired)
Async after each response:
- Faithfulness: answer consistent with RAG context? (0-1)
- Relevancy: answer addresses the question? (0-1)
- Confidence: based on rerank scores and result count (0-1)

Low scores trigger reflexion pipeline automatically.

---

## 4. Lightweight Knowledge Graph

### 4.1 Schema
```sql
kg_entities (id, name, type, attributes_json, created_at)
  -- types: product, branch, issue_type, resolution, customer_segment

kg_edges (source_id, target_id, relation, weight, metadata_json, created_at)
  -- relations: has_device, has_issue, resolved_by, located_at
```

### 4.2 Auto-Construction
On ticket closure (async):
- LLM extracts entities and relationships from ticket summary
- Upserts into SQLite tables
- Entity embeddings stored in LanceDB

### 4.3 Query Integration
Query Analyzer sets `requiresGraph: true` for relational/aggregate questions.
Graph queries via SQL JOINs on entity/edge tables.

---

## 5. Code Consolidation

### 5.1 Merges
- `rag.js` + `knowledge.js` → `src/services/rag/searchEngine.js`
- `memory.js` + `conversationUtils.js` + `conversationSummarizer.js` → `src/services/memory/memoryEngine.js`
- `chatProcessor.js` + `webChatPipeline.js` → `src/services/pipeline/chatPipeline.js` + channel adapters

### 5.2 New Service Map
```
src/services/
  rag/
    searchEngine.js       — Unified hybrid search (LanceDB + FTS5 + RRF)
    reranker.js           — Cross-encoder reranking (Cohere + LLM fallback)
    contextualChunker.js  — Contextual retrieval at indexing time
    cragEvaluator.js      — Corrective RAG evaluation
    queryAnalyzer.js      — Complexity + intent + routing
  memory/
    memoryEngine.js       — Tiered memory orchestrator
    coreMemory.js         — Profile management (auto-extract)
    recallMemory.js       — FTS5 conversation search
    archivalMemory.js     — LanceDB semantic search
  intelligence/
    reflexion.js          — Self-improvement engine
    qualityScorer.js      — RAGAS-inspired metrics
    graphBuilder.js       — Auto KG construction
    graphQuery.js         — Graph querying
  pipeline/
    chatPipeline.js       — Core pipeline (channel-agnostic)
    webAdapter.js         — Web-specific (quick reply, CSAT, queue)
    telegramAdapter.js    — Telegram-specific
    whatsappAdapter.js    — WhatsApp-specific
```

---

## 6. Pipeline Flow (New)

```
User Message
  → queryAnalyzer.analyze()           [1 LLM call]
  → memoryEngine.loadCore(userId)     [SQLite read]
  → ROUTE:
      FAST → generate directly        [1 LLM call]
      STANDARD → searchEngine.search() → reranker.rerank() → generate
      DEEP → search → rerank → cragEvaluator → (retry?) → generate
  → qualityScorer.score()             [async, background]
  → memoryEngine.updateCore()         [async, background]
  → reflexion.check()                 [async, on low quality only]
  → graphBuilder.extract()            [async, on ticket close only]
```

---

## 7. Competitive Advantage

| Feature | Dify | Botpress | Flowise | Qragy (New) |
|---|---|---|---|---|
| Contextual Retrieval | No | No | No | **Native** |
| CRAG (Self-Correcting) | No | No | No | **Native** |
| Adaptive Query Routing | Partial | Partial | No | **Native (3 paths)** |
| MemGPT-style Memory | No | No | No | **3-tier** |
| Auto Memory Extraction | No | No | No | **Native** |
| Reflexion | No | No | No | **Native** |
| Knowledge Graph | External | No | No | **Embedded** |
| Cross-encoder Rerank | Yes | Partial | Yes | **Multi-fallback** |
| BM25 + Vector Hybrid | Yes | No | Yes | **FTS5 + LanceDB** |
| Quality Scoring | No | No | No | **RAGAS-inspired** |
| Zero runtime cost | N/A | N/A | N/A | **Contextual at index time** |
