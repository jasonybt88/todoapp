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
  await page.getByLabel("Username").fill(`recurring-${Date.now()}`);
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

test("validates recurring todos and creates the next daily instance on completion", async ({
  page,
  context,
}) => {
  await register(page, context);

  const missingDueDate = await page.request.post("/api/todos", {
    data: {
      title: "No due date",
      is_recurring: true,
      recurrence_pattern: "daily",
    },
  });
  const invalidPattern = await page.request.post("/api/todos", {
    data: {
      title: "Invalid pattern",
      due_date: futureSingaporeInput(),
      is_recurring: true,
      recurrence_pattern: "fortnightly",
    },
  });
  expect(missingDueDate.status()).toBe(400);
  expect((await missingDueDate.json()).error).toBe(
    "Recurring todos require a due date",
  );
  expect(invalidPattern.status()).toBe(400);

  const nonRecurringTodoResponse = await page.request.post("/api/todos", {
    data: { title: "Existing todo" },
  });
  const nonRecurringTodo = (await nonRecurringTodoResponse.json()) as {
    id: number;
  };
  const updateWithoutDueDate = await page.request.put(
    `/api/todos/${nonRecurringTodo.id}`,
    { data: { is_recurring: true, recurrence_pattern: "weekly" } },
  );
  expect(updateWithoutDueDate.status()).toBe(400);
  expect((await updateWithoutDueDate.json()).error).toBe(
    "Recurring todos require a due date",
  );
  await page.request.delete(`/api/todos/${nonRecurringTodo.id}`);

  await page.getByLabel("Todo title").fill("Daily medication");
  await page
    .getByLabel("Due date and time (Singapore)")
    .fill(futureSingaporeInput());
  await page.getByLabel("Repeat").check();
  await page.getByLabel("Recurrence pattern").selectOption("daily");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const createdTodosResponse = await page.request.get("/api/todos");
  const createdTodos = (await createdTodosResponse.json()) as Array<{
    id: number;
    title: string;
    due_date: string;
  }>;
  expect(createdTodosResponse.status()).toBe(200);
  expect(createdTodos).toHaveLength(1);
  const [created] = createdTodos;
  expect(created).toBeDefined();
  const card = page.locator(`[data-todo-id="${created.id}"]`);
  await expect(card.getByText("🔄 daily")).toBeVisible();

  await card.getByRole("checkbox").check();
  await expect(page.getByRole("heading", { name: "Completed (1)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pending (1)" })).toBeVisible();

  const todosResponse = await page.request.get("/api/todos");
  const todos = (await todosResponse.json()) as Array<{
    id: number;
    title: string;
    completed: boolean;
    due_date: string;
  }>;
  expect(todos).toHaveLength(2);
  const next = todos.find((todo) => todo.id !== created.id);
  expect(next).toMatchObject({ title: "Daily medication", completed: false });
  expect(
    new Date(next?.due_date ?? "").getTime() -
      new Date(created.due_date).getTime(),
  )
    .toBe(24 * 60 * 60 * 1000);

  const duplicateCompletion = await page.request.put(`/api/todos/${created.id}`, {
    data: { completed: true },
  });
  expect(duplicateCompletion.status()).toBe(200);
  expect(await duplicateCompletion.json()).not.toHaveProperty("nextInstance");
  const remainingTodosResponse = await page.request.get("/api/todos");
  expect(await remainingTodosResponse.json()).toHaveLength(2);
});

test("disabling recurrence removes the badge and prevents another instance", async ({
  page,
  context,
}) => {
  await register(page, context);

  await page.getByLabel("Todo title").fill("Weekly review");
  await page
    .getByLabel("Due date and time (Singapore)")
    .fill(futureSingaporeInput());
  await page.getByLabel("Repeat").check();
  await page.getByLabel("Recurrence pattern").selectOption("weekly");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const card = page.getByTestId("todo-card").filter({ hasText: "Weekly review" });
  await expect(card.getByText("🔄 weekly")).toBeVisible();
  await card.getByRole("button", { name: "Edit Weekly review" }).click();
  await page.getByLabel("Repeat").last().uncheck();
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(card.getByText("🔄 weekly")).toHaveCount(0);

  await card.getByRole("checkbox").check();
  await expect(page.getByRole("heading", { name: "Completed (1)" })).toBeVisible();
  const todosResponse = await page.request.get("/api/todos");
  expect(await todosResponse.json()).toHaveLength(1);
});
