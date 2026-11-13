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
  await page.getByLabel("Username").fill(`crud-${Date.now()}`);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Todos" })).toBeVisible();
}

function futureSingaporeInput(hoursAhead = 1): string {
  const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(date)
    .replace(" ", "T");
}

test("creates todos with default fields and optional due dates", async ({
  page,
  context,
}) => {
  await register(page, context);

  await page.getByLabel("Todo title").fill("Title only");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const titleOnly = page.getByText("Title only", { exact: true });
  await expect(titleOnly).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pending (1)" }),
  ).toBeVisible();

  await page.getByLabel("Todo title").fill("Tomorrow task");
  await page.getByLabel("Priority", { exact: true }).selectOption("high");
  await page.getByLabel("Due date and time (Singapore)").fill(futureSingaporeInput());
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Tomorrow task", { exact: true })).toBeVisible();
  await expect(page.getByText("high", { exact: true })).toBeVisible();
});

test("edits, toggles, cancels, and deletes with immediate list updates", async ({
  page,
  context,
}) => {
  await register(page, context);
  await page.getByLabel("Todo title").fill("Initial task");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const task = page.getByText("Initial task", { exact: true });
  await expect(task).toBeVisible();

  const card = page.getByTestId("todo-card").filter({ hasText: "Initial task" });
  await card.getByRole("button", { name: "Edit Initial task" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Updated task");
  await page
    .getByLabel("Due date and time (Singapore)", { exact: true })
    .last()
    .fill(futureSingaporeInput(2));
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page.getByText("Updated task", { exact: true })).toBeVisible();

  const updatedCard = page.getByTestId("todo-card").filter({ hasText: "Updated task" });
  await updatedCard.getByRole("checkbox").check();
  await expect(page.getByRole("heading", { name: "Completed (1)" })).toBeVisible();
  await updatedCard.getByRole("checkbox").uncheck();
  await expect(page.getByRole("heading", { name: "Pending (1)" })).toBeVisible();

  await updatedCard.getByRole("button", { name: "Edit Updated task" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Discarded edit");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Updated task", { exact: true })).toBeVisible();
  await expect(page.getByText("Discarded edit", { exact: true })).toHaveCount(0);

  await updatedCard.getByRole("button", { name: "Edit Updated task" }).click();
  await page
    .getByLabel("Due date and time (Singapore)", { exact: true })
    .last()
    .fill(futureSingaporeInput(-1));
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overdue (1)" })).toBeVisible();

  await updatedCard.getByRole("button", { name: "Delete Updated task" }).click();
  await expect(page.getByText("Updated task", { exact: true })).toHaveCount(0);
});

test("validates the shared API contract and rolls back failed creates", async ({
  page,
  context,
}) => {
  await register(page, context);

  const emptyTitle = await page.request.post("/api/todos", {
    data: { title: "   " },
  });
  const malformedDate = await page.request.post("/api/todos", {
    data: { title: "Bad date", due_date: "not-a-date" },
  });
  const tooSoon = await page.request.post("/api/todos", {
    data: { title: "Too soon", due_date: new Date(Date.now() + 30_000).toISOString() },
  });
  expect(emptyTitle.status()).toBe(400);
  expect(malformedDate.status()).toBe(400);
  expect(tooSoon.status()).toBe(400);

  await page.route("**/api/todos", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary failure" }),
      });
    } else {
      await route.continue();
    }
  });
  await page.getByLabel("Todo title").fill("Optimistic task");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Temporary failure", { exact: true })).toBeVisible();
  await expect(page.getByText("Optimistic task", { exact: true })).toHaveCount(0);
});

test("rejects unauthenticated requests and hides another user's todos", async ({
  page,
  context,
  browser,
}) => {
  const unauthenticated = await page.request.post("/api/todos", {
    data: { title: "Not allowed" },
  });
  expect(unauthenticated.status()).toBe(401);

  await register(page, context);
  await page.getByLabel("Todo title").fill("Private todo");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const response = await page.request.get("/api/todos");
  expect(response.status()).toBe(200);
  const [todo] = (await response.json()) as Array<{ id: number; title: string }>;
  const singleTodo = await page.request.get(`/api/todos/${todo.id}`);
  expect(singleTodo.status()).toBe(200);
  expect(await singleTodo.json()).toMatchObject({
    id: todo.id,
    title: "Private todo",
  });

  const secondContext = await browser.newContext({
    baseURL: "http://localhost:3000",
    timezoneId: "Asia/Singapore",
  });
  try {
    const secondPage = await secondContext.newPage();
    await register(secondPage, secondContext);

    const update = await secondPage.request.put(`/api/todos/${todo.id}`, {
      data: { title: "Stolen" },
    });
    const remove = await secondPage.request.delete(`/api/todos/${todo.id}`);
    expect(update.status()).toBe(404);
    expect(remove.status()).toBe(404);
  } finally {
    await secondContext.close();
  }
});
