"use strict";
// Internal work: projects, tasks (with checklist, comments and logged hours) and routines that make a task each
// period. Records live in the store as kinds "project", "task" and "routine"; this module validates input and works
// out routine dates. Dates are YYYY-MM-DD in Helsinki time.
const { HttpError } = require("./orders");

const TASK_STATUS = ["todo", "doing", "done"];
const PRIORITY = ["low", "normal", "high"];
const EVERY = ["day", "week", "month"];
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const id = (v) => (v == null || v === "" ? null : /^[\w-]{1,40}$/.test(String(v)) ? String(v) : null);

function checklistOf(v) {
  if (!Array.isArray(v)) return undefined;
  return v.slice(0, 50).map((c) => (typeof c === "string" ? { text: str(c, 200), done: false } : { text: str(c && c.text, 200), done: Boolean(c && c.done) })).filter((c) => c.text);
}

/** Fields of a project from the office's input; `partial` for edits (only what was sent). */
function projectInput(b, partial = false) {
  if (!b || typeof b !== "object") throw new HttpError(400, "bad_request", "Send the project as JSON.");
  const p = {};
  if (!partial || b.name !== undefined) {
    p.name = str(b.name, 120);
    if (!p.name) throw new HttpError(400, "name_required", "Give the project a name.");
  }
  if (b.description !== undefined) p.description = str(b.description, 2000);
  if (b.ownerId !== undefined) p.ownerId = id(b.ownerId);
  if (b.due !== undefined) p.due = isDate(b.due) ? String(b.due) : null;
  if (b.status !== undefined) p.status = ["active", "done", "archived"].includes(b.status) ? b.status : "active";
  if (!partial && !p.status) p.status = "active";
  return p;
}

function taskInput(b, partial = false) {
  if (!b || typeof b !== "object") throw new HttpError(400, "bad_request", "Send the task as JSON.");
  const t = {};
  if (!partial || b.title !== undefined) {
    t.title = str(b.title, 200);
    if (!t.title) throw new HttpError(400, "title_required", "Give the task a title.");
  }
  if (b.notes !== undefined) t.notes = str(b.notes, 4000);
  if (b.projectId !== undefined) t.projectId = id(b.projectId);
  if (b.assigneeId !== undefined) t.assigneeId = id(b.assigneeId);
  if (b.due !== undefined) t.due = isDate(b.due) ? String(b.due) : null;
  if (b.status !== undefined) t.status = TASK_STATUS.includes(b.status) ? b.status : "todo";
  if (b.priority !== undefined) t.priority = PRIORITY.includes(b.priority) ? b.priority : "normal";
  if (b.orderRef !== undefined) t.orderRef = /^T[KP]-[A-Z0-9]{4,10}$/.test(String(b.orderRef || "").trim().toUpperCase()) ? String(b.orderRef).trim().toUpperCase() : null;
  const cl = checklistOf(b.checklist);
  if (cl) t.checklist = cl;
  if (!partial) {
    t.status = t.status || "todo";
    t.priority = t.priority || "normal";
  }
  return t;
}

function routineInput(b, partial = false) {
  if (!b || typeof b !== "object") throw new HttpError(400, "bad_request", "Send the routine as JSON.");
  const r = {};
  if (!partial || b.title !== undefined) {
    r.title = str(b.title, 200);
    if (!r.title) throw new HttpError(400, "title_required", "Give the routine a title.");
  }
  if (b.notes !== undefined) r.notes = str(b.notes, 2000);
  if (b.projectId !== undefined) r.projectId = id(b.projectId);
  if (b.assigneeId !== undefined) r.assigneeId = id(b.assigneeId);
  if (!partial || b.every !== undefined) r.every = EVERY.includes(b.every) ? b.every : "week";
  if (b.weekday !== undefined) r.weekday = Math.min(7, Math.max(1, Math.round(Number(b.weekday) || 1)));
  if (b.monthDay !== undefined) r.monthDay = Math.min(28, Math.max(1, Math.round(Number(b.monthDay) || 1)));
  if (b.active !== undefined) r.active = Boolean(b.active);
  const cl = checklistOf(b.checklist);
  if (cl) r.checklist = cl.map((c) => ({ text: c.text, done: false }));
  if (!partial) {
    r.weekday = r.weekday || 1;
    r.monthDay = r.monthDay || 1;
    r.active = r.active !== false;
  }
  return r;
}

function hoursInput(b) {
  if (!b || typeof b !== "object") throw new HttpError(400, "bad_request", "Send the hours as JSON.");
  const hours = Math.round(Number(b.hours) * 4) / 4;
  if (!(hours > 0 && hours <= 24)) throw new HttpError(400, "bad_hours", "Give the hours, from 0.25 to 24.");
  if (!isDate(b.date)) throw new HttpError(400, "bad_date", "Give the date.");
  return { date: String(b.date), hours, note: str(b.note, 300) };
}

const d2 = (iso) => new Date(iso + "T12:00:00Z");
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = d2(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const weekday = (s) => ((d2(s).getUTCDay() + 6) % 7) + 1; // Monday 1 … Sunday 7

/** Whether the routine falls on this date. */
function routineOn(r, date) {
  if (r.every === "day") return weekday(date) <= 5; // working days
  if (r.every === "week") return weekday(date) === (r.weekday || 1);
  return Number(date.slice(8, 10)) === (r.monthDay || 1);
}

/**
 * Dates from the day after the routine last made a task up to today (at most 31 back) on which it is due.
 * A new routine starts with today if today is one of its days.
 */
function dueDates(r, today) {
  const from = r.lastMade ? addDays(r.lastMade, 1) : today;
  const start = from < addDays(today, -31) ? addDays(today, -31) : from;
  const out = [];
  for (let d = start; d <= today; d = addDays(d, 1)) if (routineOn(r, d)) out.push(d);
  return out;
}

/** The task a routine makes for one date. */
function taskFromRoutine(r, date) {
  return {
    title: r.title, notes: r.notes || "", projectId: r.projectId || null, assigneeId: r.assigneeId || null,
    due: date, status: "todo", priority: "normal", orderRef: null,
    checklist: (r.checklist || []).map((c) => ({ text: c.text, done: false })),
    comments: [], hours: [], routineId: r.id, createdBy: "routine"
  };
}

/** Monday of the week of a date. */
const weekStart = (date) => addDays(date, 1 - weekday(date));

module.exports = { TASK_STATUS, PRIORITY, EVERY, projectInput, taskInput, routineInput, hoursInput, dueDates, taskFromRoutine, routineOn, weekStart, addDays, str };
