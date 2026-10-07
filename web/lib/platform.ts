// Typed client for the platform API used by the office (/office) and the crew app (/crew).
// Every call goes to the same server; the login is an HttpOnly session cookie.
import { ApiError, type Floors, type JobType, type Pricing, type Quote, type RoofType, type Urgency, type Zone, type SystemKey } from "./api";
import type { ScaffoldPlan } from "./plan";

export { ApiError };

/* ---------------- Types ---------------- */
export type Role = "owner" | "leader" | "worker";
export type StaffLang = "fi" | "en" | "ru";
export type OrderStatus = "received" | "confirmed" | "loading" | "en_route" | "erected" | "pickup_requested" | "dismantled" | "closed" | "cancelled";
export const ORDER_FLOW: OrderStatus[] = ["received", "confirmed", "loading", "en_route", "erected", "pickup_requested", "dismantled", "closed"];

// Parts of both scaffold systems (lib/engine.js PARTS): Layher Blitz keys as before, MonZon keys start with mz_.
export type PartKey =
  | "frames" | "baseJacks" | "decks" | "hatchDecks" | "guardrails" | "toeBoards" | "endGuards"
  | "diagonals" | "topPosts" | "catchPosts" | "catchMesh" | "anchors"
  | "mz_baseJacks" | "mz_baseCollars" | "mz_standards" | "mz_transoms" | "mz_ledgers" | "mz_decks" | "mz_accessDecks" | "mz_guardrails" | "mz_endGuards" | "mz_toeBoards" | "mz_endToeBoards" | "mz_braces" | "mz_topPosts" | "mz_catchPosts" | "mz_catchMesh" | "mz_anchors";
export const LAYHER_PARTS: PartKey[] = ["frames", "baseJacks", "decks", "hatchDecks", "guardrails", "toeBoards", "endGuards", "diagonals", "topPosts", "catchPosts", "catchMesh", "anchors"];
export const MONZON_PARTS: PartKey[] = ["mz_baseJacks", "mz_baseCollars", "mz_standards", "mz_transoms", "mz_ledgers", "mz_decks", "mz_accessDecks", "mz_guardrails", "mz_endGuards", "mz_toeBoards", "mz_endToeBoards", "mz_braces", "mz_topPosts", "mz_catchPosts", "mz_catchMesh", "mz_anchors"];
export const PART_KEYS: PartKey[] = [...LAYHER_PARTS, ...MONZON_PARTS];
export const systemOfPart = (k: PartKey): SystemKey => (k.startsWith("mz_") ? "monzon" : "layher");
export type Parts = Partial<Record<PartKey, number>>;

export const INSPECTION_ITEMS = ["ground", "bracing", "anchors", "decks", "guardrails", "access", "catch", "clearance", "tag"] as const;
export type InspectionItem = (typeof INSPECTION_ITEMS)[number];

export interface StaffUser {
  id: string;
  name: string;
  phone?: string;
  role: Role;
  crewId: string | null;
  lang: StaffLang;
  active?: boolean;
  master?: boolean;
  createdAt?: string;
  lastLoginAt?: string | null;
}
export interface Crew { id: string; name: string; color: string; truck?: string; active: boolean; createdAt?: string }
export interface Me { user: StaffUser; crews: { id: string; name: string; color: string; active: boolean }[]; company: string; today: string }

