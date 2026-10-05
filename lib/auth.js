"use strict";
// Office login: one shared password, signed session cookie.
const crypto = require("node:crypto");

const COOKIE = "tk_session";
const MAX_AGE_S = 7 * 24 * 3600;

function makeAuth({ password, secret }) {
  const enabled = Boolean(password && String(password).length >= 8);
  const pwHash = crypto.createHash("sha256").update(String(password || "")).digest();
  // Mixing in the password hash means changing the password logs everyone out.
  const key = (secret || crypto.randomBytes(32).toString("hex")) + pwHash.toString("hex");

  function checkPassword(pw) {
    if (!enabled) return false;
    const h = crypto.createHash("sha256").update(String(pw || "")).digest();
    return crypto.timingSafeEqual(h, pwHash);
  }

  function sign(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = crypto.createHmac("sha256", key).update(body).digest("base64url");
    return body + "." + sig;
  }

  function verify(token) {
    if (!enabled || !token || typeof token !== "string") return null;
    const dot = token.indexOf(".");
    if (dot < 1) return null;
    const body = token.slice(0, dot);
    const sig = Buffer.from(token.slice(dot + 1));
    const expected = Buffer.from(crypto.createHmac("sha256", key).update(body).digest("base64url"));
    if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      return p && p.exp > Date.now() ? p : null;
    } catch {
      return null;
    }
  }

  function issue() {
    return sign({ exp: Date.now() + MAX_AGE_S * 1000, n: crypto.randomBytes(8).toString("hex") });
  }

  function cookie(token, secure) {
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${secure ? "; Secure" : ""}`;
  }

  function clearCookie(secure) {
    return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
  }

  return { enabled, checkPassword, issue, verify, cookie, clearCookie, COOKIE };
}

module.exports = { makeAuth };
