import { expect, test, type BrowserContext, type Page } from "@playwright/test";

async function register(page: Page, context: BrowserContext) {
  await page.goto("/login");
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
  await page.getByLabel("Username").fill(`reminder-${Date.now()}`);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.getByRole("heading", { name: "Todos" })).toBeVisible();
}

function futureInput(minutes: number) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(Date.now() + minutes * 60_000)).replace(" ", "T");
}

test("supports all reminder presets and disables the selector without a due date", async ({ page, context }) => {
  await register(page, context);
  const reminder = page.getByRole("combobox", { name: "Reminder", exact: true });
  await expect(reminder).toBeDisabled();
  await page.getByLabel("Due date and time (Singapore)").fill(futureInput(120));
  await expect(reminder).toBeEnabled();
  await expect(reminder.locator("option")).toHaveCount(8);

  for (const [minutes, label] of [
    ["15", "15m"], ["30", "30m"], ["60", "1h"], ["120", "2h"],
    ["1440", "1d"], ["2880", "2d"], ["10080", "1w"],
  ]) {
    await page.getByLabel("Todo title").fill(`Task ${label}`);
    await page.getByLabel("Due date and time (Singapore)").fill(futureInput(120));
    await reminder.selectOption(minutes);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByTestId("todo-card").filter({ hasText: `Task ${label}` })
      .getByLabel("Reminder")).toContainText(label);
    await expect(reminder).toBeDisabled();
  }
});

test("checks and re-arms reminders while enforcing authentication and input validation", async ({ page, context, browser }) => {
  expect((await page.request.get("/api/notifications/check")).status()).toBe(401);
  await register(page, context);
  expect((await page.request.post("/api/todos", { data: { title: "No due", reminder_minutes: 15 } })).status()).toBe(400);
  expect((await page.request.post("/api/todos", { data: { title: "Invalid", due_date: futureInput(30), reminder_minutes: 1 } })).status()).toBe(400);
  const created = await page.request.post("/api/todos", {
    data: { title: "Due soon", due_date: futureInput(5), reminder_minutes: 15 },
  });
  expect(created.status()).toBe(201);
  const todo = await created.json();
  const check = await page.request.get("/api/notifications/check");
  expect(await check.json()).toMatchObject({ success: true, data: [{ id: todo.id }] });
  const otherContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const otherPage = await otherContext.newPage();
    await register(otherPage, otherContext);
    expect((await (await otherPage.request.get("/api/notifications/check")).json()).data).toEqual([]);
    expect((await otherPage.request.put(`/api/todos/${todo.id}`, {
      data: { last_notification_sent: new Date().toISOString() },
    })).status()).toBe(404);
  } finally {
    await otherContext.close();
  }
  expect((await page.request.put(`/api/todos/${todo.id}`, { data: { last_notification_sent: "invalid" } })).status()).toBe(400);
  expect((await page.request.put(`/api/todos/${todo.id}`, { data: { due_date: null } })).status()).toBe(400);
  const sent = new Date().toISOString();
  expect((await page.request.put(`/api/todos/${todo.id}`, { data: { last_notification_sent: sent } })).status()).toBe(200);
  expect((await (await page.request.get("/api/notifications/check")).json()).data).toEqual([]);
  const updated = await page.request.put(`/api/todos/${todo.id}`, { data: { reminder_minutes: 30 } });
  expect((await updated.json()).todo.last_notification_sent).toBeNull();
  expect((await (await page.request.get("/api/notifications/check")).json()).data).toHaveLength(1);
  const staleMark = await page.request.put(`/api/todos/${todo.id}`, {
    data: {
      last_notification_sent: sent,
      notification_snapshot: { due_date: todo.due_date, reminder_minutes: 15 },
    },
  });
  expect(staleMark.status()).toBe(409);
  expect((await (await page.request.get(`/api/todos/${todo.id}`)).json()).last_notification_sent).toBeNull();
  const currentMark = await page.request.put(`/api/todos/${todo.id}`, {
    data: {
      last_notification_sent: sent,
      notification_snapshot: { due_date: todo.due_date, reminder_minutes: 30 },
    },
  });
  expect(currentMark.status()).toBe(200);
  expect((await page.request.put(`/api/todos/${todo.id}`, {
    data: {
      last_notification_sent: sent,
      notification_snapshot: { due_date: todo.due_date, reminder_minutes: 30 },
    },
  })).status()).toBe(409);
  expect((await page.request.put(`/api/todos/${todo.id}`, { data: { reminder_minutes: 5 } })).status()).toBe(400);
});