export interface Geo { lat: number; lon: number }
export interface House {
  length: number; width: number; floors: Floors; eave: number; roofType: RoofType; pitch: number; jobType: JobType; gables: boolean;
  /** Measured walls from the 3D building model; the price follows them instead of the length × width box. */
  walls?: { edge: number; len: number; eave: number; top: number; gable?: boolean; ext?: number }[];
  /** Scaffold system (missing on older orders = Layher). */
  system?: SystemKey;
  model?: { id: string; date: string | null };
}
export interface Side { name: string; bays: number; lifts: number; workH: number; area: number; catchOn: boolean }
export interface FullEstimate { area: number; runM: number; catchRunM: number; extraLevelM: number; weightKg: number; parts: Parts; sides: Side[] }
export interface Assignment { date?: string | null; time?: string; crewId?: string | null; pickupDate?: string | null; pickupTime?: string; pickupCrewId?: string | null }
export interface HistoryEntry { status?: OrderStatus; event?: string; code?: string; at: string; by?: string; days?: number; detail?: unknown }
export interface Message { from: "customer" | "office"; text: string; at: string; by?: string }
export interface Photo { id: string; stage: string; at: string; by: string; note?: string }
export interface Inspection {
  items?: Partial<Record<InspectionItem, boolean>>;
  notes?: string;
  signer?: string;
  signature?: string;
  signedAt?: string;
  noSignatureReason?: string;
  at?: string;
  by?: string;
}
export interface Work {
  loaded?: { checked?: Parts; done?: boolean; notes?: string; at?: string; by?: string };
  arrivedAt?: string;
  inspection?: Inspection;
  visits?: { at: string; by: string; ok: boolean; notes: string }[];
  pickup?: { counted?: Parts; missing?: Parts; damaged?: Parts; notes?: string; at?: string; by?: string };
}
export interface Rental { startedAt?: string; endedAt?: string }

export type ChangeType = "days" | "pickup_date" | "house" | "other";
export interface ChangeRequest {
  id: string;
  ref: string;
  type: ChangeType;
  source: "customer" | "crew" | "office";
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  note: string;
  proposed: { days?: number; date?: string; house?: House };
  before: { days: number; total: number; house: House };
  after: { total: number; days: number; area: number; quote: Quote } | null;
  stock: { ok: boolean; short: Parts } | null;
  photos: string[];
  by: { id?: string; name?: string; role: string } | null;
  decidedAt: string | null;
  decidedBy: { id: string; name: string; role: Role } | null;
  reason: string;
  order?: { address: string; customer: string; status: OrderStatus } | null;
}

export interface FullOrder {
  ref: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  example: boolean;
  history: HistoryEntry[];
  customer: { name: string; phone: string; email: string };
  site: { address: string; zone: Zone };
  house: House;
  schedule: { start: string; days: number; urgency: Urgency };
  estimate: FullEstimate;
  quote: Quote & { discountPct?: number };
  crew: string;
  eta: string;
  notes: string;
  internalNotes?: string;
  /** The size from online data can't be trusted: the office checks it before confirming. */
  needsReview?: boolean;
  sizeCheck?: { reasons: { code: string; n?: number }[]; at: string };
  /** The address is in another delivery zone than the order was priced for. */
  zoneCheck?: { zone: string; chosen: string };
  messages: Message[];
  source: string;
  lang?: "fi" | "en";
  geo?: Geo | null;
  assignment?: Assignment;
  work?: Work;
  photos?: Photo[];
  rental?: Rental;
  cancelled?: { at: string; by: string; reason: string } | null;
  invoiceNo?: string;
  accountId?: string;
  /** Set when a business customer ordered in the portal or edited their details there. */
  business?: { po?: string; project?: string; costCentre?: string; siteContact?: { name?: string; phone?: string }; siteInfo?: string; orderedBy?: string };
  discountPct?: number;
  weather?: { maxGust: number; maxWind: number; peakAt: string; at: string };
  pendingChanges?: number;
}

export interface OutboxMessage {
  id: string;
  ref: string | null;
  event: string;
  channel: "email" | "sms";
  to: string;
  lang: string;
  subject: string;
  body: string;
  status: "waiting" | "sent" | "failed" | "skipped";
  attempts: number;
  error?: string;
  sentAt?: string;
  audience: "customer" | "office";
  createdAt: string;
}
export interface TimeEntry { id: string; ref: string; staffId: string; staffName: string; start: string; end?: string; status: "running" | "done" }
export interface AuditEntry { id: string; ref: string | null; action: string; actor: { id: string; name: string; role: string }; detail: unknown; createdAt: string }
export interface FileRec { id: string; ref: string; kind: "photo" | "signature"; stage: string; mime: string; size: number; by: string; createdAt: string }

