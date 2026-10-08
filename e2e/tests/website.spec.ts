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

test("calculator: Näytä 3D:nä opens the 3D view, which draws only when it changes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Count WebGL draw calls, to see when the 3D views draw.
  await page.addInitScript(() => {
    const w = window as unknown as { __draws: number };
    w.__draws = 0;
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      for (const fn of ["drawElements", "drawArrays"] as const) {
        const orig = C.prototype[fn] as (...a: unknown[]) => void;
        (C.prototype as unknown as Record<string, unknown>)[fn] = function (this: unknown, ...a: unknown[]) {
          w.__draws++;
          return orig.apply(this, a);
        };
      }
    }
  });
  const draws = () => page.evaluate(() => (window as unknown as { __draws: number }).__draws);

  const wizard = await fillHouse(page);
  await wizard.getByRole("button", { name: "Näytä 3D:nä" }).click();
  const view = page.getByRole("dialog", { name: "Telinesuunnitelma" });
  const canvas = view.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(draws).toBeGreaterThan(0);

  // Idle: once the first frames are out, nothing more is drawn.
  await page.waitForTimeout(1000);
  const idle = await draws();
  await page.waitForTimeout(1000);
  expect(await draws()).toBe(idle);

  // Dragging turns the camera and draws again.
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 20, { steps: 8 });
  await page.mouse.up();
  await expect.poll(draws).toBeGreaterThan(idle);
  expect(errors).toEqual([]);
});
