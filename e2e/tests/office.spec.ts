// Office: owner login, open an order and change its scaffold in the layout editor (the price follows).
import { expect, test } from "@playwright/test";
import { OFFICE_PASSWORD } from "../env";

/** "6 003,95 €" → 6003.95 */
const euros = (s: string) => Number(s.replace(/[^\d,]/g, "").replace(",", "."));

test("office: owner login, open an order, layout editor change + save updates the price", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/office");
  await page.getByRole("tab", { name: "Omistajan salasana" }).click();
  await page.getByRole("textbox", { name: "Omistajan salasana" }).fill(OFFICE_PASSWORD);
  await page.getByRole("button", { name: "Kirjaudu" }).click();
  await expect(page.getByRole("heading", { name: "Yleiskatsaus", level: 1 })).toBeVisible();

  // Open a seeded order from the order list.
  await page.getByRole("navigation", { name: "Toimiston osiot" }).getByRole("link", { name: /^Tilaukset/ }).click();
  const row = page.getByRole("row").filter({ hasText: "Hämeentie 40, Lahti" });
  const ref = (await row.getByRole("button").first().textContent())!.trim();
  expect(ref).toMatch(/^TK-/);
  await row.getByRole("button", { name: ref }).click();
  const order = page.getByRole("dialog", { name: `Tilaus ${ref}` });
  await expect(order.getByRole("heading", { name: ref })).toBeVisible();
  const priceShown = order.getByRole("definition").filter({ hasText: "€" }).last();
  const before = euros((await priceShown.textContent()) || "");
  expect(before).toBeGreaterThan(0);

  // Layout editor: one more bay on the first long side.
  await order.getByRole("tab", { name: "Teline ja hinta" }).click();
  const plan = order.getByRole("region", { name: "3D-malli" });
  await plan.getByRole("button", { name: "Muokkaa telineitä" }).click();
  const side = plan.getByRole("listitem").filter({ hasText: "Pitkä sivu A" });
  await side.getByRole("button", { name: "Kentät +" }).click();
  const status = plan.getByRole("status").filter({ hasText: "Uusi hinta" });
  await expect(status).toBeVisible();
  // Wait for the server's preview with the new price.
  await expect.poll(async () => {
    const m = /Uusi hinta (.+?€)/.exec((await status.textContent()) || "");
    return m ? euros(m[1]) : before;
  }).toBeGreaterThan(before);
  const after = euros(/Uusi hinta (.+?€)/.exec((await status.textContent()) || "")![1]);

  await plan.getByRole("button", { name: "Tallenna ja päivitä hinta" }).click();
  await expect(plan.getByRole("button", { name: "Tallenna ja päivitä hinta" })).toBeHidden();
  await expect.poll(async () => euros((await priceShown.textContent()) || "")).toBe(after);

  // The saved order has the new price on the server too.
  const saved = await page.request.get(`/api/office/orders/${ref}`);
  expect(saved.ok()).toBeTruthy();
  const body = await saved.json();
  expect((body.order ?? body).quote.total).toBeCloseTo(after, 2);
  expect(errors).toEqual([]);
});
