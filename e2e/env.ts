// Shared settings for the e2e run. The office password must match dev/seed.mjs.
export const PORT = Number(process.env.E2E_PORT || 4318);
export const OFFICE_PASSWORD = "localpassword";
// Seeded crew logins (dev/seed.mjs).
export const CREW_LEADER = { phone: "040 100 0001", pin: "1111" };
