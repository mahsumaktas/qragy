"use strict";

/**
 * Admin Routes Hub
 *
 * Delegates to domain-specific sub-route modules.
 * Each sub-module receives the same deps object and registers its routes on app.
 */

const systemRoutes = require("./system");
const ticketRoutes = require("./tickets");
const knowledgeRoutes = require("./knowledge");
const agentRoutes = require("./agent");
const configRoutes = require("./config");
const analyticsRoutes = require("./analytics");
const webhookRoutes = require("./webhooks");
const insightRoutes = require("./insights");
const assistantRoutes = require("./assistant");
const evalRoutes = require("./eval");
const jobRoutes = require("./jobs");

function mount(app, deps) {
  // System routes return audit helpers that other sub-routes need
  const { recordAuditEvent } = systemRoutes.mount(app, deps);

  // Inject recordAuditEvent into deps for sub-routes that need it
  const depsWithAudit = { ...deps, recordAuditEvent };

  ticketRoutes.mount(app, depsWithAudit);
  knowledgeRoutes.mount(app, depsWithAudit);
  agentRoutes.mount(app, depsWithAudit);
  configRoutes.mount(app, depsWithAudit);
  analyticsRoutes.mount(app, depsWithAudit);
  webhookRoutes.mount(app, depsWithAudit);
  insightRoutes.mount(app, depsWithAudit);
  assistantRoutes.mount(app, depsWithAudit);
  evalRoutes.mount(app, depsWithAudit);
  jobRoutes.mount(app, depsWithAudit);
}

module.exports = { mount };
