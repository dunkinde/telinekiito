// Typed calls to the app's API on the same domain (/api/...). The API is the single source of truth for prices.

export type Urgency = "standard" | "express" | "emergency";
export type Zone = "A" | "B" | "C";
export type RoofType = "gable" | "hip" | "flat";
export type JobType = "roof" | "facade" | "roof_facade" | "gutters";
export type Floors = "1" | "1.5" | "2";
/** Scaffold systems the price engine knows (lib/engine.js SYSTEMS). */
export type SystemKey = "layher" | "monzon";
export const SYSTEM_KEYS: SystemKey[] = ["layher", "monzon"];
export const SYSTEM_NAMES: Record<SystemKey, string> = { layher: "Layher Blitz 70 Alu", monzon: "MonZon Modular Light" };
/** Weather protection follows the job (same rule as lib/engine.js): temporary roof with roof work, sheeting with facade scaffolding. */
export const WEATHER_JOBS: Record<"weatherRoof" | "sheeting", JobType[]> = { weatherRoof: ["roof", "roof_facade"], sheeting: ["facade", "roof_facade"] };

/** Bay length of each system, m (same as lib/engine.js). */
export const SYSTEM_BAY: Record<SystemKey, number> = { layher: 3.07, monzon: 3.07 };

export interface Pricing {
  rentPerM2Day: number;
  minRentDays: number;
  erectPerM2: number;
  dismantlePerM2: number;
  catchPerMetre: number;
  extraLevelPerM: number;
  truckCapacityKg: number;
  zones: Record<Zone, { label: string; trip: number }>;
  urgency: Record<Urgency, { label: string; lead: string; pct: number }>;
  minOrder: number;
  vat: number;
  rangePct: number;
  /** Weather protection: sheeting fitted and removed per m², temporary roof rent per m² of roof per day and work per m². */
  sheetingPerM2?: number;
  roofRentPerM2Day?: number;
  roofWorkPerM2?: number;
  /** Per scaffold system: on/off and its own rates (missing = the general rate). */
  systems?: Record<SystemKey, { enabled: boolean; rentPerM2Day?: number; erectPerM2?: number; dismantlePerM2?: number }>;
}

export interface Config {
  pricing: Pricing;
  features: { ai: boolean; address: boolean; office: boolean };
  /** Delivery speeds the office has switched on (standard is always on). */
  urgencies?: Record<Urgency, boolean>;
  /** First possible start per speed; null when that speed is switched off. */
  earliest: Record<Urgency, string | null>;
  examples: { area: number; days: number; zone: Zone; totals: Record<Urgency, number> };
  /** Scaffold systems the customer can choose from. */
  systems?: { key: SystemKey; name: string; enabled: boolean }[];
}

export interface QuoteLine {
  key: string;
  label: string;
  amount: number;
  vars?: Record<string, string | number>;
}

export interface Quote {
  lines: QuoteLine[];
  rentDays: number;
  trucks: number;
  net: number;
  vat: number;
  total: number;
  low: number;
  high: number;
  labourGross: number;
  perM2: number;
  /** Business customer discount, when one was applied. */
  discountPct?: number;
}

export interface Estimate {
  system?: SystemKey;
  sheeting?: { m2: number } | null;
  roof?: { span: number; length: number; pitch: number; support: number; sections: number; tarpWidth: number; planM2: number } | null;
  area: number;
  runM: number;
  catchRunM: number;
  extraLevelM?: number;
  weightKg: number;
}

export interface QuoteInput {
  length: number;
  width: number;
  eave: number;
  roofType: RoofType;
  pitch: number;
  jobType: JobType;
  gables: boolean;
  days: number;
  zone: Zone;
  urgency: Urgency;
  partnerCode?: string;
  /** The 3D building from the address lookup: the server prices its measured walls. */
  model?: ModelRef;
  /** Scaffold system; the server uses the first one switched on when missing. */
  system?: SystemKey;
  /** Weather sheeting on the scaffold, and a temporary roof over the house. */
  sheeting?: boolean;
  weatherRoof?: boolean;
}

/** The same house priced with one scaffold system. */
export interface SystemOption {
  system: SystemKey;
  name: string;
  total: number;
  area: number;
  weightKg: number;
}

export interface ModelRef {
  id: string;
  lat: number;
  lon: number;
}

