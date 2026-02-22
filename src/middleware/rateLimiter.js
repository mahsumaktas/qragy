// src/middleware/rateLimiter.js

function createRateLimiter({ maxRequests = 20, windowMs = 60000, maxEntries = 10000 } = {}) {
  const store = new Map();

  // Cleanup stale entries periodically
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of store) {
      if (now - data.windowStart > windowMs) {
        store.delete(ip);
      }
    }
  }, windowMs);

  // Don't prevent Node from exiting
  if (cleanupInterval.unref) cleanupInterval.unref();

  function evictOldest() {
    if (store.size <= maxEntries) return;
    // Delete oldest entry (first inserted in Map iteration order)
    const firstKey = store.keys().next().value;
    store.delete(firstKey);
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
