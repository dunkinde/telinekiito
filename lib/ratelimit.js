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

  const recent = (key, windowMs) => {
    let arr = hits.get(key);
    if (!arr) {
      arr = [];
      hits.set(key, arr);
    }
    while (arr.length && arr[0] <= Date.now() - windowMs) arr.shift();
    return arr;
  };
  function allow(key, max, windowMs) {
    const arr = recent(key, windowMs);
    if (arr.length >= max) return false;
    arr.push(Date.now());
    return true;
  }
  // For counting only some requests (e.g. failed logins): full() checks without counting, add() counts one.
  allow.full = (key, max, windowMs) => recent(key, windowMs).length >= max;
  allow.add = (key) => recent(key, Infinity).push(Date.now());
  return allow;
}

module.exports = { makeLimiter };
