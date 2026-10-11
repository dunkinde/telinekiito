// Typed client for the business customer portal (/business) and the office's management of portal users.
import type { JobType, PriceChange, Quote, QuoteResult, SystemKey, Urgency, Zone } from "./api";
import type { ScaffoldPlan } from "./plan";
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
  /** Reverse charge VAT (AVL 8 c §): prices and invoices without VAT. */
  reverseCharge?: boolean;
}
export interface BizMe {
  user: BizUser;
  account: BizAccount;
  today: string;
  company: { name: string; phone: string; email: string };
  urgencies: Record<Urgency, boolean>;
  /** Rent is charged for at least this many days. */
  minRentDays?: number;
}

/** What waits for the company on a site. */
export type BizAction = "price_change" | "photos" | "message" | "rental_over";
export interface SiteContact { name: string; phone: string; lastUsed: string; sites: number }
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
  needsAction: BizAction[];
  /** A quote request: "open" until the company accepts the office's offer. */
  quoteRequest: "open" | "accepted" | null;
  /** Priced without VAT (reverse charge). */
  reverseCharge: boolean;
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
  /** A price change from the office waiting for the company's answer (or the latest outcome). */
  priceChange: PriceChange | null;
  invoices: BizInvoiceRef[];
  docs: { confirmation: boolean; inspection: boolean };
  access: string | null;
  cancelled: boolean;
  needsReview?: boolean;
  needsPhotos?: boolean;
}
export interface BizInvoice extends BizInvoiceRef { site: string; po: string; project: string; costCentre: string; access: string }
export interface ChangePreview { before: { days: number; total: number }; after: { days: number; total: number } | null; stock: { ok: boolean } | null }
export type ChangeBody = { type: "days"; days: number; note?: string } | { type: "pickup_date"; date: string; note?: string } | { type: "other"; note: string };

const enc = encodeURIComponent;

/* ---------- Portal ---------- */
export const bizLogin = (phone: string, pin: string) => call<{ ok: true; user: BizUser }>("POST", "/api/biz/login", { phone, pin });
export interface BizRegistration { company: string; businessId: string; billingAddress: string; einvoiceAddress: string; contactName: string; phone: string; email: string; pin: string; message: string; lang: StaffLang; website: string }
export const bizRegister = (body: BizRegistration) => call<{ ok: true }>("POST", "/api/biz/register", body);
export const bizLogout = () => call<{ ok: true }>("POST", "/api/biz/logout");
export const bizMe = () => call<BizMe>("GET", "/api/biz/me");
/** One scaffold system priced for the company's house, with its brand, load class and limits. */
export interface BizType {
  system: SystemKey;
  name: string;
  loadClass: number;
  kNm2: number;
  kgM2: number;
  widthClass: string;
  walkway: number;
  bay: number;
  frameWidth: number;
  lift: number;
  maxHeight: number;
  maxHeightBrackets: number | null;
  material: "aluminium" | "steel";
  kind: "frame" | "modular";
  /** Material from our rental partner: the office confirms availability. */
  partner: boolean;
  /** Highest point of this scaffold on this house, m. */
  height: number | null;
  total: number;
  net: number;
  vat: number;
  area: number;
  perM2: number | null;
  weightKg: number;
  /** What needs the office's own plan or calculation: height, roof_edge, roof_anchor, not_covered, other. */
  engineer: string[];
  earliest: string | null;
}
export interface BizQuote extends QuoteResult {
  system: SystemKey;
  types: BizType[];
  plan?: ScaffoldPlan;
  review: { storeys: number | null; large: boolean; measured: boolean; engineer: string[]; height: number | null; request: boolean };
}
export const bizQuote = (body: Record<string, unknown>) => call<BizQuote>("POST", "/api/biz/quote", body);
export const bizPlan = (ref: string) => call<{ plan: ScaffoldPlan }>("GET", `/api/biz/orders/${enc(ref)}/plan`);
export const bizOrders = () => call<{ orders: BizOrderSummary[]; contacts: SiteContact[] }>("GET", "/api/biz/orders");
/** One site. `seen`: the site page is open, so its messages are read. */
export const bizOrder = (ref: string, seen = false) => call<{ order: BizOrder }>("GET", `/api/biz/orders/${enc(ref)}${seen ? "?seen=1" : ""}`);
export const bizPlaceOrder = (body: Record<string, unknown>) => call<{ ref: string; order: BizOrder }>("POST", "/api/biz/orders", body);
export const bizSaveDetails = (ref: string, body: Partial<BizDetails>) => call<{ order: BizOrder }>("PATCH", `/api/biz/orders/${enc(ref)}`, body);
export const bizPreview = (ref: string, body: ChangeBody) => call<ChangePreview>("POST", `/api/biz/orders/${enc(ref)}/preview`, body);
export const bizChange = (ref: string, body: ChangeBody) => call<{ order: BizOrder }>("POST", `/api/biz/orders/${enc(ref)}/change`, body);
export const bizAnswerPriceChange = (ref: string, accept: boolean, id: string, note?: string) =>
  call<{ order: BizOrder }>("POST", `/api/biz/orders/${enc(ref)}/price-change/${accept ? "accept" : "decline"}`, { id, note });
export const bizPickup = (ref: string) => call<{ order: BizOrder }>("POST", `/api/biz/orders/${enc(ref)}/pickup`, {});
export const bizUploadPhoto = (ref: string, image: string) => call<{ order: BizOrder }>("POST", `/api/biz/orders/${enc(ref)}/photos`, { image });
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