export interface QuoteResult {
  estimate: Estimate;
  quote: Quote;
  /** First start date per speed with enough scaffolding and crews for this house; null = speed switched off. */
  available?: Record<Urgency, string | null>;
  partner?: { name: string; discountPct: number } | { invalid: true } | null;
  /** The price with each scaffold system that is switched on. */
  options?: SystemOption[];
  /** The house and scaffold for the 3D view. */
  plan?: import("./plan").ScaffoldPlan;
}

export interface AddressResult {
  found: boolean;
  reason?: string;
  match: { display: string; short?: string; houseLevel: boolean; lat: number; lon: number };
  zone: Zone;
  house: {
    length: number | null;
    width: number | null;
    floors: Floors | null;
    roofType: RoofType | null;
    pitch: number | null;
    eave: number | null;
  };
  details: {
    sizeSource?: "OpenStreetMap" | "estimate" | "NLS 3D model" | "City of Helsinki";
    footprintM2?: number;
    outline?: [number, number][];
    osmType?: string;
    osmWayId?: number;
    floorsSource?: string;
    register?: { storeys: number | null; floorArea: number | null; grossFloorArea: number | null; completed: string | null };
  };
  notes: string[];
  noteCodes?: { code: string; n?: number }[];
  /** The National Land Survey's 3D model of the building (measured outline and wall heights), where it exists. */
  model?: ModelRef & {
    date: string | null;
    perimeterM: number;
    corners: number;
    eaveMin: number | null;
    eaveMax: number | null;
    ridge: number | null;
  };
  /** The 3D model for this area is still downloading: look the address up again in a few seconds. */
  modelPending?: boolean;
}

/** The 3D model prices the house while the size fields still hold what the lookup filled in. */
export function modelRefFor(
  r: AddressResult | null | undefined,
  h: { length: number; width: number; eave: number; pitch: number; roofType: RoofType }
): ModelRef | undefined {
  const m = r?.model, s = r?.house;
  if (!m || !s) return undefined;
  const near = (x: number | null | undefined, y: number) => x == null || Math.abs(x - y) < 0.051;
  const same = near(s.length, h.length) && near(s.width, h.width) && near(s.eave, h.eave) && (s.roofType ?? h.roofType) === h.roofType && (h.roofType === "flat" || near(s.pitch, h.pitch));
  return same ? { id: m.id, lat: m.lat, lon: m.lon } : undefined;
}

export interface DrawingResult {
  length: number;
  width: number;
  floors: Floors;
  roofType: RoofType;
  pitch: number;
  eave: number | null;
  confidence: "low" | "medium" | "high" | "unknown";
  notes: string;
}

export interface OrderView {
  ref: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  example: boolean;
  history: { status?: string; event?: string; code?: string; days?: number; at: string; by?: string }[];
  customer: { name: string; phone: string };
  site: { address: string; zone: Zone };
  house: { length: number; width: number; floors: Floors; eave: number; roofType: RoofType; pitch: number; jobType: JobType; gables: boolean };
  schedule: { start: string; days: number; urgency: Urgency };
  estimate: { area: number; weightKg: number };
  quote: Quote;
  crew: string;
  eta: string;
  messages: { from: "customer" | "office"; text: string; at: string }[];
  lang?: "fi" | "en";
  plan?: { date: string | null; time: string; pickupDate: string | null; pickupTime: string };
  rental?: { startedAt?: string; endedAt?: string };
  cancelled?: boolean;
  docs?: { confirmation: boolean; inspection: boolean };
  changes?: OrderChange[];
  invoices?: { id?: string; no: string | number; date: string; due: string; total: number; status: "sent" | "paid"; reference: string }[];
  review?: { stars: number; text: string } | null;
  rentalEnd?: string;
  /** Signed key for this order's documents (/doc/...?t=). */
  access?: string | null;
  /** The customer's own photos of the house (for the office's size check). */
  photos?: { id: string; at: string }[];
  /** The office needs to check the size: photos of each side are asked for. */
  needsPhotos?: boolean;
  /** The office's latest price change; while pending, the customer accepts or declines it. */
  priceChange?: PriceChange | null;
}

