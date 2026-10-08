// Website: the price calculator with the size typed by hand, an order, the tracking page and the 3D view.
import { expect, test, type Page } from "@playwright/test";

/** Opens the calculator from the header and fills in a 12 × 9 m two-storey house by hand. */
async function fillHouse(page: Page) {
  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "Laske hinta" }).click();
  const wizard = page.getByRole("dialog");
  await expect(wizard.getByRole("heading", { level: 2 }).first()).toBeVisible();
  await wizard.getByRole("spinbutton", { name: /Pituus/ }).fill("12");
  await wizard.getByRole("spinbutton", { name: /Leveys/ }).fill("9");
  await wizard.getByRole("radiogroup", { name: "Kerrokset" }).getByRole("radio", { name: "2" }).click();
  return wizard;
}

test("calculator: size by hand, job, price, order and tracking", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const wizard = await fillHouse(page);

  // Price appears once the size is valid.
  const price = wizard.getByRole("complementary");
  await expect(price.getByText(/^sis\. ALV [\d,]+ %/)).toBeVisible();
  await expect(price.getByText("Yhteensä alv 0 %")).toBeVisible();
  await wizard.getByRole("button", { name: "Seuraava" }).click();

  // Job: facade work.
  await wizard.getByRole("button", { name: /Julkisivutyö/ }).click();
  await expect(wizard.getByRole("button", { name: /Julkisivutyö/ })).toHaveAttribute("aria-pressed", "true");
  await wizard.getByRole("button", { name: "Seuraava" }).click();

  // Timing: defaults (earliest date, 4 weeks).
  await wizard.getByRole("button", { name: "Seuraava" }).click();

  // Contact and order.
  await wizard.getByRole("textbox", { name: "Nimi" }).fill("Testi Asiakas");
  await wizard.getByRole("textbox", { name: "Puhelin" }).fill("040 555 1234");
  await wizard.getByRole("textbox", { name: /Sähköposti/ }).fill("testi@example.fi");
  await wizard.getByRole("combobox", { name: /Kohteen osoite/ }).fill("Testikatu 1, Vantaa");
  await wizard.getByRole("button", { name: "Lähetä tilaus" }).click();

  const ref = wizard.getByText(/^TK-[A-Z0-9]+$/);
  await expect(ref).toBeVisible();
  const orderRef = (await ref.textContent())!.trim();

  // Tracking page opens with the new order.
  await wizard.getByRole("button", { name: "Seuraa tilausta" }).click();
  await expect(page.getByText(orderRef).first()).toBeVisible();
  await expect(page.getByText("Testikatu 1, Vantaa").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("calculator: Näytä 3D:nä opens the 3D view", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const wizard = await fillHouse(page);
  await wizard.getByRole("button", { name: "Näytä 3D:nä" }).click();
  const view = page.getByRole("dialog", { name: "Telinesuunnitelma" });
  await expect(view.locator("canvas")).toBeVisible();
  // Give the renderer a moment to draw a few frames.
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});
