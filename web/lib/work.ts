// Internal work: projects, tasks, routines and logged hours (office).
import { call } from "./platform";

export type TaskStatus = "todo" | "doing" | "done";
export type Priority = "low" | "normal" | "high";
export type Every = "day" | "week" | "month";
export interface CheckItem { text: string; done: boolean }
export interface WorkComment { id: string; by: string; byName: string; text: string; at: string }
export interface WorkHours { id: string; userId: string; userName: string; date: string; hours: number; note: string }
export interface Project { id: string; name: string; description?: string; ownerId?: string | null; due?: string | null; status: "active" | "done" | "archived"; createdAt: string }
export interface Task {
  id: string;
  title: string;
  notes?: string;
  projectId?: string | null;
  assigneeId?: string | null;
  due?: string | null;
  status: TaskStatus;
  priority: Priority;
  orderRef?: string | null;
  checklist?: CheckItem[];
  comments?: WorkComment[];
  hours?: WorkHours[];
  routineId?: string | null;
  createdBy?: string;
  createdAt: string;
  doneAt?: string;
}
export interface Routine { id: string; title: string; notes?: string; projectId?: string | null; assigneeId?: string | null; every: Every; weekday: number; monthDay: number; active: boolean; checklist?: CheckItem[]; lastMade?: string }
export interface Person { id: string; name: string; role: string }
export interface WorkData { today: string; projects: Project[]; tasks: Task[]; routines: Routine[]; people: Person[] }

const B = "/api/office/work";
export const getWork = () => call<WorkData>("GET", B);
export const saveProject = (p: Partial<Project>, id?: string) => call<{ project: Project }>(id ? "PATCH" : "POST", id ? `${B}/projects/${id}` : `${B}/projects`, p);
export const removeProject = (id: string) => call<{ ok: true }>("DELETE", `${B}/projects/${id}`);
export const saveTask = (t: Partial<Task>, id?: string) => call<{ task: Task }>(id ? "PATCH" : "POST", id ? `${B}/tasks/${id}` : `${B}/tasks`, t);
export const removeTask = (id: string) => call<{ ok: true }>("DELETE", `${B}/tasks/${id}`);
export const addComment = (id: string, text: string) => call<{ task: Task }>("POST", `${B}/tasks/${id}/comments`, { text });
export const logHours = (id: string, h: { date: string; hours: number; note: string }) => call<{ task: Task }>("POST", `${B}/tasks/${id}/hours`, h);
export const removeHours = (id: string, hid: string) => call<{ task: Task }>("DELETE", `${B}/tasks/${id}/hours/${hid}`);
export const saveRoutine = (r: Partial<Routine>, id?: string) => call<{ routine: Routine }>(id ? "PATCH" : "POST", id ? `${B}/routines/${id}` : `${B}/routines`, r);
export const removeRoutine = (id: string) => call<{ ok: true }>("DELETE", `${B}/routines/${id}`);
