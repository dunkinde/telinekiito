"use strict";
// SQLite storage using Node's built-in node:sqlite (no npm packages needed).
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

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
    deleteLead: db.prepare("DELETE FROM leads WHERE id = ?")
  };
  return {
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
    listOrders(limit = 500) {
      return q.list.all(limit).map((r) => JSON.parse(r.data));
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
    close() {
      db.close();
    }
  };
}

module.exports = { open };
