// src/middleware/rateLimiter.js

function createRateLimiter({ maxRequests = 20, windowMs = 60000, maxEntries = 10000 } = {}) {
  const store = new Map();

  // Cleanup stale entries periodically (10s — fast enough to bound memory on Pi)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of store) {
      if (now - data.windowStart > windowMs) {
        store.delete(ip);
      }
    }
  }, 10000);

  // Don't prevent Node from exiting
  if (cleanupInterval.unref) cleanupInterval.unref();

  function evictOldest() {
    if (store.size <= maxEntries) return;
    // LRU-like: find and delete the entry with the oldest windowStart
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [ip, data] of store) {
      if (data.windowStart < oldestTime) {
        oldestTime = data.windowStart;
        oldestKey = ip;
      }
    }
    if (oldestKey) store.delete(oldestKey);
  }

  function check(ip) {
    const now = Date.now();
    const data = store.get(ip);

    if (!data || now - data.windowStart > windowMs) {
      store.set(ip, { count: 1, windowStart: now });
      evictOldest();
      return true;
    }

    data.count += 1;
    return data.count <= maxRequests;
  }

  function getRemaining(ip) {
    const data = store.get(ip);
    if (!data) return maxRequests;
    return Math.max(0, maxRequests - data.count);
  }

  return { check, getRemaining, store };
}

module.exports = { createRateLimiter };
