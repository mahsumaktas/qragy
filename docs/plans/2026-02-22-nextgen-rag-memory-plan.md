# Next-Gen RAG & Memory System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Dify, Botpress, Flowise'i gecen Adaptive RAG pipeline, MemGPT-style tiered memory, Reflexion, ve Lightweight GraphRAG sistemi kur.

**Architecture:** Adaptive Pipeline — AI sorgu karmasikligini siniflandirir ve FAST/STANDARD/DEEP yollardan birine yonlendirir. Tiered memory (Core/Recall/Archival) ile kullanici profili otomatik cikarilir. Reflexion ile olumsuz feedback'lerden ogrenilir. Lightweight KG ticket kapanislarindan olusturulur.

**Tech Stack:** Node.js, SQLite (WAL) + FTS5, LanceDB, Cohere Rerank API, Vitest, CommonJS, factory pattern DI

**Baseline:** 339 test, 755 satir server.js, 0 ESLint hatasi

**Design Doc:** `docs/plans/2026-02-22-nextgen-rag-memory-design.md`

---

## Task 1: SQLite FTS5 + Yeni Tablolar

**Files:**
- Modify: `lib/db.js` (schema bolumu, satir 34-84 arasi)
- Modify: `tests/unit/db.test.js` (yeni testler ekle)

**Step 1: Write failing tests**

`tests/unit/db.test.js` dosyasina yeni describe blogu ekle:

```js
describe("FTS5 and new tables", () => {
  it("recall_memory table exists", () => {
    const row = sqliteDb.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='recall_memory'"
    ).get();
    expect(row).toBeDefined();
  });

  it("recall_memory_fts virtual table exists", () => {
    const row = sqliteDb.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='recall_memory_fts'"
    ).get();
    expect(row).toBeDefined();
  });

  it("kg_entities table exists", () => {
    const row = sqliteDb.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='kg_entities'"
    ).get();
    expect(row).toBeDefined();
  });

  it("kg_edges table exists", () => {
    const row = sqliteDb.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='kg_edges'"
    ).get();
    expect(row).toBeDefined();
  });

  it("reflexion_logs table exists", () => {
    const row = sqliteDb.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='reflexion_logs'"
    ).get();
    expect(row).toBeDefined();
  });

  it("quality_scores table exists", () => {
    const row = sqliteDb.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='quality_scores'"
    ).get();
    expect(row).toBeDefined();
  });

  it("FTS5 search works on recall_memory", () => {
    sqliteDb.db.prepare(
      "INSERT INTO recall_memory (id, userId, sessionId, type, content, createdAt) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("rm-1", "user1", "sess1", "summary", "Yazici sorunu yasaniyor", new Date().toISOString());
    sqliteDb.db.prepare(
      "INSERT INTO recall_memory_fts (rowid, content) VALUES ((SELECT rowid FROM recall_memory WHERE id='rm-1'), 'Yazici sorunu yasaniyor')"
    ).run();
    const results = sqliteDb.db.prepare(
      "SELECT rm.* FROM recall_memory rm JOIN recall_memory_fts fts ON rm.rowid = fts.rowid WHERE recall_memory_fts MATCH 'yazici'"
    ).all();
    expect(results.length).toBe(1);
    expect(results[0].content).toContain("Yazici");
  });
});
```

**Step 2: Run tests — verify fail**

