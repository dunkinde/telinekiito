// Crew app: a seeded crew leader logs in on a phone and opens today's first job.
import { devices, expect, test } from "@playwright/test";
import { CREW_LEADER } from "../env";

test.use({ ...devices["Pixel 7"], locale: "fi-FI", timezoneId: "Europe/Helsinki" });

test("crew app: login and open a job", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/crew");
  await page.getByRole("textbox", { name: "Puhelinnumero" }).fill(CREW_LEADER.phone);
  await page.getByRole("textbox", { name: "PIN-koodi" }).fill(CREW_LEADER.pin);
  await page.getByRole("button", { name: "Kirjaudu" }).click();
  await expect(page.getByRole("heading", { name: "Työt", level: 1 })).toBeVisible();
  await expect(page.getByText("Liisa Laine · Tiimi 1")).toBeVisible();

  // dev/seed.mjs schedules two jobs for crew 1 today; open the first.
  const today = page.getByRole("region", { name: /^Tänään/ });
  const job = today.getByRole("button", { name: /Pihlajatie 10, Vantaa/ });
  await expect(job).toBeVisible();
  await job.click();
  await expect(page.getByRole("heading", { name: "Lastaa auto" })).toBeVisible();
  await expect(page.getByText("Pihlajatie 10, Vantaa").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Auto lastattu" })).toBeVisible();
  expect(errors).toEqual([]);
});
