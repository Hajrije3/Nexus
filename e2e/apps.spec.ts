import { expect, test, type Page } from "@playwright/test";

const win = (page: Page, appId: string) => page.locator(`section[data-app-id="${appId}"]`);

/** First boot seeds the filesystem; allow for slow CI machines running tests in parallel. */
const BOOT_TIMEOUT = 15_000;

async function boot(page: Page) {
  await page.goto("/");
  await expect(win(page, "nexus.welcome")).toBeVisible({ timeout: BOOT_TIMEOUT });
  await page.keyboard.press("Alt+KeyW");
}

async function terminal(page: Page, commands: string[]) {
  await page.locator('[data-dock-item="Terminal"]').click();
  const input = win(page, "nexus.terminal").last().getByLabel("Command");
  for (const c of commands) {
    await input.fill(c);
    await input.press("Enter");
    await expect(input).toHaveValue("");
  }
  return win(page, "nexus.terminal").last();
}

test.beforeEach(async ({ page }) => boot(page));

test("Files: create, rename and delete through dialogs and context menus", async ({ page }) => {
  await page.locator('[data-dock-item="Files"]').click();
  const files = win(page, "nexus.files");
  await expect(files.locator('[data-entry="Documents"]')).toBeVisible();

  await files.getByRole("button", { name: "New folder" }).click();
  const name = files.getByRole("dialog").getByRole("textbox");
  await name.fill("Reports");
  await name.press("Enter");
  await expect(files.locator('[data-entry="Reports"]')).toBeVisible();

  // Duplicate names are rejected inline.
  await files.getByRole("button", { name: "New folder" }).click();
  await files.getByRole("dialog").getByRole("textbox").fill("Reports");
  await files.getByRole("dialog").getByRole("button", { name: "Create" }).click();
  await expect(files.getByRole("alert")).toContainText("already exists");
  await files.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  // Rename with F2 (focus the view first).
  await files.locator('[data-entry="Reports"]').click();
  await page.keyboard.press("F2");
  await files.getByRole("dialog").getByRole("textbox").fill("Reports 2026");
  await page.keyboard.press("Enter");
  await expect(files.locator('[data-entry="Reports 2026"]')).toBeVisible();

  await files.locator('[data-entry="Reports 2026"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: /Delete/ }).click();
  await files.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(files.locator('[data-entry="Reports 2026"]')).toHaveCount(0);
});

test("Files search finds files in subfolders", async ({ page }) => {
  await page.locator('[data-dock-item="Files"]').click();
  const files = win(page, "nexus.files");
  await files.getByLabel("Search in this folder and subfolders").fill("main");
  await expect(files.locator('[data-entry="main.js"]')).toBeVisible();
  await expect(files.getByText("1 item found")).toBeVisible();
});

test("Terminal changes appear live in an open Files window", async ({ page }) => {
  await page.locator('[data-dock-item="Files"]').click();
  const files = win(page, "nexus.files");
  await expect(files.locator('[data-entry="Documents"]')).toBeVisible();

  const term = await terminal(page, ["mkdir -p reports/q3", "echo 'revenue up' > reports/q3/summary.txt", "cat reports/q3/summary.txt"]);
  await expect(term.getByText("revenue up", { exact: true })).toBeVisible();

  // The Files window (opened before the terminal ran) updates without a refresh.
  await expect(files.locator('[data-entry="reports"]')).toBeVisible();
});

test("Notes: a new note autosaves to a real file and survives reload", async ({ page }) => {
  await page.locator('[data-dock-item="Notes"]').click();
  const notes = win(page, "nexus.notes");
  await notes.getByRole("button", { name: "New note" }).click();
  const body = notes.getByLabel("Note text");
  await body.fill("# Shopping\n\n- milk\n- **coffee**");
  await expect(notes.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 5000 });
  await expect(notes.getByLabel("Preview").getByRole("heading", { name: "Shopping" })).toBeVisible();

  const title = notes.getByLabel("Note title");
  await title.fill("Shopping list");
  await title.press("Enter");
  await expect(notes.getByRole("option", { name: /Shopping list/ })).toBeVisible();

  await page.waitForTimeout(800);
  await page.reload();
  await expect(win(page, "nexus.notes")).toBeVisible();
  await expect(win(page, "nexus.notes").getByLabel("Note text")).toHaveValue(/- \*\*coffee\*\*/);

  // It is an ordinary file other apps can read.
  const term = await terminal(page, ["cat ~/Documents/Notes/'Shopping list.md'"]);
  await expect(term.getByText("- **coffee**")).toBeVisible();
});

test("Code Studio opens a file from Files, edits and saves it", async ({ page }) => {
  await page.locator('[data-dock-item="Files"]').click();
  const files = win(page, "nexus.files");
  await files.locator('[data-entry="Projects"]').dblclick();
  await files.locator('[data-entry="hello-world"]').dblclick();
  await files.locator('[data-entry="main.js"]').dblclick();

  const code = win(page, "nexus.code-studio");
  await expect(code.locator('[data-tab="main.js"]')).toBeVisible();
  const editor = code.locator(".monaco-editor").first();
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n// edited in code studio");
  await page.keyboard.press("Control+S");
  await expect(code.locator('footer [data-save-state="saved"]')).toBeVisible();

  const term = await terminal(page, ["tail -n 1 ~/Projects/hello-world/main.js"]);
  await expect(term.getByText("// edited in code studio", { exact: true })).toBeVisible();
});

test("Settings: theme and accent apply system-wide and persist", async ({ page }) => {
  await page.locator('[data-dock-item="Settings"]').click();
  const settings = win(page, "nexus.settings");
  await settings.getByRole("radio", { name: "Light" }).click();
  await settings.getByRole("radio", { name: "Forest" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("[data-wallpaper]")).toHaveAttribute("data-wallpaper", "forest");

  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("[data-wallpaper]")).toHaveAttribute("data-wallpaper", "forest");
});