`npx vitest run tests/unit/db.test.js` — FAIL (tables don't exist)

**Step 3: Implement new tables**

`lib/db.js` schema bolumune (user_memory tablosundan sonra, satir 83'ten sonra) 6 yeni tablo ekle:

- `recall_memory` (id TEXT PK, userId, sessionId, type, content, createdAt)
- `recall_memory_fts` (FTS5 virtual table, content column, tokenize='unicode61')
- `kg_entities` (id INTEGER PK AUTOINCREMENT, name, type, attributes TEXT DEFAULT '{}', createdAt, UNIQUE(name,type))
- `kg_edges` (sourceId, targetId, relation — composite PK, weight REAL, metadata TEXT, createdAt)
- `reflexion_logs` (id INTEGER PK AUTOINCREMENT, sessionId, topic, errorType, originalQuery, wrongAnswer, analysis, correctInfo, createdAt)
- `quality_scores` (id INTEGER PK AUTOINCREMENT, sessionId, messageId, faithfulness REAL, relevancy REAL, confidence REAL, ragResultCount INTEGER, avgRerankScore REAL, createdAt)

Ayrica helper fonksiyonlar ekle: `saveRecallMemory`, `searchRecallMemory`, `upsertEntity`, `insertEdge`, `getEntity`, `queryEdgesByEntity`, `saveReflexionLog`, `searchReflexionByTopic`, `saveQualityScore`.

Hepsini module.exports'a ekle.

**Step 4: Run tests — verify pass**

`npx vitest run tests/unit/db.test.js` — ALL PASS

**Step 5: Commit**

```bash
git add lib/db.js tests/unit/db.test.js
git commit -m "feat: add FTS5 recall_memory, kg, reflexion, quality_scores tables"
```

---

## Task 2: Unified Search Engine

**Files:**
- Create: `src/services/rag/searchEngine.js`
- Create: `tests/unit/searchEngine.test.js`

**Step 1: Write failing tests**

Test dosyasi olustur. 7 test:
1. `hybridSearch returns fused results from vector + text` — vector ve text sonuclarini RRF ile birlestir
2. `hybridSearch works with only text results when vector fails` — vector hata verse bile calismali
3. `hybridSearch returns empty for irrelevant query` — eslesmeyince bos dondur
4. `formatCitations formats results correctly` — index, title, source, snippet alanlari
5. `getAdaptiveTopK scales with KB size` — <50:3, <500:5, >=500:7
6. `phraseMatch detects bi-gram phrases` — ardisik kelime eslesmesi
7. `fullTextSearch scores exact match highest` — tam esleme 15 puan

**Step 2: Run tests — FAIL (module not found)**

**Step 3: Implement searchEngine.js**

Factory pattern: `createSearchEngine(deps)` — deps: `{ embedText, knowledgeTable, ragDistanceThreshold, logger }`

rag.js + knowledge.js'deki EN IYI implementasyonlari al:
- `fullTextSearch`: rag.js versiyonu (phraseMatch + normalizeForMatching + question+answer scoring)
- `reciprocalRankFusion`: Hash key'i `question+answer` ile birlestir (collision fix)
- `filterByRelevance`: rag.js versiyonu
- `getAdaptiveTopK`: rag.js versiyonu
- `hybridSearch`: knowledge.js'nin `searchKnowledge` + rag.js'nin `searchKnowledge` birlesmesi
- `formatCitations`: rag.js versiyonu

Dondu: `{ hybridSearch, fullTextSearch, reciprocalRankFusion, filterByRelevance, getAdaptiveTopK, phraseMatch, formatCitations }`

**Step 4: Run tests — ALL PASS**

**Step 5: Commit**

```bash
git add src/services/rag/searchEngine.js tests/unit/searchEngine.test.js
git commit -m "feat: unified search engine merging rag.js + knowledge.js"
```

---

## Task 3: Cross-Encoder Reranker

**Files:**
- Create: `src/services/rag/reranker.js`
- Create: `tests/unit/reranker.test.js`

**Step 1: Write failing tests**

5 test:
1. `rerank returns results sorted by relevance score` — LLM reranker JSON parse + sort
2. `rerank returns original results on LLM failure` — RRF fallback
3. `rerank handles empty results` — bos array donmeli
4. `rerank with Cohere API when key is set` — fetch mock ile Cohere API testi
5. `falls back to LLM reranker when Cohere fails` — Cohere 500 → LLM fallback

**Step 2: Run tests — FAIL**

**Step 3: Implement reranker.js**

Factory: `createReranker(deps)` — deps: `{ callLLM, getProviderConfig, logger, cohereApiKey }`

3 katmanli fallback stratejisi:
1. `rerankWithCohere(query, results)` — Cohere Rerank v3.5 API, 5s timeout
2. `rerankWithLLM(query, results)` — LLM'e JSON skor istegi
3. `rerankByRRF(results)` — mevcut rrfScore/textScore kullan

Ana fonksiyon: `rerank(query, results)` — sirayla dene, basarili olani don

**Step 4: Run tests — ALL PASS**

**Step 5: Commit**

```bash
git add src/services/rag/reranker.js tests/unit/reranker.test.js
git commit -m "feat: cross-encoder reranker with Cohere + LLM + RRF fallback"
```

---

## Task 4: Query Analyzer

**Files:**
- Create: `src/services/rag/queryAnalyzer.js`
- Create: `tests/unit/queryAnalyzer.test.js`

**Step 1: Write failing tests**

5 test:
1. `analyze returns structured analysis` — complexity, intent, route, standaloneQuery alanlari
2. `routes simple greetings to FAST` — simple + greeting = FAST
3. `routes complex queries to DEEP` — complex = DEEP, subQueries dolu
4. `falls back to STANDARD on LLM failure` — timeout durumunda medium/STANDARD
5. `extracts standalone query from chat history context` — "ayni seyi" referanslarini coz

**Step 2: Run tests — FAIL**

**Step 3: Implement queryAnalyzer.js**

Factory: `createQueryAnalyzer(deps)` — deps: `{ callLLM, getProviderConfig, logger }`

Tek LLM cagrisinda 3 is yapar:
1. Karmasiklik siniflandirmasi (simple/medium/complex)
2. Intent tespiti (greeting/faq/product_support/complaint/escalation/chitchat)
3. Standalone query cikarimi (questionExtractor.js'in isini absorbe eder)

Route map: simple+greeting→FAST, simple+chitchat→FAST, medium→STANDARD, complex→DEEP

Fallback: LLM hata verirse medium/STANDARD/orijinal mesaj

**Step 4: Run tests — ALL PASS**

**Step 5: Commit**

```bash
git add src/services/rag/queryAnalyzer.js tests/unit/queryAnalyzer.test.js
git commit -m "feat: query analyzer with complexity routing and standalone query extraction"
```

---

## Task 5: CRAG Evaluator

**Files:**
- Create: `src/services/rag/cragEvaluator.js`
- Create: `tests/unit/cragEvaluator.test.js`

**Step 1: Write failing tests**

4 test:
1. `evaluate classifies results as RELEVANT/PARTIAL/IRRELEVANT` — 3 gruba ayir
2. `suggestRewrite returns rewritten query` — alternatif sorgu don
3. `returns all as relevant on LLM failure` — fallback: hepsini relevant say
4. `handles empty results` — insufficient: true

**Step 2: Run tests — FAIL**

**Step 3: Implement cragEvaluator.js**

Factory: `createCragEvaluator(deps)` — deps: `{ callLLM, getProviderConfig, logger }`

- `evaluate(query, results)` — LLM her sonucu RELEVANT/PARTIAL/IRRELEVANT olarak siniflar
- `suggestRewrite(query)` — alternatif arama sorgusu uret
- `MAX_REWRITE_ATTEMPTS = 2` constant export

**Step 4: Run tests — ALL PASS**

**Step 5: Commit**

```bash
git add src/services/rag/cragEvaluator.js tests/unit/cragEvaluator.test.js
git commit -m "feat: CRAG evaluator with relevance classification and query rewrite"
```

---

## Task 6: Contextual Chunker

**Files:**
- Create: `src/services/rag/contextualChunker.js`
- Create: `tests/unit/contextualChunker.test.js`

**Step 1: Write failing tests**

3 test:
1. `enrichChunk prepends context to chunk text` — LLM baglam cumlesi + orijinal icerik
2. `enrichChunk falls back to original on LLM failure` — enriched: false
3. `enrichBatch processes multiple chunks` — batch isleme, concurrency=3

**Step 2: Run tests — FAIL**

**Step 3: Implement contextualChunker.js**

Factory: `createContextualChunker(deps)` — deps: `{ callLLM, getProviderConfig, logger }`

Anthropic yaklasimi — INDEKSLEME sirasinda (runtime degil):
- `enrichChunk(chunk, documentTitle)` — LLM'den 1-2 cumlede baglam al, chunk'in basina ekle
- `enrichBatch(chunks, documentTitle, concurrency)` — batch isleme

**Step 4: Run tests — ALL PASS**

**Step 5: Commit**

```bash
git add src/services/rag/contextualChunker.js tests/unit/contextualChunker.test.js
git commit -m "feat: contextual chunker for indexing-time retrieval enrichment"
```

---

## Task 7: Core Memory (Auto-Extract)

**Files:**
- Create: `src/services/memory/coreMemory.js`
- Create: `tests/unit/coreMemory.test.js`

**Step 1: Write failing tests**

6 test:
1. `load returns user profile from SQLite` — getUserMemory delegate
2. `load returns empty object for unknown user`
3. `save persists key-value to SQLite` — saveUserMemory delegate
4. `autoExtract extracts profile from chat history` — LLM JSON parse + save loop
5. `autoExtract handles LLM failure gracefully` — hata firlatmamali
6. `formatForPrompt returns formatted string within token budget` — 500 token limit

**Step 2: Run tests — FAIL**

**Step 3: Implement coreMemory.js**

Factory: `createCoreMemory(deps)` — deps: `{ sqliteDb, callLLM, getProviderConfig, logger }`

Mevcut userMemory.js'i evolve eder:
- `load(userId)` — SQLite'dan profil yukle
- `save(userId, key, value)` — kaydet
- `autoExtract(userId, chatHistory)` — LLM ile sohbetten profil bilgisi cikar (ad, sube, telefon, gecmis sorunlar)
- `formatForPrompt(userId, maxTokens=500)` — prompt icin formatla, token limiti icinde

CHARS_PER_TOKEN = 2.5 (Turkce icin daha dogru)

**Step 4: Run tests — ALL PASS**

**Step 5: Commit**

```bash
git add src/services/memory/coreMemory.js tests/unit/coreMemory.test.js
git commit -m "feat: core memory with auto-extraction from conversations"
```

---

## Task 8: Recall Memory (FTS5 Search)

**Files:**
- Create: `src/services/memory/recallMemory.js`
- Create: `tests/unit/recallMemory.test.js`

**Step 1: Write failing tests**

5 test:
1. `save stores conversation summary` — saveRecallMemory delegate
2. `search returns FTS5 results` — searchRecallMemory delegate
3. `search returns empty on no match`
4. `formatForPrompt returns formatted recall results` — "GECMIS KONUSMALAR" header
5. `formatForPrompt returns empty string when no results`

**Step 2: Run tests — FAIL**

**Step 3: Implement recallMemory.js**

Factory: `createRecallMemory(deps)` — deps: `{ sqliteDb, logger }`

- `save(userId, sessionId, content, type="summary")` — random ID ile kaydet
- `search(query, userId, limit=5)` — FTS5 ile ara
- `formatForPrompt(query, userId, maxTokens=1000)` — prompt icin formatla

**Step 4: Run tests — ALL PASS**

**Step 5: Commit**

```bash
git add src/services/memory/recallMemory.js tests/unit/recallMemory.test.js
git commit -m "feat: recall memory with FTS5 conversation search"
```

---

## Task 9: Memory Engine (Orchestrator)

**Files:**
- Create: `src/services/memory/memoryEngine.js`
- Create: `tests/unit/memoryEngine.test.js`

**Step 1: Write failing tests**

4 test:
1. `loadContext returns core + recall memory for prompt`
2. `loadContext skips recall when requiresMemory is false`
3. `updateAfterConversation calls autoExtract and saves recall`
4. `getCoreProfile returns user profile`

**Step 2: Run tests — FAIL**

**Step 3: Implement memoryEngine.js**

Factory: `createMemoryEngine(deps)` — deps: `{ coreMemory, recallMemory, logger }`

Token budgets: Core=500, Recall=1000

- `loadContext(userId, query, analysisResult)` — core memory her zaman, recall sadece requiresMemory ise
- `updateAfterConversation(userId, sessionId, chatHistory, summary)` — async: autoExtract + recall save
- `getCoreProfile(userId)` — core memory'den profil

**Step 4: Run tests — ALL PASS**

**Step 5: Commit**

```bash
git add src/services/memory/memoryEngine.js tests/unit/memoryEngine.test.js
git commit -m "feat: memory engine orchestrating core + recall tiers"
```

---

## Task 10: Quality Scorer

**Files:**
- Create: `src/services/intelligence/qualityScorer.js`
- Create: `tests/unit/qualityScorer.test.js`

**Step 1: Write failing tests**

4 test:
1. `score returns faithfulness, relevancy, confidence` — 3 metrik + isLowQuality=false
2. `isLowQuality true when scores below threshold` — ortalama < 0.5
3. `handles LLM failure gracefully` — null degerler, isLowQuality=false
4. `persists score to SQLite` — saveQualityScore cagirilmali

**Step 2: Run tests — FAIL**

**Step 3: Implement qualityScorer.js**

Factory: `createQualityScorer(deps)` — deps: `{ callLLM, getProviderConfig, sqliteDb, logger }`

RAGAS-inspired 3 metrik:
- `faithfulness` — cevap RAG baglamina sadik mi? (LLM degerlendirmesi)
- `relevancy` — cevap soruyu cevapliyor mu? (LLM degerlendirmesi)
- `confidence` — rerank skorlari ve sonuc sayisina dayali (hesaplama)

LOW_QUALITY_THRESHOLD = 0.5. Dusuk kalite reflexion pipeline'ini tetikler.

**Step 4: Run tests — ALL PASS**

**Step 5: Commit**

```bash
git add src/services/intelligence/qualityScorer.js tests/unit/qualityScorer.test.js
git commit -m "feat: RAGAS-inspired quality scorer"
```

---

## Task 11: Reflexion Engine

**Files:**
- Create: `src/services/intelligence/reflexion.js`
- Create: `tests/unit/reflexion.test.js`

**Step 1: Write failing tests**

4 test:
1. `analyze creates reflexion log from negative feedback` — LLM analiz + SQLite kayit
2. `getWarnings returns past reflexion for similar topic` — "GECMIS HATALAR" header
3. `getWarnings returns empty string when no past reflexion`
4. `analyze handles LLM failure gracefully`

**Step 2: Run tests — FAIL**

**Step 3: Implement reflexion.js**

Factory: `createReflexion(deps)` — deps: `{ callLLM, getProviderConfig, sqliteDb, logger }`

- `analyze({ sessionId, query, answer, ragResults })` — LLM'e "neden yanlis?" sor, sonucu kaydet
- `getWarnings(topic, limit=3)` — benzer konudaki gecmis hatalari getir, prompt'a eklenecek format

Tetikleyiciler: thumbs-down feedback veya qualityScorer.isLowQuality=true

**Step 4: Run tests — ALL PASS**

**Step 5: Commit**

```bash
git add src/services/intelligence/reflexion.js tests/unit/reflexion.test.js
git commit -m "feat: reflexion engine for self-improvement"
```

---

## Task 12: Knowledge Graph (Builder + Query)

**Files:**
- Create: `src/services/intelligence/graphBuilder.js`
- Create: `src/services/intelligence/graphQuery.js`
- Create: `tests/unit/graphBuilder.test.js`
- Create: `tests/unit/graphQuery.test.js`

**Step 1: Write failing tests**

graphBuilder 2 test:
1. `extractAndStore extracts entities and edges from ticket` — upsertEntity 3x, insertEdge 2x
2. `handles LLM failure gracefully`

graphQuery 3 test:
1. `query returns related entities` — queryEdgesByEntity delegate
2. `formatForPrompt returns formatted graph context` — "BILGI GRAFI" header
3. `returns empty for unknown entity`

**Step 2: Run tests — FAIL**

**Step 3: Implement both**

`graphBuilder.js` factory: `createGraphBuilder(deps)` — deps: `{ callLLM, getProviderConfig, sqliteDb, logger }`
- `extractAndStore(ticket)` — LLM ile entity+relationship cikar, SQLite'a kaydet
- Tetikleyici: ticket kapandiginda async

`graphQuery.js` factory: `createGraphQuery(deps)` — deps: `{ sqliteDb, logger }`
- `query(entityName, limit=10)` — SQL JOIN ile iliskili entity'leri bul
- `formatForPrompt(entityName, maxTokens=500)` — prompt icin "entity --[relation]--> entity" formati

**Step 4: Run tests — ALL PASS**

**Step 5: Commit**

```bash
git add src/services/intelligence/graphBuilder.js src/services/intelligence/graphQuery.js tests/unit/graphBuilder.test.js tests/unit/graphQuery.test.js
git commit -m "feat: lightweight knowledge graph builder and query"
```

---

## Task 13: Token Budget Enforcement in promptBuilder

**Files:**
- Modify: `src/services/promptBuilder.js`
- Modify: `src/services/memory.js` (CHARS_PER_TOKEN fix)
- Modify: `tests/unit/promptBuilder.test.js`

**Step 1: Write failing tests**

5 yeni test:
1. `trims RAG context to budget` — 50 buyuk sonuc gonderince RAG section budanmali
2. `includes core memory section when provided` — options.coreMemoryText
3. `includes recall memory section when provided` — options.recallMemoryText
4. `includes reflexion warnings when provided` — options.reflexionWarnings
5. `includes graph context when provided` — options.graphContext

**Step 2: Run tests — FAIL**

**Step 3: Implement changes**

`memory.js` satir 7: `CHARS_PER_TOKEN = 3` degistir → `CHARS_PER_TOKEN = 2.5`

`promptBuilder.js` buildSystemPrompt'a eklemeler:
1. `options.coreMemoryText` varsa parts'a ekle (mevcut userMemory bolumunu REPLACE eder)
2. `options.recallMemoryText` varsa parts'a ekle
3. `options.reflexionWarnings` varsa parts'a ekle
4. `options.graphContext` varsa parts'a ekle
5. RAG sonuclarini eklerken `trimToTokenBudget(ragSection, TOKEN_BUDGETS.ragContext)` uygula

Import: `const { trimToTokenBudget, TOKEN_BUDGETS } = require("./memory.js");`

**Step 4: Run tests — ALL PASS**

**Step 5: Commit**

```bash
git add src/services/promptBuilder.js src/services/memory.js tests/unit/promptBuilder.test.js
git commit -m "feat: token budget enforcement + memory/reflexion/graph in prompt"
```

---

## Task 14: Adaptive Chat Pipeline

**Files:**
- Create: `src/services/pipeline/chatPipeline.js`
- Create: `tests/unit/chatPipeline.test.js`

**Step 1: Write failing tests**

7 test:
1. `FAST route: skips retrieval for simple greetings` — searchEngine.hybridSearch CAGIRILMAMALI
2. `STANDARD route: search + rerank + generate` — hybridSearch + rerank cagirilmali
3. `DEEP route: search + rerank + CRAG evaluate` — cragEvaluator.evaluate cagirilmali
4. `DEEP route retries on insufficient results` — suggestRewrite + 2. arama
5. `triggers async quality scoring` — qualityScorer.score cagirilmali
6. `includes memory context when requiresMemory` — memoryEngine.loadContext({requiresMemory:true})
7. `returns citations with response` — citations array dolmali

**Step 2: Run tests — FAIL**

**Step 3: Implement chatPipeline.js**

Factory: `createChatPipeline(deps)` — tum servisler DI ile inject

Pipeline akim:
```
userMessage
  -> queryAnalyzer.analyze() [1 LLM call]
  -> memoryEngine.loadContext(userId)
  -> ROUTE:
      FAST -> callLLM directly [1 LLM call]
      STANDARD -> hybridSearch -> reranker.rerank -> callLLM
      DEEP -> hybridSearch -> rerank -> cragEvaluator -> (retry?) -> callLLM
  -> async: qualityScorer.score()
  -> async: memoryEngine.updateAfterConversation()
```

Return: `{ reply, route, analysis, citations, ragResults, finishReason }`

**Step 4: Run tests — ALL PASS**

**Step 5: Commit**

```bash
git add src/services/pipeline/chatPipeline.js tests/unit/chatPipeline.test.js
git commit -m "feat: adaptive chat pipeline with FAST/STANDARD/DEEP routing"
```

---

## Task 15: Server.js Rewiring

**Files:**
- Modify: `server.js`

**Step 1: Import yeni servisler**

server.js'in require bolumune 12 yeni import ekle (searchEngine, reranker, queryAnalyzer, cragEvaluator, coreMemory, recallMemory, memoryEngine, qualityScorer, reflexion, graphBuilder, graphQuery, chatPipeline).

**Step 2: Servis instance'larini olustur**

Mevcut servis olusturma bolumunden sonra (searchKnowledge'dan sonra), yeni servis instance'larini olustur. Factory pattern ile hepsini bagla.

Feature flag: `const USE_ADAPTIVE_PIPELINE = process.env.USE_ADAPTIVE_PIPELINE === "true";`

Mevcut chatProcessor/webChatPipeline'in yanina alternatif olarak yeni pipeline'i ekle. Boylece mevcut sistem bozulmaz, yeni sistem flag ile aktive edilir.

**Step 3: Run full test suite**

`npx vitest run` — 339+ test PASS
`npx eslint . --max-warnings 5` — temiz

**Step 4: Commit**

```bash
git add server.js
git commit -m "feat: wire adaptive pipeline services into server.js"
```

---

## Task 16: Integration Test + Final Validation

**Files:**
- Create: `tests/integration/adaptivePipeline.test.js`

**Step 1: Write integration test**

3 test:
1. `FAST route responds without search for greeting` — full pipeline mock ile
2. `STANDARD route searches and reranks` — searchEngine + reranker mock
3. `DEEP route retries with CRAG on insufficient results` — cragEvaluator retry akimi

**Step 2: Run all tests + lint**

```bash
npx vitest run              # Tum testler
npx eslint . --max-warnings 5  # Lint
```

**Step 3: Commit**

```bash
git add tests/integration/adaptivePipeline.test.js
git commit -m "test: adaptive pipeline integration tests"
```

---

## Final Validation Checklist

```bash
npx vitest run              # ~400+ test, hepsi pass
npx eslint . --max-warnings 5  # 0 hata
wc -l server.js             # < 850 satir hedefi
```

## Yeni Dosya Haritasi

```
src/services/
  rag/
    searchEngine.js       <- Task 2 (rag.js + knowledge.js birlesmesi)
    reranker.js           <- Task 3 (Cohere + LLM + RRF fallback)
    queryAnalyzer.js      <- Task 4 (karmasiklik + intent + routing)
    cragEvaluator.js      <- Task 5 (CRAG duzeltici degerlendirme)
    contextualChunker.js  <- Task 6 (indeksleme-zamani zenginlestirme)
  memory/
    coreMemory.js         <- Task 7 (profil yonetimi + auto-extract)
    recallMemory.js       <- Task 8 (FTS5 sohbet arama)
    memoryEngine.js       <- Task 9 (orkestrator)
  intelligence/
    qualityScorer.js      <- Task 10 (RAGAS-inspired metrikler)
    reflexion.js          <- Task 11 (kendini iyilestirme)
    graphBuilder.js       <- Task 12 (KG otomatik olusturma)
    graphQuery.js         <- Task 12 (KG sorgulama)
  pipeline/
    chatPipeline.js       <- Task 14 (uyarlanabilir pipeline)
```

## Rekabet Avantaji

Tamamlandiginda Qragy'nin sunacagi, HIC BIR rakibin natively sunmadigi ozellikler:
- Contextual Retrieval (indeksleme zamani, 0 runtime maliyeti)
- CRAG (kendi kendini duzelten arama)
- Adaptive 3-yol routing (FAST/STANDARD/DEEP)
- MemGPT-style 3 katmanli hafiza (Core/Recall/Archival)
- Otomatik profil cikarimi
- Reflexion (olumsuz feedback'ten ogrenme)
- Embedded Knowledge Graph (SQLite)
- RAGAS-inspired kalite puanlama
- 3-katmanli reranking (Cohere + LLM + RRF)
