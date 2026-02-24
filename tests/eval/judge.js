"use strict";

/**
 * Eval Judge — Rule-based assertions for chatbot responses.
 *
 * Her assertion bir { pass, message } donduruyor.
 * LLM-as-judge ileride eklenebilir ama simdilik rule-based yeterli.
 */

const { normalizeForMatching } = require("../../src/utils/sanitizer.js");

/**
 * Tek bir turn'un expect kosullarini kontrol et.
 * @param {object} response - API'den gelen response
 * @param {object} expect - Beklenen kosullar
 * @param {string|null} previousReply - Onceki asistan yaniti (anti-repetition icin)
 * @returns {{ results: Array<{check: string, pass: boolean, message: string}>, passCount: number, failCount: number }}
 */
function judgeTurn(response, expect, previousReply) {
  const results = [];
  const reply = response.reply || "";
  const replyNorm = normalizeForMatching(reply);
  const ctx = response.conversationContext || {};
  const memory = response.memory || {};

  // shouldContainAny — en az biri gecmeli
  if (expect.shouldContainAny) {
    const found = expect.shouldContainAny.some(kw => replyNorm.includes(normalizeForMatching(kw)));
    results.push({
      check: `shouldContainAny: [${expect.shouldContainAny.join(", ")}]`,
      pass: found,
      message: found
        ? `Bulundu`
        : `Hicbiri bulunamadi. Reply: "${reply.slice(0, 120)}..."`
    });
  }

  // shouldNotContain — hicbiri olmamali
  if (expect.shouldNotContain) {
    const items = Array.isArray(expect.shouldNotContain) ? expect.shouldNotContain : [expect.shouldNotContain];
    for (const kw of items) {
      const found = replyNorm.includes(normalizeForMatching(kw));
      results.push({
        check: `shouldNotContain: "${kw}"`,
        pass: !found,
        message: found
          ? `BULUNDU (olmamasi gereken). Reply: "${reply.slice(0, 120)}..."`
          : `Temiz`
      });
    }
  }

  // shouldNotContainAny — hicbiri olmamali (array versiyon)
  if (expect.shouldNotContainAny) {
    for (const kw of expect.shouldNotContainAny) {
      const found = replyNorm.includes(normalizeForMatching(kw));
      results.push({
        check: `shouldNotContainAny: "${kw}"`,
        pass: !found,
        message: found
          ? `BULUNDU (olmamasi gereken). Reply: "${reply.slice(0, 120)}..."`
          : `Temiz`
      });
    }
  }

  // stateShouldBe
  if (expect.stateShouldBe) {
    const actual = ctx.conversationState || "";
    results.push({
      check: `stateShouldBe: "${expect.stateShouldBe}"`,
      pass: actual === expect.stateShouldBe,
      message: actual === expect.stateShouldBe ? "Dogru" : `Beklenen: ${expect.stateShouldBe}, Gercek: ${actual}`
    });
  }

  // topicShouldBe
  if (expect.topicShouldBe) {
    const actual = ctx.currentTopic || "";
    results.push({
      check: `topicShouldBe: "${expect.topicShouldBe}"`,
      pass: actual === expect.topicShouldBe,
      message: actual === expect.topicShouldBe ? "Dogru" : `Beklenen: ${expect.topicShouldBe}, Gercek: ${actual}`
    });
  }

  // handoffReady
  if (expect.handoffReady !== undefined) {
    const actual = Boolean(response.handoffReady);
    results.push({
      check: `handoffReady: ${expect.handoffReady}`,
      pass: actual === expect.handoffReady,
      message: actual === expect.handoffReady ? "Dogru" : `Beklenen: ${expect.handoffReady}, Gercek: ${actual}`
    });
  }

  // earlyEscalation
  if (expect.earlyEscalation !== undefined) {
    const actual = Boolean(ctx.earlyEscalation);
    results.push({
      check: `earlyEscalation: ${expect.earlyEscalation}`,
      pass: actual === expect.earlyEscalation,
      message: actual === expect.earlyEscalation ? "Dogru" : `Beklenen: ${expect.earlyEscalation}, Gercek: ${actual}`
    });
  }

  // branchCodeShouldBe
  if (expect.branchCodeShouldBe) {
    const actual = memory.branchCode || "";
    results.push({
      check: `branchCodeShouldBe: "${expect.branchCodeShouldBe}"`,
      pass: actual === expect.branchCodeShouldBe,
      message: actual === expect.branchCodeShouldBe ? "Dogru" : `Beklenen: ${expect.branchCodeShouldBe}, Gercek: ${actual}`
    });
  }

  // isFarewell — yanit bir vedalasmama mesaji mi
  if (expect.isFarewell) {
    const farewellPatterns = ["iyi gunler", "yardimci olabileceg", "baska bir konu", "rica ederiz", "iyi calismalar"];
    const isFarewell = farewellPatterns.some(p => replyNorm.includes(normalizeForMatching(p)));
    results.push({
      check: `isFarewell: true`,
      pass: isFarewell,
      message: isFarewell ? "Farewell tespit edildi" : `Farewell bulunamadi. Reply: "${reply.slice(0, 120)}..."`
    });
  }

  // shouldNotRepeatPrevious
  if (expect.shouldNotRepeatPrevious && previousReply) {
    const prevNorm = normalizeForMatching(previousReply);
    // Jaccard similarity — kelime bazinda benzerlik
    const prevWords = new Set(prevNorm.split(/\s+/).filter(w => w.length > 3));
    const currWords = new Set(replyNorm.split(/\s+/).filter(w => w.length > 3));
    if (prevWords.size > 0 && currWords.size > 0) {
      const intersection = [...prevWords].filter(w => currWords.has(w)).length;
      const union = new Set([...prevWords, ...currWords]).size;
      const similarity = intersection / union;
      const pass = similarity < 0.6; // %60'tan az benzerlik olmali
      results.push({
        check: `shouldNotRepeatPrevious (similarity < 0.6)`,
        pass,
        message: pass ? `Benzerlik: ${(similarity * 100).toFixed(0)}% — farkli cevap` : `Benzerlik: ${(similarity * 100).toFixed(0)}% — cok benzer!`
      });
    }
  }

  const passCount = results.filter(r => r.pass).length;
  const failCount = results.filter(r => !r.pass).length;

  return { results, passCount, failCount };
}

module.exports = { judgeTurn };
