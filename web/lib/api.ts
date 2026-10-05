// Typed calls to the app's API on the same domain (/api/...). The API is the single source of truth for prices.

export type Urgency = "standard" | "express" | "emergency";
export type Zone = "A" | "B" | "C";
export type RoofType = "gable" | "hip" | "flat";
export type JobType = "roof" | "facade" | "roof_facade" | "gutters";
export type Floors = "1" | "1.5" | "2";

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
}

export interface Config {
  pricing: Pricing;
  features: { ai: boolean; address: boolean; office: boolean };
  earliest: Record<Urgency, string>;
  examples: { area: number; days: number; zone: Zone; totals: Record<Urgency, number> };
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
}

export interface Estimate {
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
    sizeSource?: "OpenStreetMap" | "estimate";
    footprintM2?: number;
    outline?: [number, number][];
    osmType?: string;
    osmWayId?: number;
    floorsSource?: string;
    register?: { storeys: number | null; floorArea: number | null; grossFloorArea: number | null; completed: string | null };
  };
  notes: string[];
  noteCodes?: { code: string; n?: number }[];
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
export const getQuote = (input: QuoteInput) => api<{ estimate: Estimate; quote: Quote }>("POST", "/api/quote", input);
export const readDrawing = (images: string[], lang: string) =>
  api<{ ok: boolean; house: DrawingResult }>("POST", "/api/ai/drawing", { images, lang });
export const sendContact = (body: { name: string; email: string; phone: string; message: string; lang: string; website: string }) =>
  api<{ ok: boolean }>("POST", "/api/contact", body);

/** The order endpoints of the app. */
export const placeOrder = (body: Record<string, unknown>) => api<{ ref: string; order: OrderView }>("POST", "/api/orders", body);
export const getOrder = (ref: string, phone4: string) =>
  api<OrderView>("GET", `/api/orders/${encodeURIComponent(ref)}?phone=${encodeURIComponent(phone4)}`);
export const orderAction = (ref: string, action: "extend" | "pickup" | "message", body: Record<string, unknown>) =>
  api<OrderView>("POST", `/api/orders/${encodeURIComponent(ref)}/${action}`, body);

/** Default eave height for a number of floors (same values as the quote engine). */
export const EAVE_BY_FLOORS: Record<Floors, number> = { "1": 3.0, "1.5": 4.3, "2": 5.8 };

/** Order statuses in the order a job moves through them. */
export const STATUSES = ["received", "confirmed", "loading", "en_route", "erected", "pickup_requested", "dismantled", "closed"] as const;
