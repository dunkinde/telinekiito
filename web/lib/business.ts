// Typed client for the business customer portal (/business) and the office's management of portal users.
import type { JobType, Quote, Urgency, Zone } from "./api";
import { call, type House, type OrderStatus, type StaffLang } from "./platform";

export type BizRole = "admin" | "manager" | "accountant";
export const BIZ_ROLES: BizRole[] = ["admin", "manager", "accountant"];

export interface BizUser {
  id: string;
  accountId: string;
  name: string;
  phone: string;
  email: string;
  role: BizRole;
  lang: StaffLang;
  active: boolean;
  createdAt?: string;
  lastLoginAt?: string | null;
}
export interface BizAccount {
  id: string;
  name: string;
  businessId: string;
  code: string;
  discountPct: number;
  paymentDays: number;
  billingAddress: string;
  einvoiceAddress: string;
  einvoiceOperator: string;
  email: string;
}
export interface BizMe {
  user: BizUser;
  account: BizAccount;
  today: string;
  company: { name: string; phone: string; email: string };
  urgencies: Record<Urgency, boolean>;
}

export interface NextEvent { kind: "delivery" | "pickup" | "rentalEnd"; date: string; time: string; planned: boolean }
export interface BizOrderSummary {
  ref: string;
  status: OrderStatus;
  address: string;
  zone: Zone;
  geo: { lat: number; lon: number } | null;
  start: string;
  days: number;
  urgency: Urgency;
  jobType: JobType;
  area: number;
  total: number;
  plan: { date: string | null; time: string; pickupDate: string | null; pickupTime: string };
  rentalEnd: string;
  next: NextEvent | null;
  costToDate: number;
  pendingChanges: number;
  po: string;
  project: string;
  costCentre: string;
  orderedBy: string;
  createdAt: string;
  updatedAt: string;
  example: boolean;
}
export interface BizChange {
  id: string;
  type: "days" | "pickup_date" | "house" | "other";
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  note: string;
  proposed: { days?: number; date?: string };
  before: { days: number; total: number };
  after: { total: number; days: number } | null;
  by: { role: "customer" | "office"; name?: string };
  decidedAt: string | null;
  reason: string;
}
export interface BizInvoiceRef { id: string; no: string; ref: string; date: string; due: string; net: number; vat: number; total: number; status: "sent" | "paid"; reference: string }
export interface BizDetails { po: string; project: string; costCentre: string; siteContact: { name: string; phone: string }; siteInfo: string; orderedBy?: string }
export interface BizOrder extends BizOrderSummary {
  customer: { name: string; phone: string; email: string };
  house: House;
  estimate: { area: number; weightKg: number; runM: number };
  quote: Quote;
  crew: string;
  eta: string;
  notes: string;
  messages: { from: "customer" | "office"; text: string; at: string; by?: string }[];
  history: { status?: OrderStatus; code?: string; event?: string; days?: number; at: string }[];
  rental: { startedAt?: string; endedAt?: string };
  work: { loadedAt: string | null; arrivedAt: string | null; inspectedAt: string | null; signer: string; noSignatureReason: string; dismantledAt: string | null };
  business: BizDetails;
  photos: { id: string; stage: string; at: string }[];
  changes: BizChange[];
  invoices: BizInvoiceRef[];
  docs: { confirmation: boolean; inspection: boolean };
  access: string | null;
  cancelled: boolean;
}
export interface BizInvoice extends BizInvoiceRef { site: string; po: string; project: string; costCentre: string; access: string }
export interface ChangePreview { before: { days: number; total: number }; after: { days: number; total: number } | null; stock: { ok: boolean } | null }
export type ChangeBody = { type: "days"; days: number; note?: string } | { type: "pickup_date"; date: string; note?: string } | { type: "other"; note: string };

const enc = encodeURIComponent;

/* ---------- Portal ---------- */
export const bizLogin = (phone: string, pin: string) => call<{ ok: true; user: BizUser }>("POST", "/api/biz/login", { phone, pin });
export const bizLogout = () => call<{ ok: true }>("POST", "/api/biz/logout");
export const bizMe = () => call<BizMe>("GET", "/api/biz/me");
export const bizOrders = () => call<{ orders: BizOrderSummary[] }>("GET", "/api/biz/orders");
export const bizOrder = (ref: string) => call<{ order: BizOrder }>("GET", `/api/biz/orders/${enc(ref)}`);
export const bizPlaceOrder = (body: Record<string, unknown>) => call<{ ref: string; order: BizOrder }>("POST", "/api/biz/orders", body);
export const bizSaveDetails = (ref: string, body: Partial<BizDetails>) => call<{ order: BizOrder }>("PATCH", `/api/biz/orders/${enc(ref)}`, body);
export const bizPreview = (ref: string, body: ChangeBody) => call<ChangePreview>("POST", `/api/biz/orders/${enc(ref)}/preview`, body);
export const bizChange = (ref: string, body: ChangeBody) => call<{ order: BizOrder }>("POST", `/api/biz/orders/${enc(ref)}/change`, body);
export const bizPickup = (ref: string) => call<{ order: BizOrder }>("POST", `/api/biz/orders/${enc(ref)}/pickup`, {});
export const bizMessage = (ref: string, text: string) => call<{ order: BizOrder }>("POST", `/api/biz/orders/${enc(ref)}/message`, { text });
export const bizInvoices = () => call<{ invoices: BizInvoice[] }>("GET", "/api/biz/invoices");
export const bizFinvoiceUrl = (id: string) => `/api/biz/invoices/${enc(id)}/finvoice`;
export const bizUsers = () => call<{ users: BizUser[] }>("GET", "/api/biz/users");
export const bizSaveUser = (body: Partial<BizUser> & { pin?: string }, id?: string) =>
  id ? call<{ user: BizUser }>("PATCH", `/api/biz/users/${enc(id)}`, body) : call<{ user: BizUser }>("POST", "/api/biz/users", body);
export const bizRemoveUser = (id: string) => call<{ ok: true }>("DELETE", `/api/biz/users/${enc(id)}`);

/** Documents and photos open with the order's signed key. */
export const docUrl = (kind: "confirmation" | "inspection", ref: string, access: string | null) => `/doc/${kind}/${enc(ref)}${access ? `?t=${enc(access)}` : ""}`;
export const invoiceDocUrl = (id: string, access: string | null) => `/doc/invoice/${enc(id)}${access ? `?t=${enc(access)}` : ""}`;
export const photoUrl = (id: string, access: string | null) => `/api/files/${enc(id)}${access ? `?t=${enc(access)}` : ""}`;

/* ---------- Office: portal users of an account, e-invoice file ---------- */
export const officeAccountUsers = (accountId: string) => call<{ users: BizUser[] }>("GET", `/api/office/accounts/${enc(accountId)}/users`);
export const officeSaveAccountUser = (accountId: string, body: Partial<BizUser> & { pin?: string }, id?: string) =>
  id
    ? call<{ user: BizUser }>("PATCH", `/api/office/accounts/${enc(accountId)}/users/${enc(id)}`, body)
    : call<{ user: BizUser }>("POST", `/api/office/accounts/${enc(accountId)}/users`, body);
export const officeRemoveAccountUser = (accountId: string, id: string) => call<{ ok: true }>("DELETE", `/api/office/accounts/${enc(accountId)}/users/${enc(id)}`);
export const officeFinvoiceUrl = (invoiceId: string) => `/api/office/invoices/${enc(invoiceId)}/finvoice`;
