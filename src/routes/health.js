"use strict";

function mount(app, deps) {
  const { getHealthSnapshot } = deps;

  app.get("/api/health", (_req, res) => {
    res.json(getHealthSnapshot());
  });
}

module.exports = { mount };
