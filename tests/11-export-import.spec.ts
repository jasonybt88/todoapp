import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { registerTestUser } from "./helpers";

function exportPayload(title: string) {
  return {
    version: 1,
    exported_at: "2026-03-01T10:00:00.000Z",
    todos: [
      {
        title,
        completed: false,
        due_date: null,
        priority: "high",
        is_recurring: false,
        recurrence_pattern: null,
        reminder_minutes: null,
        created_at: "2026-03-01T10:00:00.000Z",
        subtasks: [
          { title: "Imported child", completed: true, position: 7 },
        ],
        tags: [{ name: "Work", color: "#123456" }],
      },
    ],
  };
}

async function uploadPayload(
  page: import("@playwright/test").Page,
  payload: unknown,
  name = "todos.json",
) {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}

test("downloads dated JSON and RFC 4180 CSV with nested relationships", async ({
  page,
  context,
}) => {
  await registerTestUser(page, context);
  const created = await page.request.post("/api/todos", {
    data: { title: 'Buy milk, eggs, "bread"\nand more' },
  });
  expect(created.status()).toBe(201);
  const todo = (await created.json()) as { id: number };
  const subtask = await page.request.post(`/api/todos/${todo.id}/subtasks`, {
    data: { title: "Check list" },
  });
  expect(subtask.status()).toBe(201);
  const taggedTodo = await page.request.post("/api/todos/import", {
    data: exportPayload("Tag source"),
  });
  expect(taggedTodo.status()).toBe(200);

  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export JSON" }).click(),
  ]);
  expect(jsonDownload.suggestedFilename()).toMatch(/^todos-\d{4}-\d{2}-\d{2}\.json$/);
  const jsonPath = await jsonDownload.path();
  if (!jsonPath) throw new Error("JSON download path was unavailable");
  const exported = JSON.parse(await readFile(jsonPath, "utf8")) as {
    version: number;
    todos: Array<{ title: string; subtasks: unknown[]; tags: unknown[] }>;
  };
  expect(exported.version).toBe(1);
  expect(exported.todos).toHaveLength(2);
  expect(exported.todos.find((item) => item.title === "Tag source")?.tags).toHaveLength(1);
  expect(exported.todos.find((item) => item.title.includes("Buy milk"))?.subtasks).toHaveLength(1);

  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export CSV" }).click(),
  ]);
  expect(csvDownload.suggestedFilename()).toMatch(/^todos-\d{4}-\d{2}-\d{2}\.csv$/);
  const csvPath = await csvDownload.path();
  if (!csvPath) throw new Error("CSV download path was unavailable");
  const csv = await readFile(csvPath, "utf8");
  expect(csv.split("\r\n")[0]).toBe(
    "ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder",
  );
  expect(csv).toContain('"Buy milk, eggs, ""bread""');
});

test("imports exported data, preserves relationships, and creates duplicates on repeat", async ({
  page,
  context,
}) => {
  await registerTestUser(page, context);
  const payload = exportPayload("Imported project");

  await uploadPayload(page, payload);
  await expect(page.getByRole("status")).toContainText("Successfully imported 1 todos");
  const firstResponse = await page.request.get("/api/todos");
  const firstTodos = (await firstResponse.json()) as Array<{
    id: number;
    title: string;
    subtasks: Array<{ id: number; title: string; completed: boolean; position: number }>;
    tags: Array<{ id: number; name: string; color: string }>;
  }>;
  expect(firstTodos).toHaveLength(1);
  expect(firstTodos[0].subtasks).toEqual([
    expect.objectContaining({ title: "Imported child", completed: true, position: 0 }),
  ]);
  expect(firstTodos[0].tags).toEqual([
    expect.objectContaining({ name: "Work", color: "#123456" }),
  ]);
  const originalId = firstTodos[0].id;
  const originalSubtaskId = firstTodos[0].subtasks[0].id;
  const originalTagId = firstTodos[0].tags[0].id;

  const exportedResponse = await page.request.get("/api/todos/export?format=json");
  expect(exportedResponse.status()).toBe(200);
  const exportedPayload = await exportedResponse.json();
  const deleted = await page.request.delete(`/api/todos/${originalId}`);
  expect(deleted.status()).toBe(200);
  expect(await page.request.get("/api/todos").then((response) => response.json())).toEqual([]);

  await uploadPayload(page, exportedPayload);
  await expect(page.getByRole("status")).toContainText("Successfully imported 1 todos");
  const restoredTodos = (await (await page.request.get("/api/todos")).json()) as typeof firstTodos;
  expect(restoredTodos).toHaveLength(1);
  expect(restoredTodos[0].id).not.toBe(originalId);
  expect(restoredTodos[0].subtasks[0].id).not.toBe(originalSubtaskId);
  expect(restoredTodos[0].tags[0].id).toBe(originalTagId);

  await uploadPayload(page, exportedPayload);
  await expect(page.getByRole("status")).toContainText("Successfully imported 1 todos");
  const duplicatedTodos = (await (await page.request.get("/api/todos")).json()) as typeof firstTodos;
  expect(duplicatedTodos).toHaveLength(2);
  expect(new Set(duplicatedTodos.map((todo) => todo.id)).size).toBe(2);
  expect(duplicatedTodos.every((todo) => todo.tags[0].id === originalTagId)).toBe(true);
});

test("reports invalid JSON and invalid export structures without writing data", async ({
  page,
  context,
}) => {
  await registerTestUser(page, context);

  await page.locator('input[type="file"]').setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("not JSON"),
  });
  await expect(page.getByText("Invalid JSON format", { exact: true })).toBeVisible();

  await uploadPayload(page, { version: 1, exported_at: "today" });
  await expect(page.getByText(
    "Failed to import todos. Please check the file format.",
    { exact: true },
  )).toBeVisible();
  expect(await page.request.get("/api/todos").then((response) => response.json())).toEqual([]);

  await uploadPayload(page, {
    version: 1,
    exported_at: "2026-03-01T10:00:00.000Z",
    todos: [],
  });
  await expect(page.getByRole("status")).toContainText("Successfully imported 0 todos");
  expect(await page.request.get("/api/todos").then((response) => response.json())).toEqual([]);
});

test("protects export and import endpoints", async ({ page }) => {
  const jsonExport = await page.request.get("/api/todos/export?format=json");
  const csvExport = await page.request.get("/api/todos/export?format=csv");
  const importResult = await page.request.post("/api/todos/import", {
    data: exportPayload("Unauthorized"),
  });

  expect(jsonExport.status()).toBe(401);
  expect(csvExport.status()).toBe(401);
  expect(importResult.status()).toBe(401);
});
