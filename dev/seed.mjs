// Usage: node seed.mjs PORT → creates crews, staff (owner login: password "localpassword"),
// a few real-looking test orders scheduled around today, and some activity, through the API.
const PORT = process.argv[2] || "3995";
const base = `http://127.0.0.1:${PORT}`;
let cookie = "";
async function call(method, url, body, ck = cookie) {
  const r = await fetch(base + url, { method, headers: { ...(ck ? { Cookie: ck } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${url} ${r.status} ${JSON.stringify(j)}`);
  return { j, r };
}
const login = async (b) => (await call("POST", "/api/staff/login", b, "")).r.headers.get("set-cookie").split(";")[0];
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" });
const add = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
cookie = await login({ password: "localpassword" });
const me = (await call("GET", "/api/staff/me")).j;
if (me.crews.length) { console.log("already seeded"); process.exit(0); }
const c1 = (await call("POST", "/api/office/crews", { name: "Tiimi 1", truck: "ABC-123" })).j.crew;
const c2 = (await call("POST", "/api/office/crews", { name: "Tiimi 2", truck: "XYZ-789" })).j.crew;
await call("POST", "/api/office/staff", { name: "Liisa Laine", phone: "040 100 0001", role: "leader", crewId: c1.id, pin: "111111", lang: "fi" });
await call("POST", "/api/office/staff", { name: "Ivan Petrov", phone: "040 100 0002", role: "worker", crewId: c1.id, pin: "2222", lang: "ru" });
await call("POST", "/api/office/staff", { name: "Mikko Virtanen", phone: "040 100 0003", role: "worker", crewId: c2.id, pin: "3333", lang: "fi" });
await call("POST", "/api/office/staff", { name: "Sara Smith", phone: "040 100 0004", role: "leader", crewId: c2.id, pin: "444444", lang: "en" });
// Stock: enough for several jobs.
await call("PUT", "/api/office/stock", { enabled: true, owned: { frames: 600, baseJacks: 400, decks: 600, hatchDecks: 120, guardrails: 360, toeBoards: 260, endGuards: 80, diagonals: 120, topPosts: 120, catchPosts: 60, catchMesh: 200, anchors: 200, frames1: 120, consoles: 160, endToeBoards: 80, hBraces: 60, startLedgers: 40, ladders: 20, tubes: 80, couplers: 200 }, prices: { frames: 140, baseJacks: 35, decks: 95, hatchDecks: 260, guardrails: 28, toeBoards: 30, endGuards: 25, diagonals: 32, topPosts: 22, catchPosts: 120, catchMesh: 85, anchors: 9 } });
await call("POST", "/api/office/accounts", { name: "Kattomestarit Oy", businessId: "1234567-8", contactName: "Pekka Katto", email: "pekka@kattomestarit.example", phone: "040 555 0101", code: "KATTO10", discountPct: 10, paymentDays: 21 });
const houses = [
  { address: "Pihlajatie 10, Vantaa", lat: 60.2934, lon: 25.0378, length: 13.5, width: 8.2, eave: 5.8, floors: "2", jobType: "roof", name: "Anna Korhonen", phone: "040 700 0001", email: "anna@example.fi", urgency: "express" },
  { address: "Koivukuja 3, Espoo", lat: 60.2055, lon: 24.6559, length: 11, width: 9, eave: 3, floors: "1", jobType: "facade", name: "Timo Nieminen", phone: "040 700 0002", email: "timo@example.fi", urgency: "standard", lang: "fi" },
  { address: "Rantatie 22, Porvoo", lat: 60.3932, lon: 25.6650, length: 15, width: 10, eave: 4.3, floors: "1.5", jobType: "roof_facade", name: "Emma Wilson", phone: "040 700 0003", email: "emma@example.com", urgency: "express", lang: "en" },
  { address: "Mäntytie 5, Kerava", lat: 60.4034, lon: 25.1050, length: 10, width: 8, eave: 3, floors: "1", jobType: "gutters", name: "Jari Mäkelä", phone: "040 700 0004", email: "", urgency: "emergency" },
  { address: "Hämeentie 40, Lahti", lat: 60.9827, lon: 25.6612, length: 12, width: 9, eave: 5.8, floors: "2", jobType: "roof", name: "Kattomestarit Oy / Laakso", phone: "040 700 0005", email: "laakso@example.fi", urgency: "standard", partnerCode: "KATTO10" }
];
const earliest = (await call("GET", "/api/config")).j.earliest;
const refs = [];
for (const h of houses) {
  const body = { roofType: "gable", pitch: 30, gables: h.jobType === "roof", zone: "A", days: 28, notes: "", source: "address", lang: h.lang || "fi", ...h, start: earliest[h.urgency] };
  refs.push((await call("POST", "/api/orders", body)).j.ref);
}
// Schedule: one job today for each crew, one tomorrow, one up already, one waiting.
await call("PATCH", `/api/office/orders/${refs[0]}`, { status: "confirmed", assignment: { date: today, time: "08:00", crewId: c1.id } });
await call("PATCH", `/api/office/orders/${refs[1]}`, { status: "confirmed", assignment: { date: today, time: "12:30", crewId: c1.id } });
await call("PATCH", `/api/office/orders/${refs[2]}`, { status: "confirmed", assignment: { date: add(today, 1), time: "07:30", crewId: c2.id } });
await call("PATCH", `/api/office/orders/${refs[3]}`, { status: "erected", assignment: { date: add(today, -3), time: "09:00", crewId: c2.id, pickupDate: add(today, 2), pickupCrewId: c2.id, pickupTime: "10:00" } });
// A customer asks for a longer rental; a message comes in.
await call("POST", `/api/orders/${refs[3]}/extend`, { phone: "0004", days: 14 }, "");
await call("POST", `/api/orders/${refs[1]}/message`, { phone: "0002", text: "Portin koodi on 4512. Koira on pihalla, soittakaa ennen tuloa." }, "");
await call("POST", "/api/contact", { name: "Laura Lehto", email: "laura@example.fi", phone: "040 800 9000", message: "Tarvitsemme telineet rivitaloon ensi kuussa. Voitteko antaa tarjouksen?", lang: "fi", website: "" }, "");
console.log("seeded", { crews: [c1.name, c2.name], refs, logins: { owner: "password localpassword", leader: "040 100 0001 / 111111", workerRu: "040 100 0002 / 2222", worker2: "040 100 0003 / 3333", leaderEn: "040 100 0004 / 444444" } });
