import { expect, test } from "@playwright/test";
import { addSubtask, registerTestUser } from "./helpers";

test("manages checklist progress, search, parent independence, and cascade deletion", async ({ page, context }) => {
  await registerTestUser(page, context);
  const created = await page.request.post("/api/todos", { data: { title: "Presentation" } });
  const todo = await created.json();
  await page.reload();
  const card = page.getByTestId("todo-card").filter({ hasText: "Presentation" });
  await expect(card.getByRole("progressbar")).toHaveCount(0);
  await card.getByRole("button", { name: "▶ Subtasks" }).click();
  const input = card.getByLabel("Subtask title");
  await input.fill("   ");
  await expect(card.getByRole("button", { name: "Add", exact: true })).toBeDisabled();
  let requests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/subtasks")) requests += 1;
  });
  await input.press("Enter");
  expect(requests).toBe(0);
  await addSubtask(page, card, "Create slides", true);
  await addSubtask(page, card, "Rehearse", false);
  await addSubtask(page, card, "Book room", false);
  await expect(card.getByText("0/3 subtasks")).toBeVisible();
  await card.getByRole("checkbox", { name: 'Mark subtask "Create slides" as complete' }).check();
  await expect(card.getByText("1/3 subtasks")).toBeVisible();
  await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "33");
  await expect(card.locator(".subtask-progress-fill")).toHaveCSS("background-color", "rgb(37, 99, 235)");
  await card.getByRole("checkbox", { name: 'Mark subtask "Rehearse" as complete' }).check();
  await card.getByRole("checkbox", { name: 'Mark subtask "Book room" as complete' }).check();
  await expect(card.getByText("3/3 subtasks")).toBeVisible();
  await expect(card.locator(".subtask-progress-fill")).toHaveCSS("background-color", "rgb(22, 163, 74)");
  await expect.poll(async () => (await (await page.request.get(`/api/todos/${todo.id}`)).json())
    .subtasks.every((subtask: { completed: boolean }) => subtask.completed)).toBe(true);
  expect((await (await page.request.get(`/api/todos/${todo.id}`)).json()).completed).toBe(false);
  await card.getByRole("checkbox", { name: 'Mark subtask "Book room" as incomplete' }).uncheck();
  await expect(card.getByText("2/3 subtasks")).toBeVisible();
  const deleted = page.waitForResponse((response) =>
    response.url().includes("/api/subtasks/") && response.request().method() === "DELETE",
  );
  await card.getByRole("button", { name: "Delete subtask Book room" }).click();
  expect((await deleted).status()).toBe(200);
  await expect(card.getByText("2/2 subtasks")).toBeVisible();
  await expect(card.locator(".subtask-progress-fill")).toHaveCSS("background-color", "rgb(22, 163, 74)");
  await card.getByRole("button", { name: "▼ Subtasks" }).click();
  await expect(card.getByText("2/2 subtasks")).toBeVisible();
  await expect(card.getByText("Create slides", { exact: true })).toHaveCount(0);
  await page.getByLabel("Search todos and subtasks").fill("slides");
  await expect(card).toBeVisible();
  await page.getByLabel("Search todos and subtasks").fill("not present");
  await expect(card).toHaveCount(0);
  await page.getByLabel("Search todos and subtasks").fill("");
  await card.getByRole("button", { name: "▶ Subtasks" }).click();
  await card.getByRole("checkbox", { name: 'Mark subtask "Rehearse" as incomplete' }).uncheck();
  await expect.poll(async () => (await (await page.request.get(`/api/todos/${todo.id}`)).json())
    .subtasks.map((subtask: { completed: boolean }) => subtask.completed)).toEqual([true, false]);
  const saved = await (await page.request.get(`/api/todos/${todo.id}`)).json();
  const survivingId = saved.subtasks[0].id;
  const completed = page.waitForResponse((response) =>
    response.url().endsWith(`/api/todos/${todo.id}`) && response.request().method() === "PUT",
  );
  await card.getByRole("checkbox", { name: 'Mark "Presentation" as complete' }).click();
  expect((await completed).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Completed (1)" })).toBeVisible();
  const parent = await (await page.request.get(`/api/todos/${todo.id}`)).json();
  expect(parent.subtasks.map((subtask: { completed: boolean }) => subtask.completed)).toEqual([true, false]);
  await page.getByRole("button", { name: "Delete Presentation" }).click();
  await expect(page.getByText("Presentation", { exact: true })).toHaveCount(0);
  await expect.poll(async () => (await page.request.put(`/api/subtasks/${survivingId}`, {
    data: { completed: false },
  })).status()).toBe(404);
});

