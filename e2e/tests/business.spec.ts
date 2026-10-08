// Business portal: the office creates a portal user through its API, the user logs in and orders a new site.
import { expect, request, test } from "@playwright/test";
import { OFFICE_PASSWORD } from "../env";

const USER = { name: "Pirjo Portaali", phone: "040 900 0001", pin: "5555", role: "admin" };

test.beforeAll(async ({ baseURL }) => {
  const office = await request.newContext({ baseURL });
  const login = await office.post("/api/staff/login", { data: { password: OFFICE_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const { accounts } = await (await office.get("/api/office/accounts")).json();
  const account = accounts.find((a: { name: string }) => a.name === "Kattomestarit Oy"); // seeded by dev/seed.mjs
  expect(account).toBeTruthy();
  const users = await (await office.get(`/api/office/accounts/${account.id}/users`)).json();
  if (!users.users.some((u: { phone: string }) => u.phone === USER.phone)) {
    const r = await office.post(`/api/office/accounts/${account.id}/users`, { data: USER });
    expect(r.ok(), await r.text()).toBeTruthy();
  }
  await office.dispose();
});

test("business portal: login and a new order", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/business");
  await page.getByRole("textbox", { name: "Puhelinnumero" }).fill(USER.phone);
  await page.getByRole("textbox", { name: "PIN-koodi" }).fill(USER.pin);
  await page.getByRole("button", { name: "Kirjaudu" }).click();
  await expect(page.getByRole("heading", { name: "Työmaanne", level: 1 })).toBeVisible();
  await expect(page.getByText("Kattomestarit Oy").first()).toBeVisible();

  await page.getByRole("button", { name: "Uusi tilaus" }).click();
  const form = page.getByRole("main");
  await expect(form.getByRole("heading", { name: "Uusi tilaus", level: 1 })).toBeVisible();
  await form.getByRole("combobox", { name: "Työmaan osoite" }).fill("Portaalikatu 5, Espoo");
  await form.getByRole("textbox", { name: "Pituus (m)" }).fill("14");
  await form.getByRole("textbox", { name: "Leveys (m)" }).fill("10");
  await form.getByRole("combobox", { name: "Kerroksia" }).selectOption("2");
  await form.getByRole("textbox", { name: "Räystäskorkeus (m)" }).fill("5.8");
  await form.getByRole("group", { name: "Työ" }).getByRole("button", { name: "Julkisivutyö" }).click();
  await form.getByRole("textbox", { name: "Ostotilausnumero (vapaaehtoinen)" }).fill("PO-E2E-1");

  // The company price (with its discount) appears, then the order goes in.
  await expect(form.getByText("Täytä mitat ja kerrokset nähdäksesi hinnan.")).toBeHidden();
  const send = form.getByRole("button", { name: "Lähetä tilaus" });
  await expect(send).toBeEnabled();
  await send.click();

  await expect(page).toHaveURL(/#\/sites\/TK-[A-Z0-9]+$/);
  const ref = /#\/sites\/(TK-[A-Z0-9]+)$/.exec(page.url())![1];
  await expect(page.getByText("Portaalikatu 5, Espoo").first()).toBeVisible();
  await expect(page.getByText(ref).first()).toBeVisible();
  expect(errors).toEqual([]);
});
