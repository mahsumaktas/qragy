"use strict";

const express = require("express");

function mount(app, deps) {
  const {
    isSetupComplete,
    markSetupComplete,
    saveSiteConfig,
    saveChatFlowConfig,
    loadTemplate,
  } = deps;

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
