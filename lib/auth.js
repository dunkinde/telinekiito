"use strict";
// Logins. The head of company's master password (OFFICE_PASSWORD) always works and acts as the owner.
// Staff log in with their phone number and a PIN. Sessions are signed cookies: { sid, ver, exp }.
// A staff member's `ver` goes up when their PIN changes or they are switched off, which ends their sessions.
const crypto = require("node:crypto");

const COOKIE = "tk_session";
const BIZ_COOKIE = "tk_biz"; // business customer portal (/business), separate from staff logins
const MAX_AGE_S = 30 * 24 * 3600; // crews stay logged in on their phones for a month
const MASTER_ID = "owner";

function makeAuth({ password, secret }) {
  const enabled = Boolean(password && String(password).length >= 8);
  const pwHash = crypto.createHash("sha256").update(String(password || "")).digest();
  // Mixing in the password hash means changing the master password logs everyone out.
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

  /** Session for a staff member (or the master owner, sid = "owner"). */
  function issue(sid = MASTER_ID, ver = 0) {
    return sign({ sid, ver, exp: Date.now() + MAX_AGE_S * 1000, n: crypto.randomBytes(6).toString("hex") });
  }

  function cookie(token, secure, name = COOKIE) {
    return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${secure ? "; Secure" : ""}`;
  }

  function clearCookie(secure, name = COOKIE) {
    return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
  }

  return { enabled, checkPassword, issue, verify, cookie, clearCookie, COOKIE, BIZ_COOKIE, MASTER_ID };
}

/* ---------- PINs ---------- */
function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pin), salt, 32);
  return `${salt.toString("base64url")}.${hash.toString("base64url")}`;
}

function checkPin(pin, stored) {
  if (!stored || typeof stored !== "string" || !stored.includes(".")) return false;
  const [s, h] = stored.split(".");
  const expected = Buffer.from(h, "base64url");
  const got = crypto.scryptSync(String(pin || ""), Buffer.from(s, "base64url"), expected.length);
  return crypto.timingSafeEqual(got, expected);
}

const validPin = (pin) => /^\d{4,8}$/.test(String(pin || ""));

module.exports = { makeAuth, hashPin, checkPin, validPin, MASTER_ID };