export interface InvoiceLine { key: string; label: string; vars: Record<string, unknown> | null; qty: number; unit: string; unitPrice: number; net: number; labour: boolean }
export interface Invoice {
  id: string;
  no: string;
  ref: string;
  status: "draft" | "sent" | "paid" | "void";
  date: string;
  due: string;
  reference: string;
  vatPct: number;
  customer: { name: string; businessId?: string; contact?: string; email?: string; phone?: string };
  site: string;
  lang: "fi" | "en";
  accountId: string | null;
  lines: InvoiceLine[];
  net: number;
  vat: number;
  total: number;
  labourGross: number;
  rentDays: number;
  usedDays: number | null;
  paidAt?: string;
  createdAt: string;
}
export interface Review { id: string; ref: string; stars: number; text: string; consent: boolean; published: boolean; name: string; lang: string; createdAt: string }

export interface OfficeOrderDetail extends FullOrder {
  changes: ChangeRequest[];
  outbox: OutboxMessage[];
  time: TimeEntry[];
  invoices: Invoice[];
  audit: AuditEntry[];
  files: FileRec[];
  review: Review | null;
  rentalEnd: string;
}

export interface Job {
  ref: string;
  status: OrderStatus;
  address: string;
  zone: Zone;
  geo: Geo | null;
  customer: string;
  jobType: JobType;
  area: number;
  urgency: Urgency;
  example: boolean;
  kind: "delivery" | "pickup";
  date: string;
  time: string;
  crewId: string | null;
  done: boolean;
}
export interface JobsResponse {
  today: string;
  from: string;
  to: string;
  jobs: Job[];
  visits: { ref: string; address: string; due: string; overdue: boolean }[];
  pendingChanges: number;
  crews: { id: string; name: string; color: string }[];
}
export interface JobCard {
  ref: string;
  status: OrderStatus;
  example: boolean;
  history: HistoryEntry[];
  customer: { name: string; phone: string; email: string };
  site: { address: string; zone: Zone };
  geo: Geo | null;
  house: House;
  schedule: { start: string; days: number; urgency: Urgency };
  estimate: FullEstimate;
  notes: string;
  internalNotes: string;
  assignment: Assignment;
  crew: string;
  eta: string;
  work: Work;
  photos: Photo[];
  rental: Rental;
  inspectionItems: InspectionItem[];
  parts: { key: PartKey; name: string; qty: number }[];
  changes: ChangeRequest[];
  messages: Message[];
  minutes: number;
  timeEntries: { id: string; staffId: string; staffName: string; start: string; end: string | null }[];
}

export interface CalendarData {
  from: string;
  days: string[];
  crews: Crew[];
  jobs: Job[];
  unassigned: { ref: string; status: OrderStatus; start: string; days: number; urgency: Urgency; address: string; area: number; customer: string; example: boolean }[];
  pickupsToPlan: { ref: string; address: string; area: number; rentalEnd: string; customer: string }[];
  capacity: { date: string; booked: number; max: number | null }[];
}

export interface MapSite {
  ref: string;
  status: OrderStatus;
  address: string;
  zone: Zone;
  geo: Geo | null;
  example: boolean;
  customer: string;
  area: number;
  urgency: Urgency;
  start: string;
  pickupDate: string | null;
  rentalEnd: string;
  crew: { name: string; color: string } | null;
  wind: { maxGust: number; peakAt: string; warn: boolean } | null;
}
export interface MapData { sites: MapSite[]; windWarnMs: number; locating: number }

