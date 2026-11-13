import { expect, test } from "@playwright/test";
import { registerTestUser } from "./helpers";

test("combines filters, preserves presets and clears immediately", async ({ page, context }) => {
  await registerTestUser(page, context);
  const first = await (await page.request.post("/api/todos", { data: {
    title: "Team meeting", priority: "high", due_date: "2099-01-02T10:00:00+08:00",
  } })).json();
  await page.request.post(`/api/todos/${first.id}/subtasks`, { data: { title: "Prepare slides" } });
  const second = await (await page.request.post("/api/todos", { data: {
    title: "Other meeting", priority: "low", due_date: "2099-01-05T10:00:00+08:00",
  } })).json();
  await page.request.put(`/api/todos/${second.id}`, { data: { completed: true } });
  await page.route("**/api/tags", (route) => route.fulfill({
    json: [{ id: 7, user_id: 1, name: "Work", color: "#123456", created_at: "2026-01-01" }],
  }));
  await page.route("**/api/todos", async (route) => {
    const response = await route.fetch();
    const todos = await response.json();
    await route.fulfill({ response, json: todos.map((todo: { id: number }) => ({
      ...todo, tags: todo.id === first.id
        ? [{ id: 7, user_id: 1, name: "Work", color: "#123456", created_at: "2026-01-01" }] : [],
    })) });
  });
  await page.reload();
  const search = page.getByLabel("Search todos and subtasks");
  await expect(page.getByRole("button", { name: "Clear All" })).toHaveCount(0);
  await search.fill("SLIDES");
  await expect(page.getByText("Other meeting", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Team meeting", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByText("Other meeting", { exact: true })).toBeVisible({ timeout: 250 });
  await search.fill("MEETING");
  await page.getByLabel("Filter by priority").selectOption("high");
  await page.getByLabel("Filter by tag", { exact: true }).selectOption("7");
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByLabel("Completion status").selectOption("incomplete");
  await page.getByLabel("Due date from").fill("2099-01-02");
  await page.getByLabel("Due date to").fill("2099-01-02");
  await expect(page.getByText("Team meeting", { exact: true })).toBeVisible();
  await expect(page.getByText("Other meeting", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Pending (1)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Completed/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Save Filter" }).click();
  const dialog = page.getByRole("dialog", { name: "Save Filter" });
  await expect(dialog).toContainText('Search: "MEETING"');
  await expect(dialog).toContainText("Tag: Work");
  await dialog.getByLabel("Filter name").fill("Daily work");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Clear All" }).click();
  await expect(page.getByText("Other meeting", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Daily work", exact: true }).click();
  await expect(search).toHaveValue("MEETING");
  await expect(page.getByLabel("Filter by priority")).toHaveValue("high");
  await expect(page.getByLabel("Filter by tag", { exact: true })).toHaveValue("7");
  await expect(page.getByLabel("Completion status")).toHaveValue("incomplete");
  await expect(page.getByLabel("Due date from")).toHaveValue("2099-01-02");
  await expect(page.getByLabel("Due date to")).toHaveValue("2099-01-02");
  await expect(page.getByText("Other meeting", { exact: true })).toHaveCount(0);
  page.once("dialog", (confirmation) => confirmation.accept());
  await page.getByRole("button", { name: "Delete preset Daily work" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.getByRole("button", { name: "Daily work", exact: true })).toHaveCount(0);
  await search.fill("not found");
  await expect(page.getByText("No todos match your filters.")).toBeVisible();
});

test("shows a different empty state when no todos exist", async ({ page, context }) => {
  await registerTestUser(page, context);
  await expect(page.getByText("You have no todos yet.")).toBeVisible();
});

test("debounces successive edits for 300ms and clears without delay", async ({ page, context }) => {
  await registerTestUser(page, context);
  await page.request.post("/api/todos", { data: { title: "Alpha" } });
  await page.request.post("/api/todos", { data: { title: "Beta" } });
  await page.reload();
  await expect(page.getByText("Beta", { exact: true })).toBeVisible();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  const search = page.getByLabel("Search todos and subtasks");
  await search.fill("Beta");
  await page.clock.runFor(200);
  await search.fill("Alpha");
  await page.clock.runFor(299);
  await expect(page.getByText("Beta", { exact: true })).toBeVisible();
  await page.clock.runFor(1);
  await expect(page.getByText("Beta", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByText("Beta", { exact: true })).toBeVisible();
});

test("reports a storage quota failure inside the save dialog", async ({ page, context }) => {
  await registerTestUser(page, context);
  await page.getByLabel("Search todos and subtasks").fill("work");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
  });
  await page.getByRole("button", { name: "Save Filter" }).click();
  const dialog = page.getByRole("dialog", { name: "Save Filter" });
  await dialog.getByLabel("Filter name").fill("Work");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Could not save preset — storage full.");
});

test("handles malformed saved data and a preset with an unavailable tag", async ({ page, context }) => {
  await registerTestUser(page, context);
  await page.evaluate(() => localStorage.setItem("todo-app:filter-presets", "{broken"));
  await page.reload();
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.getByLabel("Completion status")).toBeVisible();
  await page.evaluate(() => localStorage.setItem("todo-app:filter-presets", JSON.stringify([{
    id: "missing", name: "Old tag", createdAt: "2026-01-01",
    filters: { search: "work", priority: "all", tagId: 7, completion: "all",
      dueDateFrom: null, dueDateTo: null },
  }])));
  await page.reload();
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Old tag", exact: true }).click();
  await expect(page.getByLabel("Search todos and subtasks")).toHaveValue("work");
  await expect(page.getByText("The preset's tag is unavailable; showing all tags.")).toBeVisible();
});