test("clearing a due date in the editor also clears its reminder", async ({ page, context }) => {
  await register(page, context);
  const created = await page.request.post("/api/todos", {
    data: { title: "Edit reminder", due_date: futureInput(30), reminder_minutes: 15 },
  });
  const todo = await created.json();
  await page.reload();
  await page.getByRole("button", { name: "Edit Edit reminder" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit todo" });
  const reminder = dialog.getByRole("combobox", { name: "Reminder" });
  await expect(reminder).toHaveValue("15");
  await dialog.getByLabel("Due date and time (Singapore)").fill("");
  await expect(reminder).toBeDisabled();
  await dialog.getByRole("button", { name: "Update" }).click();
  await expect(dialog).toBeHidden();
  expect(await (await page.request.get(`/api/todos/${todo.id}`)).json())
    .toMatchObject({ due_date: null, reminder_minutes: null });
});

test("keeps a new reminder draft while an earlier create is saving", async ({ page, context }) => {
  await register(page, context);
  let releaseRequest = () => {};
  let signalRequest = () => {};
  const blocked = new Promise<void>((resolve) => { releaseRequest = resolve; });
  const started = new Promise<void>((resolve) => { signalRequest = resolve; });
  await page.route("**/api/todos", async (route) => {
    if (route.request().method() === "POST") {
      signalRequest();
      await blocked;
    }
    await route.continue();
  });
  await page.getByLabel("Todo title").fill("First task");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await started;
  await page.getByLabel("Todo title").fill("Next task");
  const due = futureInput(30);
  await page.getByLabel("Due date and time (Singapore)").fill(due);
  await page.getByRole("combobox", { name: "Reminder", exact: true }).selectOption("15");
  const saved = page.waitForResponse((response) =>
    response.url().endsWith("/api/todos") && response.request().method() === "POST",
  );
  releaseRequest();
  expect((await saved).status()).toBe(201);
  await expect(page.getByLabel("Todo title")).toHaveValue("Next task");
  await expect(page.getByLabel("Due date and time (Singapore)")).toHaveValue(due);
  await expect(page.getByRole("combobox", { name: "Reminder", exact: true })).toHaveValue("15");
});

test("requests notification permission and responds to revocation", async ({ page, context }) => {
  await page.addInitScript(() => {
    class FakeNotification {
      static permission: NotificationPermission = "default";
      static requestPermission() {
        FakeNotification.permission = "granted";
        return Promise.resolve(FakeNotification.permission);
      }
    }
    Object.defineProperty(window, "Notification", { value: FakeNotification, configurable: true });
  });
  await register(page, context);
  await page.getByRole("button", { name: "🔔 Enable Notifications" }).click();
  await expect(page.getByRole("button", { name: "🔔 Notifications On" })).toBeDisabled();
  await page.evaluate(() => {
    Object.defineProperty(Notification, "permission", { value: "denied", configurable: true });
    window.dispatchEvent(new Event("focus"));
  });
  await expect(page.getByRole("button", { name: "Notifications blocked in browser" })).toBeDisabled();
});

test("polls granted notifications and records a displayed reminder", async ({ page, context }) => {
  await page.addInitScript(() => {
    class FakeNotification {
      static permission = "granted";
      static requestPermission() { return Promise.resolve("granted"); }
      constructor(title: string) {
        sessionStorage.setItem("notification-title", title);
      }
    }
    Object.defineProperty(window, "Notification", { value: FakeNotification, configurable: true });
  });
  await register(page, context);
  await expect(page.getByRole("button", { name: "🔔 Notifications On" })).toBeDisabled();
  const created = await page.request.post("/api/todos", {
    data: { title: "Notify me", due_date: futureInput(5), reminder_minutes: 15 },
  });
  const todo = await created.json();
  await page.reload();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("notification-title"))).toBe("Notify me");
  await expect.poll(async () => (await (await page.request.get(`/api/todos/${todo.id}`)).json()).last_notification_sent)
    .not.toBeNull();
  expect((await (await page.request.get("/api/notifications/check")).json()).data).toEqual([]);
});
