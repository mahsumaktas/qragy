"use strict";

const express = require("express");

function mount(app, deps) {
  const {
    isSetupComplete,
    markSetupComplete,
    saveSiteConfig,
    saveChatFlowConfig,
    loadTemplate,
    fs: fsModule,
    agentDir,
    loadCSVData,
    saveCSVData,
    reingestKnowledgeBase,
    logger: log,
  } = deps;

  const jobQueue = deps.jobQueue || null;

  app.get("/api/setup/status", (_req, res) => {
    res.json({ setupComplete: isSetupComplete() });
  });

  app.post("/api/setup/complete", express.json(), (req, res) => {
    const body = req.body;

    // Validate required fields
    if (!body || !body.companyName || typeof body.companyName !== "string" || !body.companyName.trim()) {
      return res.status(400).json({ error: "companyName zorunludur." });
    }

    const companyName = body.companyName.trim();
    const sector = (body.sector || "diger").trim();

    // Update site config
    const siteUpdates = {
      heroTitle: companyName + " Destek",
      headerTitle: companyName + " Destek",
    };
    if (body.logoUrl && typeof body.logoUrl === "string") {
      siteUpdates.logoUrl = body.logoUrl.trim();
    }
    if (body.primaryColor && typeof body.primaryColor === "string") {
      siteUpdates.primaryColor = body.primaryColor.trim();
    }
    if (body.themeColor && typeof body.themeColor === "string") {
      siteUpdates.themeColor = body.themeColor.trim();
    }
    saveSiteConfig(siteUpdates);

    // Update chatFlow config with welcome message
    saveChatFlowConfig({
      welcomeMessage: `Merhaba, ${companyName} Destek hattina hos geldiniz. Size nasil yardimci olabilirim?`,
    });

    // Load sector template if available
    const sectorTemplate = typeof loadTemplate === "function" ? loadTemplate(sector) : null;

    // Apply template: write persona.md and sampleQA to CSV
    if (sectorTemplate && fsModule && agentDir) {
      try {
        // Write persona.md
        if (sectorTemplate.persona) {
          const personaPath = require("path").join(agentDir, "persona.md");
          const personaContent = `# ${companyName} Bot Kisiligi\n\n${sectorTemplate.persona}\n`;
          fsModule.writeFileSync(personaPath, personaContent, "utf8");
        }

        // Add sampleQA to CSV knowledge base
        if (Array.isArray(sectorTemplate.sampleQA) && sectorTemplate.sampleQA.length > 0 && loadCSVData && saveCSVData) {
          const csvData = loadCSVData();
          for (const qa of sectorTemplate.sampleQA) {
            if (qa.q && qa.a) {
              const exists = csvData.some(row =>
                (row.question || row.soru || "").trim().toLowerCase() === qa.q.trim().toLowerCase()
              );
              if (!exists) {
                csvData.push({ question: qa.q, answer: qa.a });
              }
            }
          }
          saveCSVData(csvData);

          // Reingest knowledge base to include new QA pairs
          if (jobQueue) {
            jobQueue.add("kb-reingest", {}, { priority: -1, maxAttempts: 3 });
          } else if (reingestKnowledgeBase) {
            Promise.resolve().then(() => reingestKnowledgeBase())
              .catch(err => { if (log) log.warn("setup", "reingest hatasi", err); });
          }
        }
      } catch (err) {
        if (log) log.warn("setup", "Template uygulama hatasi", err);
      }
    }

    // Mark setup complete
    markSetupComplete({
      companyName,
      sector,
      faqs: Array.isArray(body.faqs) ? body.faqs : [],
      sectorTemplate: sectorTemplate || null,
    });

    res.json({ ok: true });
  });
}

module.exports = { mount };
