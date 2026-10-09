"use strict";
// CRM for corporate clients and partners: property managers (isännöitsijät), housing companies, contractors,
// developers, public owners, clients and partners. Organisations found by the prospect scanner (PRH) are created
// here automatically with what the register says; everything typed in the office (contacts, email, phone, notes)
// is the office's own and never overwritten by a scan. Kind "org" in the records table.
const { HttpError } = require("./orders");

const TYPES = ["property_manager", "housing_company", "contractor", "developer", "public_owner", "client", "partner", "other"];
const STAGES = ["none", "prospect", "contacted", "active", "partner", "inactive"];
const key = (s) => String(s || "").toLowerCase().replace(/\b(oy|oyj|ab|ky|ltd|tmi)\b/g, "").replace(/[^a-z0-9åäö]+/g, " ").trim();
const clean = (v, max = 300) => String(v == null ? "" : v).trim().slice(0, max);
const emailOk = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function get(store, id) {
  return id ? store.get("org", id) : null;
}
function list(store) {
  return store.list("org", { limit: 20000 });
}
function findBy(store, { businessId, name, type }) {
  const all = list(store);
  if (businessId) {
    const hit = all.find((o) => o.businessId && o.businessId === businessId);
    if (hit) return hit;
  }
  const k = key(name);
  return k ? all.find((o) => key(o.name) === k && (!type || o.type === type)) || null : null;
}
/** From the register (PRH): create, or fill in only what's still empty. */
function upsertFromRegistry(store, d) {
  const o = findBy(store, d);
  if (o) {
    let changed = false;
    for (const f of ["businessId", "address", "website"]) if (d[f] && !o[f]) { o[f] = d[f]; changed = true; }
    if (changed) store.put("org", o);
    return o;
  }
  return store.put("org", {
    type: d.type, name: clean(d.name, 160), businessId: clean(d.businessId, 20), website: clean(d.website, 200), email: "", phone: "",
    address: clean(d.address, 200), notes: "", stage: "none", tags: [], contacts: [], related: [], accountId: null, activity: [],
    source: "registry", status: d.type, ref: key(d.name)
  });
}
function relate(store, a, b) {
  const x = get(store, a), y = get(store, b);
  if (!x || !y || a === b) return;
  for (const [p, q] of [[x, y], [y, x]]) if (!(p.related || []).includes(q.id)) { p.related = [...(p.related || []), q.id]; store.put("org", p); }
}
function validate(body, partial) {
  const out = {};
  if (!partial || body.name !== undefined) {
    out.name = clean(body.name, 160);
    if (!out.name) throw new HttpError(400, "invalid_fields", "Name is required.", { fields: ["name"] });
  }
  if (body.type !== undefined) {
    if (!TYPES.includes(body.type)) throw new HttpError(400, "invalid_fields", "Unknown organisation type.", { fields: ["type"] });
    out.type = body.type;
  } else if (!partial) out.type = "other";
  if (body.stage !== undefined) {
    if (!STAGES.includes(body.stage)) throw new HttpError(400, "invalid_fields", "Unknown stage.", { fields: ["stage"] });
    out.stage = body.stage;
  }
  for (const [f, max] of [["businessId", 20], ["website", 200], ["phone", 40], ["address", 200], ["notes", 4000]]) if (body[f] !== undefined) out[f] = clean(body[f], max);
  if (body.email !== undefined) {
    out.email = clean(body.email, 160);
    if (!emailOk(out.email)) throw new HttpError(400, "invalid_fields", "Check the email address.", { fields: ["email"] });
  }
  if (body.tags !== undefined) out.tags = (Array.isArray(body.tags) ? body.tags : []).map((t) => clean(t, 40)).filter(Boolean).slice(0, 20);
  if (body.accountId !== undefined) out.accountId = body.accountId ? clean(body.accountId, 40) : null;
  if (body.related !== undefined) out.related = (Array.isArray(body.related) ? body.related : []).map((t) => clean(t, 40)).filter(Boolean).slice(0, 50);
  return out;
}
// Linking an organisation to a business account is the owner's call (sales don't see the accounts).
const ownerOnly = (body, user) => (user.role === "owner" ? body : { ...body, accountId: undefined });
function save(store, body, user, id) {
  const now = new Date().toISOString();
  if (id) {
    const o = get(store, id);
    if (!o) throw new HttpError(404, "not_found", "No such organisation.");
    Object.assign(o, validate(ownerOnly(body, user), true), { editedAt: now, editedBy: user.name });
    if (o.source === "registry") o.source = "registry+office";
    o.status = o.type;
    o.ref = key(o.name);
    return store.put("org", o);
  }
  const d = validate(ownerOnly(body, user), false);
  const dup = findBy(store, { businessId: d.businessId, name: d.name, type: d.type });
  if (dup) throw new HttpError(409, "duplicate", "This organisation is already in the CRM.", { id: dup.id });
  return store.put("org", { stage: "none", tags: [], contacts: [], related: [], accountId: null, activity: [], email: "", phone: "", website: "", address: "", notes: "", businessId: "", ...d, source: "office", createdBy: user.name, status: d.type, ref: key(d.name) });
}
function saveContact(store, orgId, body, user, contactId) {
  const o = get(store, orgId);
  if (!o) throw new HttpError(404, "not_found", "No such organisation.");
  const c = {
    name: clean(body.name, 120), role: clean(body.role, 120), email: clean(body.email, 160), phone: clean(body.phone, 40),
    note: clean(body.note, 1000), primary: Boolean(body.primary)
  };
  if (!c.name && !c.email && !c.phone) throw new HttpError(400, "invalid_fields", "Add a name, an email or a phone number.", { fields: ["name"] });
  if (!emailOk(c.email)) throw new HttpError(400, "invalid_fields", "Check the email address.", { fields: ["email"] });
  o.contacts = o.contacts || [];
  if (!contactId && o.contacts.length >= 200) throw new HttpError(400, "too_many", "This organisation already has 200 contacts.");
  if (c.primary) o.contacts.forEach((x) => (x.primary = false));
  if (contactId) {
    const x = o.contacts.find((y) => y.id === contactId);
    if (!x) throw new HttpError(404, "not_found", "No such contact.");
    Object.assign(x, c, { editedAt: new Date().toISOString() });
  } else o.contacts.push({ id: store.newId("ctc"), ...c, addedBy: user.name, addedAt: new Date().toISOString() });
  if (o.source === "registry") o.source = "registry+office";
  return store.put("org", o);
}
function removeContact(store, orgId, contactId) {
  const o = get(store, orgId);
  if (!o) throw new HttpError(404, "not_found", "No such organisation.");
  o.contacts = (o.contacts || []).filter((x) => x.id !== contactId);
  return store.put("org", o);
}
function addActivity(store, orgId, text, user) {
  const o = get(store, orgId);
  if (!o) throw new HttpError(404, "not_found", "No such organisation.");
  const t = clean(text, 2000);
  if (!t) throw new HttpError(400, "invalid_fields", "Write something first.", { fields: ["text"] });
  o.activity = [{ id: store.newId("act"), at: new Date().toISOString(), by: user.name, text: t }, ...(o.activity || [])].slice(0, 300);
  return store.put("org", o);
}
function remove(store, id) {
  const o = get(store, id);
  if (!o) throw new HttpError(404, "not_found", "No such organisation.");
  for (const x of list(store)) if ((x.related || []).includes(id)) { x.related = x.related.filter((r) => r !== id); store.put("org", x); }
  for (const p of store.list("prospect", { limit: 20000 })) {
    const l = p.links || {};
    let ch = false;
    for (const f of ["housingId", "managerId", "contractorId", "ownerId"]) if (l[f] === id) { l[f] = null; ch = true; }
    if (ch) store.put("prospect", p);
  }
  return store.del("org", id);
}

module.exports = { TYPES, STAGES, get, list, findBy, upsertFromRegistry, relate, save, saveContact, removeContact, addActivity, remove };