export interface StockPart {
  key: PartKey;
  name: string;
  kg: number;
  owned: number;
  price: number;
  onSite: number;
  reserved: number;
  freeToday: number;
  minFree: number;
  minFreeOn: string;
  low: boolean;
}
export interface StockMove { id: string; part: PartKey; delta: number; reason: string; ref: string | null; by: string; after: number; createdAt: string }
export interface StockOverview {
  enabled: boolean;
  bufferDays: number;
  lowWarnPct: number;
  today: string;
  days: string[];
  free: Record<PartKey, number>[];
  parts: StockPart[];
  holders: { ref: string; status: OrderStatus; address: string; from: string; to: string; parts: Parts; onSite: boolean }[];
  moves: StockMove[];
}

export interface Alert { id: string; ref: string | null; type: string; text: string; data: Record<string, unknown>; status: "new" | "read"; read: boolean; createdAt: string }
export interface Lead { id: number; createdAt: string; name: string; email: string; phone: string; message: string; lang: string }

export interface Messaging {
  email: { connected: boolean; host?: string; from?: string };
  sms: { connected: boolean; provider?: string };
  siteUrl: string;
  waiting: number;
  failed: number;
}

export interface Ops {
  siteUrl: string;
  officeEmail: string;
  company: { name: string; businessId: string; address: string; phone: string; email: string; iban: string; bic: string; einvoiceAddress?: string; einvoiceOperator?: string };
  paymentDays: number;
  invoiceNote: string;
  jobsPerCrewDay: number;
  urgencies: { express: boolean; emergency: boolean };
  zones: { A: boolean; B: boolean; C: boolean };
  aiDrawing: boolean;
  smsEvents: string[];
  windWarnMs: number;
  crewHourCost: number;
  truckTripCost: number;
  rentalReminderDays: number;
  inspectionEveryDays: number;
}

export interface Account {
  id: string;
  name: string;
  businessId?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  code: string;
  discountPct: number;
  paymentDays: number;
  notes?: string;
  billingAddress?: string;
  einvoiceAddress?: string;
  einvoiceOperator?: string;
  portalUsers?: number;
  active: boolean;
  createdAt: string;
  orders?: { ref: string; status: OrderStatus; total: number; createdAt: string; address: string }[];
}

export interface Dashboard {
  today: string;
  kpis: {
    ordersThisWeek: number;
    ordersLastWeek: number;
    bookedThisMonth: number;
    invoicedThisMonth: number;
    outstanding: number;
    m2OnRent: number;
    activeSites: number;
    deliveriesToday: number;
    pickupsToday: number;
    crewsBusy: number;
    crewsTotal: number;
    quoteToOrderPct: number | null;
    lookups30: number;
    orders30: number;
    avgDaysToErected: number | null;
    pendingChanges: number;
    waitingMessages: number;
    newAlerts: number;
  };
  weeks: { week: string; orders: number }[];
  months: { month: string; booked: number; invoiced: number }[];
  byStatus: Partial<Record<OrderStatus, number>>;
}
export interface MarginRow {
  ref: string; address: string; zone: Zone; status: OrderStatus; area: number; revenue: number; hours: number;
  crewCost: number; transportCost: number; damages: number; margin: number; marginPct: number | null; invoiced: boolean; hoursLogged: boolean;
}
export interface Margins { rows: MarginRow[]; byZone: { zone: Zone; jobs: number; revenue: number; margin: number; marginPct: number | null }[]; costs: { crewHourCost: number; truckTripCost: number } }

export type TemplateEvent =
  | "order_received" | "confirmed" | "on_the_way" | "ready" | "rental_ending" | "pickup_scheduled"
  | "collected" | "invoice" | "change_approved" | "change_rejected" | "office_reply";
export type Templates = Record<TemplateEvent, Record<"fi" | "en", { subject: string; body: string; sms: string }>>;

export interface Content {
  faq: { q: { fi: string; en: string }; a: { fi: string; en: string } }[] | null;
  contact: { phone: string; email: string; hours: { fi: string; en: string }; area: { fi: string; en: string } } | null;
}
export interface WeatherSite { ref: string; address: string; maxGust?: number; maxWind?: number; peakAt?: string; warn?: boolean; error?: string }

