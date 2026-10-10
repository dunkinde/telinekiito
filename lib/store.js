"use strict";
// SQLite storage using Node's built-in node:sqlite (no npm packages needed).
// Orders have their own table; everything else the platform keeps (staff, crews, change requests, messages,
// invoices, reviews, accounts, activity log …) lives in one "records" table as JSON, by kind.
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function open(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "telinekiito.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS orders (
      ref TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      ref TEXT,
      status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS records_kind ON records (kind, created_at);
    CREATE INDEX IF NOT EXISTS records_kind_ref ON records (kind, ref);
    CREATE INDEX IF NOT EXISTS records_kind_status ON records (kind, status);
    -- Anonymous website events, counted once per visit and day (lib/events.js). No ids, IPs or personal data.
    CREATE TABLE IF NOT EXISTS event_daily (
      day TEXT NOT NULL,
      event TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      campaign TEXT NOT NULL DEFAULT '',
      referrer TEXT NOT NULL DEFAULT '',
      landing TEXT NOT NULL DEFAULT '',
      zone TEXT NOT NULL DEFAULT '',
      job TEXT NOT NULL DEFAULT '',
      weather TEXT NOT NULL DEFAULT '',
      n INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, event, source, campaign, referrer, landing, zone, job, weather)
    ) WITHOUT ROWID;
  `);
  const q = {
    get: db.prepare("SELECT data FROM orders WHERE ref = ?"),
    insert: db.prepare("INSERT INTO orders (ref, created_at, updated_at, status, data) VALUES (?, ?, ?, ?, ?)"),
    update: db.prepare("UPDATE orders SET updated_at = ?, status = ?, data = ? WHERE ref = ?"),
    del: db.prepare("DELETE FROM orders WHERE ref = ?"),
    list: db.prepare("SELECT data FROM orders ORDER BY created_at DESC LIMIT ?"),
    count: db.prepare("SELECT COUNT(*) AS n FROM orders"),
    getSetting: db.prepare("SELECT value FROM settings WHERE key = ?"),
    setSetting: db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ),
    insertLead: db.prepare("INSERT INTO leads (created_at, data) VALUES (?, ?)"),
    listLeads: db.prepare("SELECT id, created_at, data FROM leads ORDER BY id DESC LIMIT ?"),
    deleteLead: db.prepare("DELETE FROM leads WHERE id = ?"),
    recGet: db.prepare("SELECT data FROM records WHERE kind = ? AND id = ?"),
    recPut: db.prepare(
      `INSERT INTO records (id, kind, ref, status, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET ref = excluded.ref, status = excluded.status, updated_at = excluded.updated_at, data = excluded.data`
    ),
    recDel: db.prepare("DELETE FROM records WHERE kind = ? AND id = ?"),
    recList: db.prepare("SELECT data FROM records WHERE kind = ? ORDER BY created_at DESC LIMIT ?"),
    recListRef: db.prepare("SELECT data FROM records WHERE kind = ? AND ref = ? ORDER BY created_at DESC LIMIT ?"),
    recListStatus: db.prepare("SELECT data FROM records WHERE kind = ? AND status = ? ORDER BY created_at DESC LIMIT ?"),
    recCountStatus: db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = ? AND status = ?"),
    evCount: db.prepare(
      `INSERT INTO event_daily (day, event, source, campaign, referrer, landing, zone, job, weather, n) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT DO UPDATE SET n = n + 1`
    ),
    evRows: db.prepare("SELECT day, event, source, campaign, referrer, landing, zone, job, weather, n FROM event_daily WHERE day >= ? AND day <= ?")
  };
  const parse = (r) => JSON.parse(r.data);

  const store = {
    getOrder(ref) {
      const r = q.get.get(ref);
      return r ? JSON.parse(r.data) : null;
    },
    insertOrder(o) {
      q.insert.run(o.ref, o.createdAt, o.updatedAt, o.status, JSON.stringify(o));
    },
    saveOrder(o) {
      q.update.run(o.updatedAt, o.status, JSON.stringify(o), o.ref);
    },
    deleteOrder(ref) {
      return q.del.run(ref).changes > 0;
    },
    listOrders(limit = 2000) {
      return q.list.all(limit).map(parse);
    },
    countOrders() {
      return Number(q.count.get().n);
    },
    getSetting(key) {
      const r = q.getSetting.get(key);
      return r ? JSON.parse(r.value) : null;
    },
    setSetting(key, value) {
      q.setSetting.run(key, JSON.stringify(value));
    },
    // Contact-form messages from the website.
    insertLead(lead) {
      const createdAt = new Date().toISOString();
      const r = q.insertLead.run(createdAt, JSON.stringify(lead));
      return { id: Number(r.lastInsertRowid), createdAt, ...lead };
    },
    listLeads(limit = 200) {
      return q.listLeads.all(limit).map((r) => ({ id: Number(r.id), createdAt: r.created_at, ...JSON.parse(r.data) }));
    },
    deleteLead(id) {
      return q.deleteLead.run(id).changes > 0;
    },

    /* ---------- Records (by kind) ---------- */
    newId(prefix) {
      return `${prefix}_${crypto.randomBytes(6).toString("base64url")}`;
    },
    get(kind, id) {
      const r = q.recGet.get(kind, String(id));
      return r ? parse(r) : null;
    },
    /** Insert or replace. The record needs `id`; `createdAt`, `ref` and `status` are kept in columns for lookups. */
    put(kind, rec) {
      const now = new Date().toISOString();
      if (!rec.id) rec.id = store.newId(kind.slice(0, 3));
      if (!rec.createdAt) rec.createdAt = now;
      rec.updatedAt = now;
      q.recPut.run(rec.id, kind, rec.ref || null, rec.status || null, rec.createdAt, rec.updatedAt, JSON.stringify(rec));
      return rec;
    },
    del(kind, id) {
      return q.recDel.run(kind, String(id)).changes > 0;
    },
    list(kind, { ref, status, limit = 1000 } = {}) {
      if (ref) return q.recListRef.all(kind, ref, limit).map(parse);
      if (status) return q.recListStatus.all(kind, status, limit).map(parse);
      return q.recList.all(kind, limit).map(parse);
    },
    count(kind, status) {
      return Number(q.recCountStatus.get(kind, status).n);
    },

    /** Daily counters (address lookups, quotes, orders) for the dashboard. */
    bump(name, day = new Date().toISOString().slice(0, 10)) {
      const id = `stat-${day}`;
      const rec = store.get("stat", id) || { id, day, counts: {} };
      rec.counts[name] = (rec.counts[name] || 0) + 1;
      store.put("stat", rec);
    },

    /** Website funnel events: one more visit for this event, day and source/zone/job/weather. */
    countEvent(day, event, d = {}) {
      q.evCount.run(day, event, d.source || "", d.campaign || "", d.referrer || "", d.landing || "", d.zone || "", d.job || "", d.weather || "");
    },
    eventRows(from, to) {
      return q.evRows.all(from, to).map((r) => ({ ...r, n: Number(r.n) }));
    },

    close() {
      db.close();
    }
  };
  return store;
}

module.exports = { open };
