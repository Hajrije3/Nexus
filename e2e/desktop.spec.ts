import { expect, test, type Locator, type Page } from "@playwright/test";

const windows = (page: Page) => page.locator("section[data-window-id]");
const appWindows = (page: Page, appId: string) => page.locator(`section[data-app-id="${appId}"]`);
const titleBar = (win: Locator) => win.locator("header").first();

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no bounding box");
  return b;
}

async function dragBy(page: Page, handle: Locator, dx: number, dy: number, at?: { x: number; y: number }) {
  const b = await box(handle);
  const start = at ?? { x: b.x + b.width / 3, y: b.y + b.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx / 2, start.y + dy / 2, { steps: 5 });
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 5 });
  await page.mouse.up();
}

async function settled(win: Locator) {
  await win.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
}

async function zIndex(win: Locator) {
  return Number(await win.evaluate((el) => getComputedStyle(el).zIndex));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(appWindows(page, "nexus.welcome")).toBeVisible();
  await settled(appWindows(page, "nexus.welcome"));
});

test("boots into a desktop with the Welcome window focused", async ({ page }) => {
  await expect(page.getByRole("navigation", { name: "Dock" })).toBeVisible();
  await expect(appWindows(page, "nexus.welcome")).toHaveAttribute("data-focused", "true");
  await expect(page.getByRole("heading", { name: "Welcome to NEXUS" })).toBeVisible();
});

test("launches multiple instances and manages focus / z-order", async ({ page }) => {
  const dockCalc = page.locator('[data-dock-item="Calculator"]');
  await dockCalc.click();
  await expect(appWindows(page, "nexus.calculator")).toHaveCount(1);

  // Second instance via the dock context menu.
  await dockCalc.click({ button: "right" });
  await page.getByRole("menuitem", { name: "New Window" }).click();
  await expect(appWindows(page, "nexus.calculator")).toHaveCount(2);
  await expect(windows(page)).toHaveCount(3);

  const welcome = appWindows(page, "nexus.welcome");
  await expect(welcome).toHaveAttribute("data-focused", "false");

  // Clicking a background window raises and focuses it.
  await titleBar(welcome).click({ position: { x: 120, y: 20 } });
  await expect(welcome).toHaveAttribute("data-focused", "true");
  const calcs = appWindows(page, "nexus.calculator");
  expect(await zIndex(welcome)).toBeGreaterThan(await zIndex(calcs.nth(0)));
  expect(await zIndex(welcome)).toBeGreaterThan(await zIndex(calcs.nth(1)));
});

test("drags and resizes windows", async ({ page }) => {
  const welcome = appWindows(page, "nexus.welcome");
  const before = await box(welcome);

  await dragBy(page, titleBar(welcome), -180, 60);
  await expect.poll(async () => (await box(welcome)).x).toBeCloseTo(before.x - 180, 0);
  const moved = await box(welcome);
  expect(moved.y).toBeCloseTo(before.y + 60, 0);

  const se = welcome.locator('[data-resize-handle="se"]');
  const seBox = await box(se);
  await dragBy(page, se, 90, 70, { x: seBox.x + seBox.width / 2, y: seBox.y + seBox.height / 2 });
  await expect.poll(async () => (await box(welcome)).width).toBeCloseTo(moved.width + 90, 0);
  expect((await box(welcome)).height).toBeCloseTo(moved.height + 70, 0);

  // The title bar can never be dragged above the menu bar.
  await dragBy(page, titleBar(welcome), 0, -2000);
  await expect.poll(async () => (await box(welcome)).y).toBeGreaterThanOrEqual(30);
});