/* ---------------- Calls ---------------- */
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export async function call<T>(method: Method, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError("Can't reach the server.", "network", 0, null);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const j = (json || {}) as { error?: string; message?: string; info?: Record<string, unknown> };
    throw new ApiError(j.message || `Server error ${res.status}`, j.error || `http_${res.status}`, res.status, j.info || null);
  }
  return json as T;
}
const enc = encodeURIComponent;

// Logins (owner master password, or phone + PIN)
export const loginWithPin = (phone: string, pin: string) => call<{ ok: true; user: StaffUser }>("POST", "/api/staff/login", { phone, pin });
export const loginWithPassword = (password: string) => call<{ ok: true; user: StaffUser }>("POST", "/api/staff/login", { password });
export const logout = () => call<{ ok: true }>("POST", "/api/staff/logout", {});
export const getMe = () => call<Me>("GET", "/api/staff/me");

// Crew app
export const getJobs = (opts: { from?: string; to?: string; all?: boolean } = {}) => {
  const q = new URLSearchParams();
  if (opts.from) q.set("from", opts.from);
  if (opts.to) q.set("to", opts.to);
  if (opts.all) q.set("all", "1");
  return call<JobsResponse>("GET", `/api/crew/jobs${q.toString() ? `?${q}` : ""}`);
};
export const getJobPlan = (ref: string) => call<{ plan: ScaffoldPlan }>("GET", `/api/crew/jobs/${enc(ref)}/plan`);
export const getJob = (ref: string) => call<JobCard>("GET", `/api/crew/jobs/${enc(ref)}`);
export type CrewAction = "loaded" | "on_the_way" | "arrived" | "erected" | "visit" | "dismantled";
export const jobAction = (ref: string, action: CrewAction, extra: { eta?: string; ok?: boolean; notes?: string } = {}) =>
  call<JobCard>("POST", `/api/crew/jobs/${enc(ref)}/action`, { action, ...extra });
export const saveLoadList = (ref: string, checked: Parts, notes = "") => call<JobCard>("PUT", `/api/crew/jobs/${enc(ref)}/loadlist`, { checked, notes });
export const saveInspection = (ref: string, body: { items: Partial<Record<InspectionItem, boolean>>; notes?: string; signer?: string; noSignatureReason?: string }) =>
  call<JobCard>("PUT", `/api/crew/jobs/${enc(ref)}/inspection`, body);
export const savePickupCount = (ref: string, body: { counted: Parts; missing: Parts; damaged: Parts; notes?: string }) =>
  call<JobCard>("PUT", `/api/crew/jobs/${enc(ref)}/pickup`, body);
/** `image` is a data URL (JPEG/PNG/WebP, under 5 MB). */
export const uploadPhoto = (ref: string, image: string, stage: string, note = "") => call<JobCard>("POST", `/api/crew/jobs/${enc(ref)}/photos`, { image, stage, note });
export const uploadSignature = (ref: string, image: string, signer: string) => call<JobCard>("POST", `/api/crew/jobs/${enc(ref)}/signature`, { image, signer });
export const jobTimer = (ref: string, action: "start" | "stop") => call<JobCard>("POST", `/api/crew/jobs/${enc(ref)}/timer`, { action });
export const reportFromSite = (ref: string, body: { type: "house" | "other"; house?: Partial<House>; note?: string; photos?: string[] }) =>
  call<JobCard>("POST", `/api/crew/jobs/${enc(ref)}/report`, body);

// Change requests (office and team leaders)
export const getChanges = (status: "pending" | "approved" | "rejected" | "all" = "pending") => call<{ changes: ChangeRequest[] }>("GET", `/api/office/changes?status=${status}`);
export const decideChange = (id: string, approve: boolean, reason = "") =>
  call<{ change: ChangeRequest; order: FullOrder }>("POST", `/api/office/changes/${enc(id)}/${approve ? "approve" : "reject"}`, { reason });

