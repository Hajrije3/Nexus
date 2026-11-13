import { expect, test, type Locator, type Page } from "@playwright/test";

const appWindows = (page: Page, appId: string) => page.locator(`section[data-app-id="${appId}"]`);

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no bounding box");
  return b;
}

async function settled(win: Locator) {
  await win.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
}

/** Session saves are debounced (400 ms); give them time to land in IndexedDB. */
async function waitForSave(page: Page) {
  await page.waitForTimeout(800);
}

test("restores windows, geometry, modes and focus after a reload", async ({ page }) => {
  await page.goto("/");
  const welcome = appWindows(page, "nexus.welcome");
  await expect(welcome).toBeVisible();
  await settled(welcome);

  // Move Welcome somewhere specific.
  const tb = await box(welcome.locator("header").first());
  await page.mouse.move(tb.x + 100, tb.y + 20);
  await page.mouse.down();
  await page.mouse.move(tb.x - 100, tb.y + 70, { steps: 8 });
  await page.mouse.up();
  const moved = await box(welcome);

  // A tiled window (Calculator is fixed-size, so use Activity Monitor)…
  await page.locator('[data-dock-item="Activity Monitor"]').click();
  const monitor = appWindows(page, "nexus.activity-monitor");
  await expect(monitor).toBeVisible();
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await expect(monitor).toHaveAttribute("data-mode", "tiled-right");

  // …and a minimised calculator.
  await page.locator('[data-dock-item="Calculator"]').click();
  const calc = appWindows(page, "nexus.calculator");
  await calc.getByRole("button", { name: "Minimize" }).click();
  await expect(calc).toHaveAttribute("data-minimized", "true");

  await welcome.locator("header").first().click({ position: { x: 150, y: 20 } });
  await expect(welcome).toHaveAttribute("data-focused", "true");

  await waitForSave(page);
  await page.reload();

  await expect(page.locator("section[data-window-id]")).toHaveCount(3);
  await settled(appWindows(page, "nexus.welcome"));
  const restored = await box(appWindows(page, "nexus.welcome"));
  expect(restored.x).toBeCloseTo(moved.x, 0);
  expect(restored.y).toBeCloseTo(moved.y, 0);
  await expect(appWindows(page, "nexus.welcome")).toHaveAttribute("data-focused", "true");
  await expect(appWindows(page, "nexus.activity-monitor")).toHaveAttribute("data-mode", "tiled-right");
  await expect(appWindows(page, "nexus.calculator")).toHaveAttribute("data-minimized", "true");
});

test("an empty desktop stays empty after a reload (no Welcome re-launch)", async ({ page }) => {
  await page.goto("/");
  await expect(appWindows(page, "nexus.welcome")).toBeVisible();
  await page.keyboard.press("Alt+KeyW");
  await expect(page.locator("section[data-window-id]")).toHaveCount(0);

  await waitForSave(page);
  await page.reload();
  await expect(page.getByText("to open an application")).toBeVisible();
  await expect(page.locator("section[data-window-id]")).toHaveCount(0);
});

test("storage is persistent and the event log shows system activity", async ({ page }) => {
  await page.goto("/");
  await expect(appWindows(page, "nexus.welcome")).toBeVisible();
  await expect(page.getByText("Not saving")).toHaveCount(0);

  await page.locator('[data-dock-item="Activity Monitor"]').click();
  const monitor = appWindows(page, "nexus.activity-monitor");
  const log = monitor.getByRole("list", { name: "System events" });
  await expect(log.locator('[data-event-type="app.launched"]').first()).toBeVisible();
  await expect(log.locator('[data-event-type="window.opened"]').first()).toBeVisible();
});
