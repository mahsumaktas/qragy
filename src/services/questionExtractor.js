"use strict";

/**
 * Question Extractor Service
 *
 * Extracts a standalone question from chat history + latest message.
 * Resolves references like "ayni seyi baska sube icin soyle" into
 * a complete, context-independent question.
 */

const EXTRACTION_PROMPT = `Sen bir soru cikarma asistanisin. Kullanicinin sohbet gecmisini ve son mesajini aliyorsun.
Gorevion: Son mesaji, sohbet gecmisindeki baglami kullanarak bagimsiz bir soruya donustur.

Kurallar:
- Zamireri ve referanslari coz ("o", "bu", "ayni sey", "orasi" gibi)
- Sadece cikarilan soruyu dondur, baska bir sey yazma
- Eger son mesaj zaten bagimsiz bir soruysa, aynen dondur
- Turkce yaz`;

function createQuestionExtractor(deps) {
  const { callLLM, getProviderConfig, logger } = deps;

  async function extractQuestion(chatHistory, latestMessage) {
    if (!chatHistory || chatHistory.length === 0) {
      return latestMessage;
    }

    // Build context from recent history (last 6 messages max)
    const recentHistory = chatHistory.slice(-6);
    const historyText = recentHistory
      .map(m => `${m.role === "user" ? "Kullanici" : "Bot"}: ${m.content}`)
      .join("\n");

    const prompt = `${EXTRACTION_PROMPT}\n\nSohbet Gecmisi:\n${historyText}\n\nSon Mesaj: ${latestMessage}\n\nBagimsiz Soru:`;

    try {
      const providerConfig = getProviderConfig();
      const messages = [{ role: "user", parts: [{ text: prompt }] }];
      const result = await callLLM(messages, "", 256, providerConfig);

      const extracted = (result.reply || "").trim();
      if (!extracted || extracted.length > latestMessage.length * 3) {
        logger.info("questionExtractor", "Sanity check basarisiz, orijinal kullaniliyor", {
          originalLen: latestMessage.length,
          extractedLen: extracted ? extracted.length : 0,
        });
        return latestMessage;
      }

      logger.info("questionExtractor", "Soru cikarildi", {
        original: latestMessage.slice(0, 80),
        extracted: extracted.slice(0, 80),
        changed: extracted !== latestMessage,
      });

      return extracted;
    } catch (err) {
      logger.warn("questionExtractor", "Extraction failed, using original", err);
      return latestMessage;
    }
  }

  return { extractQuestion };
}

module.exports = { createQuestionExtractor };