/** A price change the office made after the order (layout, scaffold system, size). The old price holds until accepted. */
export interface PriceChange {
  id: string;
  status: "pending" | "accepted" | "declined" | "replaced" | "withdrawn" | "outdated";
  source: "layout" | "change";
  reason: string;
  at: string;
  by: string;
  before: { total: number; area: number; quote: Quote };
  after: { total: number; area: number; quote: Quote };
  decidedAt: string | null;
  decidedBy: string | null;
  note: string;
}

export interface OrderChange {
  id: string;
  type: "days" | "pickup_date" | "house" | "other";
  source: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  note: string;
  proposed: { days?: number; date?: string };
  before: { days: number; total: number };
  after: { total: number; days: number; area: number } | null;
  by: { role: "customer" | "office" };
  decidedAt: string | null;
  reason: string;
}

export interface SiteContent {
  faq: { q: { fi: string; en: string }; a: { fi: string; en: string } }[] | null;
  contact: { phone: string; email: string; hours: { fi: string; en: string }; area: { fi: string; en: string } } | null;
  reviews: { stars: number; text: string; name: string; lang: string }[];
}

export class ApiError extends Error {
  code: string;
  status: number;
  info: Record<string, unknown> | null;
  constructor(message: string, code: string, status: number, info: Record<string, unknown> | null) {
    super(message);
    this.code = code;
    this.status = status;
    this.info = info;
  }
}

export async function api<T>(method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
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

export const getConfig = () => api<Config>("GET", "/api/config");
export const lookupAddress = (address: string) => api<AddressResult>("POST", "/api/address", { address });

/** An official address with its postal code, suggested while typing. */
export interface AddressSuggestion {
  label: string;
  street: string;
  postcode: string;
  city: string;
  /** Delivery zone of the address (A, B or C). */
  zone: Zone | null;
  lat: number | null;
  lon: number | null;
}
export async function suggestAddresses(q: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
  const r = await fetch("/api/address/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }), signal });
  if (!r.ok) return [];
  const j = (await r.json()) as { suggestions?: AddressSuggestion[] };
  return j.suggestions || [];
}
export const getQuote = (input: QuoteInput) => api<QuoteResult>("POST", "/api/quote", input);
export const getContent = () => api<SiteContent>("GET", "/api/content");
export const readDrawing = (images: string[], lang: string) =>
  api<{ ok: boolean; house: DrawingResult }>("POST", "/api/ai/drawing", { images, lang });
export const sendContact = (body: { name: string; email: string; phone: string; message: string; lang: string; website: string }) =>
  api<{ ok: boolean }>("POST", "/api/contact", body);

/** The order endpoints of the app. */
export const placeOrder = (body: Record<string, unknown>) => api<{ ref: string; order: OrderView }>("POST", "/api/orders", body);
/** What opens an order on the tracking page: the last four phone digits, or the order's key (from a message link or remembered here). */
export type OrderPass = { phone: string; key?: string };
// The phone digits and keys go in the request body, never in the web address (they'd end up in logs and history).
export const getOrder = (ref: string, pass: OrderPass) => api<OrderView>("POST", `/api/orders/${encodeURIComponent(ref)}/view`, pass);
export const getOrderPlan = (ref: string, pass: OrderPass) => api<{ plan: import("./plan").ScaffoldPlan }>("POST", `/api/orders/${encodeURIComponent(ref)}/plan`, pass);
export const uploadOrderPhoto = (ref: string, pass: OrderPass, image: string) =>
  api<OrderView>("POST", `/api/orders/${encodeURIComponent(ref)}/photos`, { ...pass, image });
export const answerPriceChange = (ref: string, pass: OrderPass, accept: boolean, id: string, note?: string) =>
  api<OrderView>("POST", `/api/orders/${encodeURIComponent(ref)}/price-change/${accept ? "accept" : "decline"}`, { ...pass, id, note });
export const orderAction = (ref: string, action: "extend" | "pickup" | "message" | "change" | "review", body: Record<string, unknown>) =>
  api<OrderView>("POST", `/api/orders/${encodeURIComponent(ref)}/${action}`, body);

/** Default eave height for a number of floors (same values as the quote engine). */
export const EAVE_BY_FLOORS: Record<Floors, number> = { "1": 3.0, "1.5": 4.3, "2": 5.8 };

/** Order statuses in the order a job moves through them. */
export const STATUSES = ["received", "confirmed", "loading", "en_route", "erected", "pickup_requested", "dismantled", "closed"] as const;
