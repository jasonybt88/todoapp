import { expect, test, type BrowserContext, type Page } from "@playwright/test";

async function addVirtualAuthenticator(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

async function register(page: Page, context: BrowserContext): Promise<void> {
  await page.goto("/login");
  await addVirtualAuthenticator(context, page);
  await page.getByLabel("Username").fill(`calendar-${Date.now()}`);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });
}

function singaporeDateTime(hoursAhead: number): { input: string; date: string } {
  const value = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return {
    input: `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`,
    date: `${fields.year}-${fields.month}-${fields.day}`,
  };
}

function currentSingaporeMonth(): { label: string; param: string } {
  const value = new Date();
  const numericParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(value);
  const numeric = Object.fromEntries(
    numericParts.map(({ type, value: part }) => [type, part]),
  );
  const label = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "long",
  }).format(value);
  return {
    label,
    param: `${numeric.year}-${numeric.month}`,
  };
}

test("plots due todos on Singapore dates and opens the complete day summary", async ({
  page,
  context,
}) => {
  await register(page, context);
  const due = singaporeDateTime(3);

  await page.getByLabel("Todo title").fill("Calendar task");
  await page.getByLabel("Priority", { exact: true }).selectOption("high");
  await page.getByLabel("Due date and time (Singapore)").fill(due.input);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Calendar task", { exact: true })).toBeVisible();

  await page.goto(`/calendar?month=${due.date.slice(0, 7)}`);
  const day = page.locator(`[data-testid="calendar-day"][data-date="${due.date}"]`);
  await expect(day.getByText("Calendar task")).toBeVisible();
  await expect(day.getByText("Calendar task")).toHaveClass(/calendar-priority-high/);
  await day.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toBeVisible();
  await expect(dialog.getByText("Calendar task", { exact: true })).toBeVisible();
  await expect(dialog.getByText("High", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Incomplete", { exact: true })).toBeVisible();
});

test("navigates months, displays holidays, and falls back for invalid URL state", async ({
  page,
  context,
}) => {
  await register(page, context);
  const current = currentSingaporeMonth();
  await page.getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByRole("heading", { name: current.label })).toBeVisible();
  await expect(page.locator('[data-testid="calendar-day"]')).toHaveCount(42);
  await expect(page.locator(".calendar-weekday")).toHaveCount(7);

  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page).toHaveURL(/\/calendar\?month=\d{4}-\d{2}$/);
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page).toHaveURL(new RegExp(`/calendar\\?month=${current.param}$`));
  await page.getByRole("button", { name: "Today" }).click();
  await expect(page).toHaveURL(new RegExp(`/calendar\\?month=${current.param}$`));

  await page.goto("/calendar?month=2026-12");
  await expect(page.getByRole("heading", { name: "December 2026" })).toBeVisible();
  const scopedHolidays = await page.request.get("/api/holidays?year=2026&month=12");
  expect(scopedHolidays.status()).toBe(200);
  const scopedHolidayBody = (await scopedHolidays.json()) as {
    holidays: Array<{ date: string; name: string }>;
  };
  expect(scopedHolidayBody.holidays).toContainEqual(
    expect.objectContaining({ date: "2026-12-25", name: "Christmas Day" }),
  );
  const invalidMonth = await page.request.get("/api/holidays?year=2026&month=13");
  const incompleteRange = await page.request.get("/api/holidays?year=2026");
  expect(invalidMonth.status()).toBe(400);
  expect(incompleteRange.status()).toBe(400);

  const christmas = page.locator(
    '[data-testid="calendar-day"][data-date="2026-12-25"]',
  );
  await expect(christmas.getByText("Christmas Day")).toBeVisible();
  await christmas.click();
  await expect(page.getByRole("dialog").getByText("Christmas Day")).toBeVisible();

  await page.goto("/calendar?month=2026-13");
  await expect(page.getByRole("heading", { name: current.label })).toBeVisible();
});

test("protects the holiday API and calendar route", async ({ page }) => {
  const holidays = await page.request.get("/api/holidays?year=2026&month=12");
  expect(holidays.status()).toBe(401);

  await page.goto("/calendar");
  await expect(page).toHaveURL(/\/login$/);
});

test("collapses day-cell overflow and keeps every todo in the modal", async ({
  page,
  context,
}) => {
  await register(page, context);
  const due = singaporeDateTime(4);
  for (const title of ["Overflow one", "Overflow two", "Overflow three", "Overflow four"]) {
    const response = await page.request.post("/api/todos", {
      data: { title, due_date: due.input },
    });
    expect(response.status()).toBe(201);
  }

  await page.goto(`/calendar?month=${due.date.slice(0, 7)}`);
  const day = page.locator(`[data-testid="calendar-day"][data-date="${due.date}"]`);
  await expect(day.getByText("+1 more")).toBeVisible();
  await day.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Overflow one", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Overflow two", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Overflow three", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Overflow four", { exact: true })).toBeVisible();
});