// Office: orders
export const getOrders = () => call<{ orders: FullOrder[]; crews: Crew[] }>("GET", "/api/office/orders");
export const getOrderPlan = (ref: string) => call<{ plan: ScaffoldPlan }>("GET", `/api/office/orders/${enc(ref)}/plan`);
export const shareOrderPlan = (ref: string) => call<{ token: string }>("POST", `/api/office/orders/${enc(ref)}/share`, {});
export const getOrderDetail = (ref: string) => call<{ order: OfficeOrderDetail; crews: Crew[] }>("GET", `/api/office/orders/${enc(ref)}`);
export interface OrderPatch {
  status?: OrderStatus;
  crew?: string;
  eta?: string;
  message?: string;
  internalNotes?: string;
  assignment?: Assignment;
  cancel?: { reason: string };
  geo?: Geo;
}
export const patchOrder = (ref: string, patch: OrderPatch) => call<{ order: OfficeOrderDetail }>("PATCH", `/api/office/orders/${enc(ref)}`, patch);
export const deleteOrder = (ref: string) => call<{ ok: true }>("DELETE", `/api/office/orders/${enc(ref)}`);
export const getCalendar = (from: string, days = 14) => call<CalendarData>("GET", `/api/office/calendar?from=${from}&days=${days}`);
export const getMap = () => call<MapData>("GET", "/api/office/map");
export const getWeather = () => call<{ threshold: number; sites: WeatherSite[] }>("GET", "/api/office/weather");

// Office: stock
export const getStock = () => call<StockOverview>("GET", "/api/office/stock");
export const saveStock = (body: { enabled?: boolean; owned?: Parts; prices?: Parts; bufferDays?: number; lowWarnPct?: number }) => call<StockOverview>("PUT", "/api/office/stock", body);
export const stockMove = (part: PartKey, delta: number, reason: string, ref?: string) => call<StockOverview>("POST", "/api/office/stock/move", { part, delta, reason, ref });

// Office: alerts, messages, contact form
export const getAlerts = () => call<{ alerts: Alert[] }>("GET", "/api/office/alerts");
export const markAlertsRead = (ids: string[] | "all") => call<{ ok: true }>("POST", "/api/office/alerts/read", ids === "all" ? { all: true } : { ids });
export const getOutbox = () => call<{ messages: OutboxMessage[]; status: Messaging }>("GET", "/api/office/outbox");
export const sendOutboxMessage = (id: string) => call<{ message: OutboxMessage }>("POST", `/api/office/outbox/${enc(id)}/send`, {});
export const getLeads = () => call<{ leads: Lead[] }>("GET", "/api/office/leads");
export const deleteLead = (id: number) => call<{ ok: true }>("DELETE", `/api/office/leads/${id}`);

// Office (owner): money, settings, team, accounts, reviews, reports
export const getPricing = () => call<{ pricing: Pricing; defaults: Pricing }>("GET", "/api/office/pricing");
export const savePricing = (pricing: Pricing) => call<{ pricing: Pricing }>("PUT", "/api/office/pricing", { pricing });
export const getSettings = () => call<{ settings: Ops; defaults: Ops; messaging: Messaging }>("GET", "/api/office/settings");
export const saveSettings = (settings: Partial<Ops>) => call<{ settings: Ops; defaults: Ops; messaging: Messaging }>("PUT", "/api/office/settings", { settings });
export const getTemplates = () => call<{ templates: Templates; events: TemplateEvent[] }>("GET", "/api/office/templates");
export const saveTemplates = (templates: Templates) => call<{ templates: Templates; events: TemplateEvent[] }>("PUT", "/api/office/templates", { templates });
export const getContent = () => call<{ content: Content }>("GET", "/api/office/content");
export const saveContent = (content: Content) => call<{ content: Content }>("PUT", "/api/office/content", { content });

