import { expect, test } from "@playwright/test";
import { createTodo, registerTestUser } from "./helpers";

test("saves a todo as a template and quick-uses a fresh copy", async ({ page, context }) => {
  await registerTestUser(page, context);
  await page.getByLabel("Todo title").fill("Plan project review");
  await page.getByLabel("Priority", { exact: true }).selectOption("high");
  await page
    .getByLabel("Due date and time (Singapore)")
    .fill(
      new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Singapore",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .format(new Date(Date.now() + 2 * 60 * 60 * 1000))
        .replace(" ", "T"),
    );
  await page.getByLabel("Repeat").check();
  await page.getByLabel("Recurrence pattern").selectOption("weekly");
  await page.getByLabel("Reminder").selectOption("30");
  await page.getByRole("button", { name: "Save as template", exact: true }).click();

  const saveDialog = page.getByRole("dialog", { name: "Save as template" });
  await saveDialog.getByLabel("Template name").fill("Project review");
  await saveDialog.getByRole("button", { name: "Add checklist item" }).click();
  await saveDialog.getByLabel("Checklist item 1", { exact: true }).fill("Review milestones");
  await saveDialog.getByRole("button", { name: "Add checklist item" }).click();
  await saveDialog.getByLabel("Checklist item 2", { exact: true }).fill("Assign follow-ups");
  await saveDialog.getByRole("button", { name: "Save template" }).click();
  await expect(saveDialog).toHaveCount(0);

  const templatesResponse = await page.request.get("/api/templates");
  expect(templatesResponse.status()).toBe(200);
  const templates = await templatesResponse.json();
  expect(templates).toHaveLength(1);
  const template = templates[0];
  expect(template).toMatchObject({
    name: "Project review",
    title_template: "Plan project review",
    priority: "high",
    is_recurring: true,
    recurrence_pattern: "weekly",
    reminder_minutes: 30,
  });

  const beforeUse = Date.now();
  await page.getByLabel("Use a template").selectOption(String(template.id));
  await expect(page.getByTestId("todo-card").filter({ hasText: "Plan project review" })).toHaveCount(1);
  const todosResponse = await page.request.get("/api/todos");
  const todos = await todosResponse.json();
  expect(todos).toHaveLength(1);
  const created = todos[0];
  expect(created).toMatchObject({
    title: "Plan project review",
    priority: "high",
    is_recurring: true,
    recurrence_pattern: "weekly",
    reminder_minutes: 30,
    subtasks: [
      { title: "Review milestones", completed: false, position: 0 },
      { title: "Assign follow-ups", completed: false, position: 1 },
    ],
  });
  expect(new Date(created.due_date).getTime()).toBeGreaterThanOrEqual(
    beforeUse + template.due_date_offset_minutes * 60_000,
  );
  expect(new Date(created.due_date).getTime()).toBeLessThanOrEqual(
    Date.now() + template.due_date_offset_minutes * 60_000 + 1000,
  );

  await page.getByRole("button", { name: "Manage templates" }).click();
  const manager = page.getByRole("dialog", { name: "Templates" });
  const card = manager.getByTestId("template-card").filter({ hasText: "Project review" });
  await card.getByRole("button", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit template" });
  await editDialog.getByLabel("Description (optional)").fill("Updated checklist");
  await editDialog.getByRole("button", { name: "Update template" }).click();
  await page.getByRole("button", { name: "Manage templates" }).click();
  await expect(page.getByRole("dialog", { name: "Templates" })).toContainText("Updated checklist");
});

test("validates template fields and keeps all template mutations user-scoped", async ({
  page,
  context,
  browser,
}) => {
  expect((await page.request.get("/api/templates")).status()).toBe(401);
  expect((await page.request.post("/api/templates", { data: {} })).status()).toBe(401);
  expect((await page.request.post("/api/templates/1/use")).status()).toBe(401);
  await registerTestUser(page, context);

  const invalidRecurring = await page.request.post("/api/templates", {
    data: {
      name: "No offset",
      title_template: "No offset",
      is_recurring: true,
      recurrence_pattern: "daily",
    },
  });
  expect(invalidRecurring.status()).toBe(400);

  const invalidReminder = await page.request.post("/api/templates", {
    data: {
      name: "No reminder date",
      title_template: "No reminder date",
      reminder_minutes: 30,
    },
  });
  expect(invalidReminder.status()).toBe(400);

  const response = await page.request.post("/api/templates", {
    data: {
      name: "Planning",
      title_template: "Plan the week",
      due_date_offset_minutes: 60,
      subtasks: [{ title: "Review calendar", position: 0 }],
    },
  });
  expect(response.status()).toBe(201);
  const template = await response.json();

  const otherContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const other = await otherContext.newPage();
    await registerTestUser(other, otherContext);
    expect(await (await other.request.get("/api/templates")).json()).toEqual([]);
    expect((await other.request.put(`/api/templates/${template.id}`, {
      data: { name: "stolen" },
    })).status()).toBe(404);
    expect((await other.request.delete(`/api/templates/${template.id}`)).status()).toBe(404);
    expect((await other.request.post(`/api/templates/${template.id}/use`)).status()).toBe(404);
  } finally {
    await otherContext.close();
  }

  const updated = await page.request.put(`/api/templates/${template.id}`, {
    data: { category: "Personal", subtasks: [] },
  });
  expect(updated.status()).toBe(200);
  expect(await updated.json()).toMatchObject({
    name: "Planning",
    category: "Personal",
    subtasks_json: null,
  });

  const useResponse = await page.request.post(`/api/templates/${template.id}/use`);
  expect(useResponse.status()).toBe(201);
  const todo = await useResponse.json();
  expect(todo.due_date).toBeTruthy();
  expect(todo.subtasks).toEqual([]);

  expect((await page.request.delete(`/api/templates/${template.id}`)).status()).toBe(200);
  expect((await page.request.get(`/api/todos/${todo.id}`)).status()).toBe(200);
  await expect((await page.request.get("/api/templates")).json()).resolves.toEqual([]);
});

test("saves an existing task's ordered subtasks as a template", async ({ page, context }) => {
  await registerTestUser(page, context);
  const todo = await createTodo(page, "Existing checklist", { priority: "low" });
  await page.request.post(`/api/todos/${todo.id}/subtasks`, {
    data: { title: "First step" },
  });
  await page.request.post(`/api/todos/${todo.id}/subtasks`, {
    data: { title: "Second step" },
  });
  await page.reload();
  const card = page.getByTestId("todo-card").filter({ hasText: "Existing checklist" });
  await card.getByRole("button", { name: "Save Existing checklist as template" }).click();
  const dialog = page.getByRole("dialog", { name: "Save as template" });
  await dialog.getByRole("button", { name: "Save template" }).click();
  const templates = await (await page.request.get("/api/templates")).json();
  expect(templates[0]).toMatchObject({
    title_template: "Existing checklist",
    priority: "low",
    subtasks_json: JSON.stringify([
      { title: "First step", position: 0 },
      { title: "Second step", position: 1 },
    ]),
  });
});