test("minimizes to the dock and restores", async ({ page }) => {
  const welcome = appWindows(page, "nexus.welcome");
  await welcome.getByRole("button", { name: "Minimize" }).click();
  await expect(welcome).toHaveAttribute("data-minimized", "true");
  await expect(welcome).toBeHidden();

  await page.locator('[data-dock-item="Welcome"]').click();
  await expect(welcome).toHaveAttribute("data-minimized", "false");
  await expect(welcome).toHaveAttribute("data-focused", "true");

  // Clicking the dock icon of the focused app minimizes it.
  await page.locator('[data-dock-item="Welcome"]').click();
  await expect(welcome).toHaveAttribute("data-minimized", "true");
});

test("maximizes, restores and snaps", async ({ page }) => {
  const welcome = appWindows(page, "nexus.welcome");
  const floating = await box(welcome);

  await titleBar(welcome).dblclick({ position: { x: 120, y: 20 } });
  await expect(welcome).toHaveAttribute("data-mode", "maximized");
  await expect.poll(async () => (await box(welcome)).width).toBeGreaterThan(1400);

  await welcome.getByRole("button", { name: "Restore" }).click();
  await expect(welcome).toHaveAttribute("data-mode", "normal");
  await expect.poll(async () => (await box(welcome)).width).toBeCloseTo(floating.width, 0);

  // Drag to the left screen edge → tile left, with a live preview while dragging.
  const tb = await box(titleBar(welcome));
  await page.mouse.move(tb.x + 100, tb.y + 20);
  await page.mouse.down();
  await page.mouse.move(400, 400, { steps: 5 });
  await page.mouse.move(2, 400, { steps: 5 });
  await expect(page.locator('[data-snap-preview="left"]')).toBeVisible();
  await page.mouse.up();
  await expect(welcome).toHaveAttribute("data-mode", "tiled-left");
  await expect(page.locator("[data-snap-preview]")).toHaveCount(0);
  await expect.poll(async () => (await box(welcome)).width).toBeLessThan(730);
});

test("keyboard shortcuts tile and close the focused window", async ({ page }) => {
  const welcome = appWindows(page, "nexus.welcome");
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await expect(welcome).toHaveAttribute("data-mode", "tiled-right");
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await expect(welcome).toHaveAttribute("data-mode", "normal");
  await page.keyboard.press("Alt+KeyW");
  await expect(windows(page)).toHaveCount(0);
  await expect(page.getByText("to open an application")).toBeVisible();
});

test("launcher opens apps by search", async ({ page }) => {
  await page.keyboard.press("Control+KeyK");
  const dialog = page.getByRole("dialog", { name: "Launcher" });
  await expect(dialog).toBeVisible();
  await page.keyboard.type("activ");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  const monitor = appWindows(page, "nexus.activity-monitor");
  await expect(monitor).toBeVisible();
  await expect(monitor).toHaveAttribute("data-focused", "true");
  // The monitor lists itself and Welcome as live processes.
  await expect(monitor.locator("tr[data-pid]")).toHaveCount(2);
});

test("calculator computes from clicks and keyboard", async ({ page }) => {
  await page.locator('[data-dock-item="Calculator"]').click();
  const calc = appWindows(page, "nexus.calculator");
  const display = calc.getByTestId("calc-display");
  await calc.getByRole("button", { name: "7" }).click();
  await calc.getByRole("button", { name: "Multiply" }).click();
  await calc.getByRole("button", { name: "6" }).click();
  await calc.getByRole("button", { name: "Equals" }).click();
  await expect(display).toHaveText("42");

  await page.keyboard.press("Escape");
  await page.keyboard.type("12/4");
  await page.keyboard.press("Enter");
  await expect(display).toHaveText("3");
});

test("closing the last window terminates the process", async ({ page }) => {
  await page.locator('[data-dock-item="Calculator"]').click();
  await appWindows(page, "nexus.calculator").getByRole("button", { name: "Close" }).click();
  await expect(appWindows(page, "nexus.calculator")).toHaveCount(0);
  await expect(page.locator('[data-dock-item="Calculator"]')).toHaveAttribute("aria-label", "Calculator");
});