test("combines subtask search with priority filtering", async ({ page, context }) => {
  await registerTestUser(page, context);
  const high = await (await page.request.post("/api/todos", { data: { title: "High task", priority: "high" } })).json();
  const low = await (await page.request.post("/api/todos", { data: { title: "Low task", priority: "low" } })).json();
  await page.request.post(`/api/todos/${high.id}/subtasks`, { data: { title: "Shared step" } });
  await page.request.post(`/api/todos/${low.id}/subtasks`, { data: { title: "Shared step" } });
  await page.reload();
  await page.getByLabel("Search todos and subtasks").fill("shared step");
  await expect(page.getByText("High task", { exact: true })).toBeVisible();
  await expect(page.getByText("Low task", { exact: true })).toBeVisible();
  await page.getByLabel("Filter by priority").selectOption("high");
  await expect(page.getByText("High task", { exact: true })).toBeVisible();
  await expect(page.getByText("Low task", { exact: true })).toHaveCount(0);
  await page.getByLabel("Filter by priority").selectOption("low");
  await expect(page.getByText("High task", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Low task", { exact: true })).toBeVisible();
});

test("subtask endpoints respond within the 300ms target", async ({ page, context }) => {
  await registerTestUser(page, context);
  const todo = await (await page.request.post("/api/todos", { data: { title: "Timing" } })).json();
  const warm = await (await page.request.post(`/api/todos/${todo.id}/subtasks`, { data: { title: "Warmup" } })).json();
  await page.request.put(`/api/subtasks/${warm.id}`, { data: { completed: true } });
  await page.request.delete(`/api/subtasks/${warm.id}`);
  for (let index = 0; index < 3; index += 1) {
    let start = performance.now();
    const created = await page.request.post(`/api/todos/${todo.id}/subtasks`, { data: { title: `Timed ${index}` } });
    expect(created.status()).toBe(201);
    expect(performance.now() - start).toBeLessThan(300);
    const subtask = await created.json();
    start = performance.now();
    const updated = await page.request.put(`/api/subtasks/${subtask.id}`, { data: { completed: true } });
    expect(updated.status()).toBe(200);
    expect(performance.now() - start).toBeLessThan(300);
    start = performance.now();
    const deleted = await page.request.delete(`/api/subtasks/${subtask.id}`);
    expect(deleted.status()).toBe(200);
    expect(performance.now() - start).toBeLessThan(300);
  }
});

test("validates and scopes subtask mutations while preserving positions", async ({ page, context, browser }) => {
  expect((await page.request.post("/api/todos/1/subtasks", { data: { title: "x" } })).status()).toBe(401);
  expect((await page.request.put("/api/subtasks/1", { data: { completed: true } })).status()).toBe(401);
  expect((await page.request.delete("/api/subtasks/1")).status()).toBe(401);
  await registerTestUser(page, context);
  const todo = await (await page.request.post("/api/todos", { data: { title: "API todo" } })).json();
  expect((await page.request.post(`/api/todos/${todo.id}/subtasks`, { data: { title: "  " } })).status()).toBe(400);
  const first = await (await page.request.post(`/api/todos/${todo.id}/subtasks`, { data: { title: " First " } })).json();
  const second = await (await page.request.post(`/api/todos/${todo.id}/subtasks`, { data: { title: "Second" } })).json();
  expect(first).toMatchObject({ title: "First", position: 0, completed: false });
  expect(second.position).toBe(1);
  expect((await page.request.put(`/api/subtasks/${second.id}`, { data: { title: " " } })).status()).toBe(400);
  expect((await page.request.put(`/api/subtasks/${second.id}`, { data: { completed: "true" } })).status()).toBe(400);
  expect((await page.request.put(`/api/subtasks/${second.id}`, { data: { title: "Renamed", completed: true } })).status()).toBe(200);
  const otherContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const other = await otherContext.newPage();
    await registerTestUser(other, otherContext);
    expect((await other.request.post(`/api/todos/${todo.id}/subtasks`, { data: { title: "Stolen" } })).status()).toBe(404);
    expect((await other.request.put(`/api/subtasks/${second.id}`, { data: { completed: false } })).status()).toBe(404);
    expect((await other.request.delete(`/api/subtasks/${second.id}`)).status()).toBe(404);
  } finally {
    await otherContext.close();
  }
  expect((await page.request.delete(`/api/subtasks/${first.id}`)).status()).toBe(200);
  const third = await (await page.request.post(`/api/todos/${todo.id}/subtasks`, { data: { title: "Third" } })).json();
  expect(third.position).toBe(2);
  const saved = await (await page.request.get(`/api/todos/${todo.id}`)).json();
  expect(saved.subtasks.map((item: { position: number }) => item.position)).toEqual([1, 2]);
  expect((await page.request.delete(`/api/todos/${todo.id}`)).status()).toBe(200);
  expect((await page.request.delete(`/api/subtasks/${second.id}`)).status()).toBe(404);
});

test("rapid toggles update immediately and persist the last choice", async ({ page, context }) => {
  await registerTestUser(page, context);
  const todo = await (await page.request.post("/api/todos", { data: { title: "Rapid" } })).json();
  const subtask = await (await page.request.post(`/api/todos/${todo.id}/subtasks`, { data: { title: "Step" } })).json();
  await page.reload();
  const card = page.getByTestId("todo-card").filter({ hasText: "Rapid" });
  await card.getByRole("button", { name: "▶ Subtasks" }).click();
  let release = () => {};
  let started = () => {};
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const firstStarted = new Promise<void>((resolve) => { started = resolve; });
  let calls = 0;
  await page.route(`**/api/subtasks/${subtask.id}`, async (route) => {
    if (route.request().method() === "PUT" && ++calls === 1) {
      started();
      await blocked;
    }
    await route.continue();
  });
  await card.getByRole("checkbox", { name: 'Mark subtask "Step" as complete' }).click();
  await firstStarted;
  await expect(card.getByText("1/1 subtasks")).toBeVisible();
  await card.getByRole("checkbox", { name: 'Mark subtask "Step" as incomplete' }).uncheck();
  await expect(card.getByText("0/1 subtasks")).toBeVisible();
  await card.getByRole("checkbox", { name: 'Mark "Rapid" as complete' }).click();
  await expect(page.getByRole("heading", { name: "Completed (1)" })).toBeVisible();
  await expect(card.getByText("0/1 subtasks")).toBeVisible();
  release();
  await expect.poll(async () => {
    const current = await (await page.request.get(`/api/todos/${todo.id}`)).json();
    return calls >= 2 && current.subtasks[0].completed === false;
  }).toBe(true);
});

test("does not start queued subtask updates after deleting the parent", async ({ page, context }) => {
  await registerTestUser(page, context);
  const todo = await (await page.request.post("/api/todos", { data: { title: "Delete parent" } })).json();
  const subtask = await (await page.request.post(`/api/todos/${todo.id}/subtasks`, { data: { title: "Step" } })).json();
  await page.reload();
  const card = page.getByTestId("todo-card").filter({ hasText: "Delete parent" });
  await card.getByRole("button", { name: "▶ Subtasks" }).click();
  let release = () => {};
  let started = () => {};
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const firstStarted = new Promise<void>((resolve) => { started = resolve; });
  let calls = 0;
  await page.route(`**/api/subtasks/${subtask.id}`, async (route) => {
    if (route.request().method() === "PUT" && ++calls === 1) {
      started();
      await blocked;
    }
    await route.continue();
  });
  await card.getByRole("checkbox", { name: 'Mark subtask "Step" as complete' }).check();
  await firstStarted;
  await card.getByRole("checkbox", { name: 'Mark subtask "Step" as incomplete' }).uncheck();
  const deleted = page.waitForResponse((response) =>
    response.url().endsWith(`/api/todos/${todo.id}`) && response.request().method() === "DELETE",
  );
  await card.getByRole("button", { name: "Delete Delete parent" }).click();
  expect((await deleted).status()).toBe(200);
  const firstResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/subtasks/${subtask.id}`) && response.request().method() === "PUT",
  );
  release();
  expect((await firstResponse).status()).toBe(404);
  await expect(card).toHaveCount(0);
  expect(calls).toBe(1);
});

test("rolls back a failed subtask update and shows the error", async ({ page, context }) => {
  await registerTestUser(page, context);
  const todo = await (await page.request.post("/api/todos", { data: { title: "Failure" } })).json();
  const subtask = await (await page.request.post(`/api/todos/${todo.id}/subtasks`, { data: { title: "Step" } })).json();
  await page.reload();
  const card = page.getByTestId("todo-card").filter({ hasText: "Failure" });
  await card.getByRole("button", { name: "▶ Subtasks" }).click();
  await page.route(`**/api/subtasks/${subtask.id}`, (route) => route.fulfill({
    status: 500, contentType: "application/json", body: JSON.stringify({ error: "Update failed" }),
  }));
  await card.getByRole("checkbox", { name: 'Mark subtask "Step" as complete' }).check();
  await expect(page.getByRole("alert").filter({ hasText: "Update failed" })).toBeVisible();
  await expect(card.getByRole("checkbox", { name: 'Mark subtask "Step" as complete' })).not.toBeChecked();
});
