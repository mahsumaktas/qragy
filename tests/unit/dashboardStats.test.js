import { describe, it, expect, beforeEach } from "vitest";
const { mount } = require("../../src/routes/admin/analytics.js");

describe("Dashboard Stats API", () => {
  let routes;
  let mockAnalyticsData;

  function createMockApp() {
    const registered = {};
    return {
      get(path, ...handlers) {
        registered[path] = handlers[handlers.length - 1]; // last handler is the route
      },
      _routes: registered
    };
  }

  function createMockRes() {
    return {
      _status: 200,
      _json: null,
      status(code) { this._status = code; return this; },
      json(data) { this._json = data; return this; },
      setHeader() { return this; },
      send() { return this; }
    };
  }

  const noopMiddleware = (_req, _res, next) => { if (next) next(); };

  beforeEach(() => {
    mockAnalyticsData = { daily: {} };
    const app = createMockApp();
    mount(app, {
      requireAdminAccess: noopMiddleware,
      flushAnalyticsBuffer: () => {},
      getAnalyticsData: () => mockAnalyticsData,
      safeError: (err) => err.message || "error",
      Papa: { unparse: () => "" }
    });
    routes = app._routes;
  });

  it("dashboard-stats returns correct today stats", () => {
    const today = new Date().toISOString().slice(0, 10);
    mockAnalyticsData.daily[today] = {
      totalChats: 15,
      escalationCount: 3,
      csatSum: 20,
      csatCount: 5,
      totalResponseMs: 5000,
      responseCount: 10,
      topicCounts: { "bilet-sorunu": 8, "iade-talebi": 5, "genel-soru": 2 }
    };

    const res = createMockRes();
    routes["/api/admin/dashboard-stats"]({ query: {} }, res);

    expect(res._json.ok).toBe(true);
    expect(res._json.today.chats).toBe(15);
    expect(res._json.today.escalations).toBe(3);
    expect(res._json.today.csatAvg).toBe(4);
    expect(res._json.today.avgResponseMs).toBe(500);
    expect(res._json.today.resolutionRate).toBe(80);
    expect(res._json.today.topTopics).toHaveLength(3);
    expect(res._json.today.topTopics[0].topicId).toBe("bilet-sorunu");
    expect(res._json.today.topTopics[0].count).toBe(8);
  });

  it("dashboard-stats calculates trends correctly", () => {
    const now = new Date();

    // This week (Monday-based) — matching the endpoint logic
    const dayOfWeek = now.getDay() || 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek + 1);
    const _weekStartKey = weekStart.toISOString().slice(0, 10);

    // Previous week boundaries (matching endpoint: prevWeekStartKey to weekStartKey)
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    // A day only in previous week (between prevWeekStartKey and weekStartKey exclusive)
    const prevOnlyDay = new Date(prevWeekStart);
    prevOnlyDay.setDate(prevOnlyDay.getDate() + 2);
    const prevOnlyDayKey = prevOnlyDay.toISOString().slice(0, 10);

    // A day only in current week (after weekStartKey)
    const currOnlyDay = new Date(weekStart);
    currOnlyDay.setDate(currOnlyDay.getDate() + 1);
    const currOnlyDayKey = currOnlyDay.toISOString().slice(0, 10);

    // Only use dates that don't overlap between the two periods
    mockAnalyticsData.daily[currOnlyDayKey] = {
      totalChats: 50,
      escalationCount: 5,
      csatSum: 20,
      csatCount: 5,
      totalResponseMs: 2000,
      responseCount: 10,
      topicCounts: {}
    };

    mockAnalyticsData.daily[prevOnlyDayKey] = {
      totalChats: 25,
      escalationCount: 5,
      csatSum: 15,
      csatCount: 5,
      totalResponseMs: 1500,
      responseCount: 5,
      topicCounts: {}
    };

    const res = createMockRes();
    routes["/api/admin/dashboard-stats"]({ query: {} }, res);

    expect(res._json.ok).toBe(true);
    // This week includes currOnlyDayKey (50 chats), prev week includes prevOnlyDayKey (25 chats)
    // trend = ((50-25)/25)*100 = 100%
    expect(res._json.trends.weeklyChats).toBe(100);
    // This week CSAT: 20/5 = 4.0, prev week CSAT: 15/5 = 3.0
    // trend = ((4-3)/3)*100 = 33%
    expect(res._json.trends.weeklyCsat).toBe(33);
  });

  it("dashboard-stats handles empty analytics data", () => {
    mockAnalyticsData = { daily: {} };

    const res = createMockRes();
    routes["/api/admin/dashboard-stats"]({ query: {} }, res);

    expect(res._json.ok).toBe(true);
    expect(res._json.today.chats).toBe(0);
    expect(res._json.today.escalations).toBe(0);
    expect(res._json.today.csatAvg).toBeNull();
    expect(res._json.today.avgResponseMs).toBeNull();
    expect(res._json.today.resolutionRate).toBeNull();
    expect(res._json.today.topTopics).toEqual([]);
    expect(res._json.thisWeek.chats).toBe(0);
    expect(res._json.thisMonth.chats).toBe(0);
    expect(res._json.trends.weeklyChats).toBe(0);
    expect(res._json.trends.monthlyChats).toBe(0);
    expect(res._json.trends.weeklyCsat).toBe(0);
  });

  it("dashboard-stats requires admin auth", () => {
    // Mount with auth middleware that blocks access
    const app = createMockApp();
    const blockingAuth = (req, res) => {
      res.status(401).json({ error: "Unauthorized" });
    };
    mount(app, {
      requireAdminAccess: blockingAuth,
      flushAnalyticsBuffer: () => {},
      getAnalyticsData: () => ({ daily: {} }),
      safeError: (err) => err.message || "error",
      Papa: { unparse: () => "" }
    });

    // The route's first handler (auth middleware) is the one that blocks
    const handlers = [];
    const authApp = {
      get(path, ...args) { handlers.push({ path, args }); },
    };
    mount(authApp, {
      requireAdminAccess: blockingAuth,
      flushAnalyticsBuffer: () => {},
      getAnalyticsData: () => ({ daily: {} }),
      safeError: (err) => err.message || "error",
      Papa: { unparse: () => "" }
    });

    // Find dashboard-stats route registration
    const dashRoute = handlers.find(h => h.path === "/api/admin/dashboard-stats");
    expect(dashRoute).toBeDefined();
    // Second argument (index 0) should be the auth middleware
    expect(dashRoute.args[0]).toBe(blockingAuth);

    // Verify auth blocks: call the middleware
    const res = createMockRes();
    dashRoute.args[0]({}, res);
    expect(res._status).toBe(401);
    expect(res._json.error).toBe("Unauthorized");
  });
});
