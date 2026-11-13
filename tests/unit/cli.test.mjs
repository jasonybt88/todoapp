import assert from "node:assert/strict";
import test from "node:test";
import { createTodoClient } from "../../cli/client.mjs";
import { executeCommand, parseCommand } from "../../cli/todo.mjs";

test("CLI client uses the shared todo routes and session cookie", async () => {
  const requests = [];
  const client = createTodoClient({
    baseUrl: "https://todo.example",
    sessionToken: "session-token",
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return new Response(JSON.stringify({ id: 8, title: "Test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  await client.update(8, { completed: true });

  assert.equal(requests[0].url, "https://todo.example/api/todos/8");
  assert.equal(requests[0].options.method, "PUT");
  assert.equal(requests[0].options.headers.Cookie, "auth_session=session-token");
  assert.deepEqual(JSON.parse(requests[0].options.body), { completed: true });
});

test("CLI client reports API errors and requires an explicit session token", async () => {
  assert.throws(
    () => createTodoClient({ sessionToken: "" }),
    /TODOAPP_SESSION_TOKEN/,
  );
  const client = createTodoClient({
    sessionToken: "token",
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
  });
  await assert.rejects(client.list(), /Not authenticated/);
});

test("CLI commands parse create, update and delete arguments", async () => {
  assert.deepEqual(
    parseCommand([
      "create",
      "Test task",
      "--priority",
      "high",
      "--due-date",
      "2026-11-14T02:00:00.000Z",
      "--repeat",
      "weekly",
    ]),
    {
      command: "create",
      input: {
        title: "Test task",
        priority: "high",
        due_date: "2026-11-14T02:00:00.000Z",
        is_recurring: true,
        recurrence_pattern: "weekly",
      },
    },
  );
  assert.deepEqual(
    parseCommand(["update", "12", "--completed", "true", "--due-date", "none"]),
    {
      command: "update",
      id: "12",
      input: { completed: true, due_date: null },
    },
  );

  const result = await executeCommand(
    parseCommand(["delete", "12"]),
    { delete: async (id) => ({ success: id === "12" }) },
  );
  assert.deepEqual(result, { success: true });
});

test("CLI forwards priority updates and reports API validation errors", async () => {
  const requests = [];
  const client = createTodoClient({
    baseUrl: "https://todo.example",
    sessionToken: "session-token",
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return new Response(JSON.stringify({ id: 12, priority: "low" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  await executeCommand(
    parseCommand(["update", "12", "--priority", "low"]),
    client,
  );
  assert.equal(requests[0].url, "https://todo.example/api/todos/12");
  assert.deepEqual(JSON.parse(requests[0].options.body), { priority: "low" });

  const rejectingClient = createTodoClient({
    sessionToken: "session-token",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: "Invalid priority: urgent. Must be 'high', 'medium', or 'low'.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
  });
  await assert.rejects(
    executeCommand(
      parseCommand(["update", "12", "--priority", "urgent"]),
      rejectingClient,
    ),
    /Invalid priority: urgent/,
  );
});

test("CLI recurrence options validate patterns and disable recurrence explicitly", () => {
  assert.throws(
    () => parseCommand(["create", "No date", "--repeat", "daily"]),
    /require --due-date/,
  );
  assert.throws(
    () => parseCommand(["create", "Bad pattern", "--repeat", "fortnightly"]),
    /must be daily, weekly, monthly, or yearly/,
  );
  assert.deepEqual(
    parseCommand(["update", "12", "--no-repeat"]),
    {
      command: "update",
      id: "12",
      input: { is_recurring: false, recurrence_pattern: null },
    },
  );
});

test("CLI template commands validate fields and preserve ordered subtasks", () => {
  assert.deepEqual(
    parseCommand([
      "template",
      "create",
      "Weekly review",
      "--title",
      "Review project",
      "--priority",
      "high",
      "--due-offset-minutes",
      "10080",
      "--repeat",
      "weekly",
      "--subtask",
      "Check milestones",
      "--subtask",
      "Assign owners",
    ]),
    {
      command: "template",
      action: "create",
      input: {
        name: "Weekly review",
        title_template: "Review project",
        priority: "high",
        due_date_offset_minutes: 10080,
        is_recurring: true,
        recurrence_pattern: "weekly",
        subtasks: [
          { title: "Check milestones", position: 0 },
          { title: "Assign owners", position: 1 },
        ],
      },
    },
  );
  assert.deepEqual(
    parseCommand(["template", "update", "12", "--no-repeat", "--clear-subtasks"]),
    {
      command: "template",
      action: "update",
      id: 12,
      input: { is_recurring: false, recurrence_pattern: null, subtasks: [] },
    },
  );
  assert.throws(
    () => parseCommand(["template", "create", "Review", "--title", "Review", "--repeat", "fortnightly"]),
    /must be daily, weekly, monthly, or yearly/,
  );
  assert.throws(
    () => parseCommand(["template", "update", "12", "--due-offset-minutes", "0"]),
    /positive safe integer/,
  );
});

test("CLI template client uses the shared authenticated API routes", async () => {
  const requests = [];
  const client = createTodoClient({
    baseUrl: "https://todo.example",
    sessionToken: "session-token",
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return new Response(JSON.stringify({ id: 7 }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  await client.createTemplate({ name: "Review", title_template: "Review" });
  await client.useTemplate(7);
  assert.equal(requests[0].url, "https://todo.example/api/templates");
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    name: "Review",
    title_template: "Review",
  });
  assert.equal(requests[0].options.headers.Cookie, "auth_session=session-token");
  assert.equal(requests[1].url, "https://todo.example/api/templates/7/use");
  assert.equal(requests[1].options.method, "POST");
});