export const getStaff = () => call<{ staff: StaffUser[]; crews: Crew[] }>("GET", "/api/office/staff");
export const addStaff = (body: { name: string; phone: string; role: Role; crewId?: string | null; lang: StaffLang; pin: string }) => call<{ staff: StaffUser }>("POST", "/api/office/staff", body);
export const updateStaff = (id: string, body: Partial<{ name: string; phone: string; role: Role; crewId: string | null; lang: StaffLang; pin: string; active: boolean }>) =>
  call<{ staff: StaffUser }>("PATCH", `/api/office/staff/${enc(id)}`, body);
export const removeStaff = (id: string) => call<{ ok: true }>("DELETE", `/api/office/staff/${enc(id)}`);
export const addCrew = (body: { name: string; truck?: string; color?: string }) => call<{ crew: Crew }>("POST", "/api/office/crews", body);
export const updateCrew = (id: string, body: Partial<{ name: string; truck: string; color: string; active: boolean }>) => call<{ crew: Crew }>("PATCH", `/api/office/crews/${enc(id)}`, body);
export const removeCrew = (id: string) => call<{ ok: true }>("DELETE", `/api/office/crews/${enc(id)}`);

export const getAccounts = () => call<{ accounts: Account[] }>("GET", "/api/office/accounts");
export const saveAccount = (body: Partial<Account>, id?: string) =>
  id ? call<{ account: Account }>("PATCH", `/api/office/accounts/${enc(id)}`, body) : call<{ account: Account }>("POST", "/api/office/accounts", body);
export const removeAccount = (id: string) => call<{ ok: true }>("DELETE", `/api/office/accounts/${enc(id)}`);

export const getInvoices = () => call<{ invoices: Invoice[] }>("GET", "/api/office/invoices");
export const createInvoice = (ref: string) => call<{ invoice: Invoice }>("POST", `/api/office/orders/${enc(ref)}/invoice`, {});
export const setInvoiceStatus = (no: string, status: Invoice["status"]) => call<{ invoice: Invoice }>("PATCH", `/api/office/invoices/${enc(no)}`, { status });
export const invoicesCsvUrl = "/api/office/invoices.csv";

export const getReviews = () => call<{ reviews: Review[] }>("GET", "/api/office/reviews");
export const setReviewPublished = (id: string, published: boolean) => call<{ review: Review }>("PATCH", `/api/office/reviews/${enc(id)}`, { published });

export const getDashboard = () => call<Dashboard>("GET", "/api/office/dashboard");
export const getMargins = () => call<Margins>("GET", "/api/office/margins");
export const getAudit = (ref?: string) => call<{ entries: AuditEntry[] }>("GET", `/api/office/audit${ref ? `?ref=${enc(ref)}` : ""}`);

/* ---------------- Links ---------------- */
export const fileUrl = (id: string) => `/api/files/${enc(id)}`;
export const docUrl = (kind: "confirmation" | "inspection", ref: string) => `/doc/${kind}/${enc(ref)}`;
export const invoiceDocUrl = (no: string) => `/doc/invoice/${enc(no)}`;
/** Satellite view of the site, to check the real shape of the house before confirming. */
export const satelliteUrl = (address: string, geo?: Geo | null) =>
  geo ? `https://www.google.com/maps/@${geo.lat},${geo.lon},45m/data=!3m1!1e3` : `https://www.google.com/maps/search/?api=1&query=${enc(address)}`;
export const mapsUrl = (address: string, geo?: Geo | null) =>
  geo ? `https://www.google.com/maps/dir/?api=1&destination=${geo.lat},${geo.lon}` : `https://www.google.com/maps/dir/?api=1&destination=${enc(address)}`;

/* ---------------- Dates (Helsinki) ---------------- */
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const weekStart = (iso: string) => {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/** Shrink a photo in the browser before upload (longest side 1600 px, JPEG). */
export async function shrinkImage(file: File, max = 1600, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("image"));
      i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
