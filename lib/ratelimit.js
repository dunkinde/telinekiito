"use strict";
// Simple in-memory sliding-window limiter: allow(key, max, windowMs) -> boolean.
function makeLimiter() {
  const hits = new Map();
  const DAY = 24 * 3600 * 1000;
  const sweep = setInterval(() => {
    const cutoff = Date.now() - DAY;
    for (const [k, arr] of hits) {
      while (arr.length && arr[0] < cutoff) arr.shift();
      if (!arr.length) hits.delete(k);
    }
  }, 10 * 60 * 1000);
  sweep.unref();

  return function allow(key, max, windowMs) {
    const now = Date.now();
    let arr = hits.get(key);
    if (!arr) {
      arr = [];
      hits.set(key, arr);
    }
    while (arr.length && arr[0] <= now - windowMs) arr.shift();
    if (arr.length >= max) return false;
    arr.push(now);
    return true;
  };
}

module.exports = { makeLimiter };
